-- =============================================================================
-- SCHOOL-HUB — 0009_realtime_notifications.sql
-- Phase 2, communication layer: live chat + in-app notifications.
-- Depends on: 0004_rls.sql (policies), 0007/0008 (hardening). No schema change
-- to any table, so `src/lib/db.types.ts` is unaffected and is NOT regenerated.
--
-- Three things live in here and nothing else:
--
--   1. Realtime  — `messages` and `notifications` join the `supabase_realtime`
--                  publication, with their replica identity pinned and argued
--                  for (section 1).
--   2. Delivery  — `public.enqueue_notification()`, the ONLY writer of
--                  `public.notifications`. SECURITY DEFINER, because 0004
--                  deliberately gives that table no INSERT policy: a browser
--                  must never be able to fabricate a notification for itself
--                  or for anybody else (section 2).
--   3. Triggers  — submit / approve / redo / message-posted (section 3).
--
-- Design rule that runs through all of it: a notification row must be
-- renderable on its own. The bell reads `notifications` and nothing else, so
-- every string it shows (child name, subject name, assignment title, author
-- name, preview) is denormalised into `payload` at write time. That trades a
-- little staleness — renaming a subject does not rewrite old notifications —
-- for a list that costs exactly one query no matter how many rows it holds.
-- =============================================================================


-- =============================================================================
-- 1. Realtime publication membership
--
-- Supabase Realtime tails logical replication of the `supabase_realtime`
-- publication and re-broadcasts each change to subscribed clients, running the
-- table's RLS SELECT policies against the changed record as the subscribing
-- user. Being in the publication is therefore NOT a grant: it decides what
-- Realtime can see, while RLS still decides who receives it.
--
-- Replica identity: DEFAULT (primary key) on both tables, deliberately, not
-- FULL.
--   * INSERT — which is all the UI consumes — always carries the complete new
--     tuple regardless of replica identity, and Realtime checks RLS against
--     that tuple. So FULL buys nothing for the case we actually use.
--   * UPDATE/DELETE with FULL would put the entire PREVIOUS row into the WAL
--     record. Realtime applies RLS to the new record; the old record is not
--     filtered the same way. With FULL, deleting a message would broadcast its
--     body to every subscriber of the table. With DEFAULT the old record is a
--     bare primary key, so the worst case is a leaked uuid.
--   * Neither table is ever UPDATEd in a way the UI needs the old values for
--     (messages.edited_at, notifications.read_at), so DEFAULT costs us nothing.
-- The client subscribes to INSERT only for messages and to INSERT/UPDATE for
-- notifications; see src/lib/realtime/.
-- =============================================================================
do $$
declare
  v_all_tables boolean;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- A real Supabase project already has this publication; a bare Postgres
    -- (the test harness in supabase/test/) does not.
    execute 'create publication supabase_realtime';
  end if;

  select p.puballtables into v_all_tables
    from pg_publication p
   where p.pubname = 'supabase_realtime';

  -- `for all tables` publications cannot take an explicit table list.
  if coalesce(v_all_tables, false) then
    raise notice 'supabase_realtime is FOR ALL TABLES; messages and notifications are already published';
  else
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end;
$$;

-- Stated explicitly even though DEFAULT is the server default: this is the
-- security decision above, written down where it is enforced.
alter table public.messages      replica identity default;
alter table public.notifications replica identity default;

-- `message_reads` is NOT published. Read receipts are per-viewer bookkeeping;
-- broadcasting them would tell one side exactly when the other opened the
-- thread, which nothing in the SPEC asks for.


-- =============================================================================
-- 2. Notification delivery
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2a. No client may INSERT, and no client may rewrite a delivered notification.
--
-- 0004 gives `notifications` SELECT/UPDATE/DELETE policies for the owner and no
-- INSERT policy, so RLS already rejects a client INSERT. Revoking the grant as
-- well makes it a privilege failure BEFORE the policy is consulted — two
-- independent guards, in the style of 0007.
-- -----------------------------------------------------------------------------
revoke insert on public.notifications from authenticated;
revoke insert on public.notifications from anon;

-- The owner keeps UPDATE, but only over `read_at`. Without this a user could
-- take a real notification and rewrite its `type` and `payload` — self-inflicted
-- only, since RLS still confines them to their own rows, but a notification is
-- an audit-ish artefact and "the row you were sent is the row you see" is worth
-- one trigger. Service context (auth.uid() is null) is left alone so migrations
-- and admin scripts are not blocked, exactly as 0003/0007 do.
--
-- `enqueue_notification()` collapses a burst by UPDATEing an existing row, and
-- it runs inside the caller's transaction, so auth.uid() is still the end user
-- there — SECURITY DEFINER changes the executing role, not the JWT GUC. It
-- therefore raises a transaction-local flag around its own write, which this
-- guard honours. PostgREST gives a client no way to run `set_config`, and even
-- if it could the only thing it would unlock is rewriting the payload of a
-- notification addressed to itself.
create or replace function public.notifications_owner_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('schoolhub.notification_writer', true), '') = 'on'
  then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'notifications.user_id cannot be changed' using errcode = '42501';
  end if;
  if new.type is distinct from old.type then
    raise exception 'notifications.type cannot be changed' using errcode = '42501';
  end if;
  if new.payload is distinct from old.payload then
    raise exception 'notifications.payload cannot be changed' using errcode = '42501';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'notifications.created_at cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifications_owner_update_guard on public.notifications;
create trigger trg_notifications_owner_update_guard
  before update on public.notifications
  for each row execute function public.notifications_owner_update_guard();

-- -----------------------------------------------------------------------------
-- 2b. enqueue_notification — the single writer.
--
-- Collapsing: a burst of messages in one thread must not become a column of
-- identical rows in the bell. If the recipient already has an UNREAD row of the
-- same type about the same assignment, created inside `p_collapse_window`, that
-- row is updated instead: payload refreshed to the newest event, `count`
-- accumulated, `created_at` moved to now() so the thread surfaces at the top of
-- a created_at-desc list.
--
-- The window slides on purpose. A drip of one message every few minutes that
-- the user never opens is still ONE unread conversation, and should stay one
-- row saying "4 new messages". As soon as the row is read, the next event
-- starts a fresh one — that is what `read_at is null` buys.
--
-- Returns the id of the row written or updated, or null when there was nobody
-- to notify.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user_id         uuid,
  p_type            text,
  p_payload         jsonb,
  p_collapse_window interval default interval '10 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_payload  jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_user_id is null or p_type is null then
    return null;
  end if;

  -- Only deliver to a real profile. A child who has not redeemed their invite
  -- code has no profile_id, and the FK would raise.
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return null;
  end if;

  if not (v_payload ? 'count') then
    v_payload := v_payload || jsonb_build_object('count', 1);
  end if;

  select n.id
    into v_existing
    from public.notifications n
   where n.user_id = p_user_id
     and n.type = p_type
     and n.read_at is null
     and n.created_at > now() - p_collapse_window
     -- `is not distinct from` so two notifications that are both about no
     -- assignment collapse together as well.
     and (n.payload ->> 'assignment_id') is not distinct from (v_payload ->> 'assignment_id')
   order by n.created_at desc
   limit 1
   for update;

  if v_existing is not null then
    -- Transaction-local; see notifications_owner_update_guard() above.
    perform set_config('schoolhub.notification_writer', 'on', true);
    update public.notifications
       set payload = v_payload || jsonb_build_object(
             'count',
             coalesce(nullif(payload ->> 'count', '')::int, 1)
             + coalesce(nullif(v_payload ->> 'count', '')::int, 1)
           ),
           created_at = now()
     where id = v_existing;
    perform set_config('schoolhub.notification_writer', 'off', true);
    return v_existing;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (p_user_id, p_type, v_payload)
  returning id into v_existing;

  return v_existing;
end;
$$;

comment on function public.enqueue_notification(uuid, text, jsonb, interval) is
  'Sole writer of public.notifications. SECURITY DEFINER; never granted to a client role.';

-- Not callable over PostgREST by anyone. The triggers below reach it because
-- they are themselves SECURITY DEFINER and owned by the same role.
revoke all on function public.enqueue_notification(uuid, text, jsonb, interval) from public;
revoke all on function public.enqueue_notification(uuid, text, jsonb, interval) from anon;
revoke all on function public.enqueue_notification(uuid, text, jsonb, interval) from authenticated;

-- -----------------------------------------------------------------------------
-- 2c. Who are "the parents" of a family?
-- The family owner plus every family_members row with role = 'parent'.
-- Helpers are deliberately excluded: the helper role is defined in 0010 and
-- notifying it is that migration's call to make, not this one's.
-- -----------------------------------------------------------------------------
create or replace function public.family_parent_ids(p_family_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select f.owner_id
    from public.families f
   where f.id = p_family_id
     and f.owner_id is not null
  union
  select fm.user_id
    from public.family_members fm
   where fm.family_id = p_family_id
     and fm.role = 'parent';
$$;

comment on function public.family_parent_ids(uuid) is
  'Auth user ids of the adults who own/parent this family. Used by the notification triggers.';

revoke all on function public.family_parent_ids(uuid) from public;
grant execute on function public.family_parent_ids(uuid) to service_role;


-- =============================================================================
-- 3. Triggers
--
-- Notification types, and who gets them:
--
--   assignment_submitted   child submitted        -> every parent in the family
--   assignment_approved    parent set 'approved'  -> that child
--   assignment_redo        parent set 'redo'      -> that child
--   message_posted         message written        -> the OTHER side of the
--                                                    thread (child -> parents,
--                                                    adult -> child)
--
-- Nobody is ever notified about their own action: every recipient is compared
-- against auth.uid() first. In service context (auth.uid() is null — seeds,
-- migrations, admin scripts) there is no actor to exclude, so everyone on the
-- receiving side is notified; that is what makes supabase/seed.sql produce a
-- realistic bell without a second seed section.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3a. Status changes.
-- AFTER UPDATE, so it observes the row the BEFORE trigger in 0003
-- (assignments_status_guard) has already validated and stamped.
-- -----------------------------------------------------------------------------
create or replace function public.notify_assignment_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_child_name text;
  v_family_id  uuid;
  v_child_user uuid;
  v_subject    text;
  v_payload    jsonb;
  v_recipient  uuid;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status not in ('submitted', 'approved', 'redo') then
    return null;
  end if;

  select c.name, c.family_id, c.profile_id
    into v_child_name, v_family_id, v_child_user
    from public.children c
   where c.id = new.child_id;

  if v_family_id is null then
    return null;
  end if;

  select s.name into v_subject
    from public.subjects s
   where s.id = new.subject_id;

  if new.status = 'submitted' then
    v_payload := jsonb_build_object(
      'v',            1,
      'audience',     'parent',
      'count',        1,
      'assignment_id', new.id,
      'child_id',     new.child_id,
      'child_name',   v_child_name,
      'subject_name', v_subject,
      'title',        left(new.title, 120)
    );

    for v_recipient in
      select u from public.family_parent_ids(v_family_id) as u
    loop
      if v_recipient is distinct from v_actor then
        perform public.enqueue_notification(v_recipient, 'assignment_submitted', v_payload);
      end if;
    end loop;

    return null;
  end if;

  -- approved | redo -> the child whose work it is
  if v_child_user is null or v_child_user is not distinct from v_actor then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'v',            1,
    'audience',     'child',
    'count',        1,
    'assignment_id', new.id,
    'child_id',     new.child_id,
    'child_name',   v_child_name,
    'subject_name', v_subject,
    'title',        left(new.title, 120),
    'preview',      nullif(left(coalesce(new.review_comment, ''), 120), '')
  );

  perform public.enqueue_notification(
    v_child_user,
    case when new.status = 'approved' then 'assignment_approved' else 'assignment_redo' end,
    v_payload
  );

  return null;
end;
$$;

drop trigger if exists trg_assignments_notify_status on public.assignments;
create trigger trg_assignments_notify_status
  after update on public.assignments
  for each row execute function public.notify_assignment_status();

-- -----------------------------------------------------------------------------
-- 3b. Messages.
--
-- "The other side" is literal: a thread has a child side and an adult side.
-- The child's message goes to the parents; an adult's message goes to the
-- child. A second parent is NOT notified when the first parent writes — they
-- can read the thread whenever they like, and a reply between adults is not
-- news for the other adult. Revisit if a family ever complains.
--
-- Lesson-scoped messages (assignment_id null) are skipped: there is no screen
-- for them yet, so a notification would link nowhere.
-- -----------------------------------------------------------------------------
create or replace function public.notify_message_posted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := coalesce(new.author_id, auth.uid());
  v_child_name text;
  v_family_id  uuid;
  v_child_user uuid;
  v_title      text;
  v_subject    text;
  v_actor_name text;
  v_payload    jsonb;
  v_recipient  uuid;
  v_from_child boolean;
begin
  if new.assignment_id is null then
    return null;
  end if;

  select c.name, c.family_id, c.profile_id
    into v_child_name, v_family_id, v_child_user
    from public.children c
   where c.id = new.child_id;

  if v_family_id is null then
    return null;
  end if;

  select a.title, s.name
    into v_title, v_subject
    from public.assignments a
    left join public.subjects s on s.id = a.subject_id
   where a.id = new.assignment_id;

  if v_actor is not null then
    select p.display_name into v_actor_name
      from public.profiles p
     where p.id = v_actor;
  end if;
  -- A child's display_name is their auth-user name; children.name is what the
  -- family actually calls them and what every other screen shows.
  if v_actor is not null and v_actor is not distinct from v_child_user then
    v_actor_name := coalesce(v_child_name, v_actor_name);
  end if;

  v_payload := jsonb_build_object(
    'v',            1,
    'count',        1,
    'assignment_id', new.assignment_id,
    'child_id',     new.child_id,
    'child_name',   v_child_name,
    'subject_name', v_subject,
    'title',        left(coalesce(v_title, ''), 120),
    'actor_name',   v_actor_name,
    'preview',      nullif(left(coalesce(new.body, ''), 120), '')
  );

  v_from_child := (v_actor is not null and v_actor is not distinct from v_child_user);

  if v_from_child then
    -- child -> every parent
    for v_recipient in
      select u from public.family_parent_ids(v_family_id) as u
    loop
      if v_recipient is distinct from v_actor then
        perform public.enqueue_notification(
          v_recipient,
          'message_posted',
          v_payload || jsonb_build_object('audience', 'parent')
        );
      end if;
    end loop;
    return null;
  end if;

  -- adult (or service context) -> the child
  if v_child_user is null or v_child_user is not distinct from v_actor then
    return null;
  end if;

  perform public.enqueue_notification(
    v_child_user,
    'message_posted',
    v_payload || jsonb_build_object('audience', 'child')
  );

  return null;
end;
$$;

drop trigger if exists trg_messages_notify on public.messages;
create trigger trg_messages_notify
  after insert on public.messages
  for each row execute function public.notify_message_posted();


-- =============================================================================
-- 4. Index supporting the collapse lookup and the bell's own query.
-- The partial index from 0002 is (user_id, created_at desc) where read_at is
-- null, which the collapse lookup already uses; this one covers the bell's
-- "newest 20 of mine, read or not".
-- =============================================================================
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
