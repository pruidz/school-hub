-- =============================================================================
-- SCHOOL-HUB — 0010_helper_role.sql
-- The helper role, completed. Depends on: 0004_rls.sql, 0005_storage.sql,
-- 0007_privilege_hardening.sql, 0008_sibling_identity_scope.sql.
--
-- A helper is an adult the parent trusts with ONE child's homework: a
-- grandparent, a tutor, a second parent who does not run the family. SPEC
-- section 1 promises "the parent sends an email invitation, picks which child
-- and with what right (view / view + comment)". 0004 only scaffolded that: it
-- gave `is_helper()` a family-wide SELECT on messages and 0005 gave the same
-- role a family-wide SELECT on every evidence object. Family-wide is exactly
-- what a helper must not have, and neither scaffold said anything about the
-- other fifteen tables.
--
-- What this migration settles.
--
--   scope     Per child, from an EXPLICIT list in `family_members.permissions`.
--             0003's `can_review()` treated an absent list as "every child in
--             the family" — a fail-OPEN default in the one place that decides
--             who may mark a child's homework done. Here the list is required:
--             no array, no access, for viewing and for reviewing alike.
--
--   rights    view      — always, for the listed children only
--             comment   — optional, `permissions.can_comment`
--             review    — optional, `permissions.can_review`, OFF by default
--
--   never     children (the row itself, so never `invite_code`, `pin_hash`,
--             `pin_attempts`, `pin_locked_until`, `ui_mode`, `show_own_stats`),
--             grades, topic_mastery, families, other family_members rows,
--             any INSERT/UPDATE/DELETE on subjects, topics, schedule_slots,
--             lessons, assignments-except-a-review-decision, attachments, or
--             any write at all to storage.
--
--   revoke    `permissions.revoked_at` on the membership row. Every function
--             below treats a stamped row as if it were not there, so access
--             stops on the next statement. The row itself stays, and so do the
--             helper's messages and their author's name — removing someone
--             must not delete their words or turn them into "unknown".
--
-- `permissions` jsonb for a helper membership:
--
--     {
--       "children":   ["<child uuid>", ...],   -- required, explicit, non-empty
--       "can_comment": true | false,
--       "can_review":  true | false,           -- default false
--       "revoked_at":  "<timestamptz>"         -- absent while active
--     }
--
-- Nothing here touches the child-side or parent-side policies, so the 0007 and
-- 0008 guarantees are unchanged; sections 2 and 9 re-state why a helper cannot
-- be used as a lever against either.
-- =============================================================================

-- =============================================================================
-- 1. Scope functions
--
-- All SECURITY DEFINER + STABLE, like every helper in 0003: a policy on table X
-- must be able to look into family_members without tripping its own RLS.
-- All of them are keyed on auth.uid() alone — none takes a caller-supplied user
-- id, so none can be pointed at somebody else.
-- =============================================================================

-- Truthiness of a permissions flag, spelled the same way everywhere.
create or replace function public.jsonb_flag(p_permissions jsonb, p_flag text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_permissions ->> p_flag, 'false'))
         in ('true', 't', '1', 'yes');
$$;

comment on function public.jsonb_flag(jsonb, text) is
  'Reads a boolean-ish flag out of a permissions jsonb. Absent or unparseable => false.';

-- The children a helper is assigned to, as real rows.
--
-- The join back to `children` is deliberate: an id left behind in the jsonb
-- after the child was deleted, or moved to another family, resolves to nothing.
-- The list is the parent's statement of intent; the join is what makes it true.
create or replace function public.helper_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct c.id
    from public.family_members fm
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(fm.permissions -> 'children') = 'array'
          then fm.permissions -> 'children'
        else '[]'::jsonb
      end
    ) as listed(child_id)
    join public.children c
      on c.id = public.try_uuid(listed.child_id)
     and c.family_id = fm.family_id
   where fm.user_id = auth.uid()
     and fm.role = 'helper'
     and fm.permissions ->> 'revoked_at' is null;
$$;

comment on function public.helper_child_ids() is
  'Children the calling helper is assigned to. Empty for anyone else, and empty once the membership is revoked.';

-- One predicate for "the caller is an active helper for this child".
-- `is_helper()` (profiles.role) AND the membership row must agree; an account
-- that is a parent somewhere else does not get helper powers here by holding a
-- helper membership, and vice versa.
create or replace function public.helper_sees_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_helper()
     and p_child_id is not null
     and p_child_id in (select public.helper_child_ids());
$$;

comment on function public.helper_sees_child(uuid) is
  'True when the caller is an active helper assigned to this child. The single read predicate for every helper policy.';

create or replace function public.helper_can_comment(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_helper()
     and exists (
       select 1
         from public.family_members fm
         join public.children c
           on c.family_id = fm.family_id
          and c.id = p_child_id
        where fm.user_id = auth.uid()
          and fm.role = 'helper'
          and fm.permissions ->> 'revoked_at' is null
          and public.jsonb_flag(fm.permissions, 'can_comment')
          and jsonb_typeof(fm.permissions -> 'children') = 'array'
          and (fm.permissions -> 'children') ? (p_child_id::text)
     );
$$;

comment on function public.helper_can_comment(uuid) is
  'True when the caller is an active helper allowed to post messages for this child.';

-- -----------------------------------------------------------------------------
-- can_review(), fail-closed.
--
-- Three changes to the 0003 version, parent behaviour untouched:
--   a) the "no children array means every child" fallback is gone. An explicit
--      array containing this child is now required.
--   b) a revoked membership grants nothing.
--   c) the helper branch additionally requires profiles.role = 'helper', so
--      "who is a helper" has exactly one answer across the whole schema.
-- -----------------------------------------------------------------------------
create or replace function public.can_review(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.children c
      join public.families f on f.id = c.family_id
     where c.id = p_child_id
       and f.owner_id = auth.uid()
  )
  or exists (
    select 1
      from public.children c
      join public.family_members fm on fm.family_id = c.family_id
     where c.id = p_child_id
       and fm.user_id = auth.uid()
       and fm.role = 'parent'
  )
  or (
    public.is_helper()
    and exists (
      select 1
        from public.children c
        join public.family_members fm on fm.family_id = c.family_id
       where c.id = p_child_id
         and fm.user_id = auth.uid()
         and fm.role = 'helper'
         and fm.permissions ->> 'revoked_at' is null
         and public.jsonb_flag(fm.permissions, 'can_review')
         and jsonb_typeof(fm.permissions -> 'children') = 'array'
         and (fm.permissions -> 'children') ? (p_child_id::text)
    )
  );
$$;

comment on function public.can_review(uuid) is
  'True when the caller may approve/return this child''s work: the family owner, a parent member, or an active helper explicitly granted can_review for this child.';

do $$
declare
  fn text;
  fns text[] := array[
    'public.jsonb_flag(jsonb, text)',
    'public.helper_child_ids()',
    'public.helper_sees_child(uuid)',
    'public.helper_can_comment(uuid)',
    'public.can_review(uuid)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;

-- =============================================================================
-- 2. children: a helper reads a VIEW, never the table
--
-- A helper needs a name, a colour and an avatar to render "Nika's homework".
-- The same row also carries `invite_code` — which redeems into the child's own
-- account — and `pin_hash`, `pin_attempts`, `pin_locked_until`, `ui_mode` and
-- `show_own_stats`. RLS is row-level: a SELECT policy on `children` hands over
-- whole rows, and a column-level GRANT cannot help because parent and helper
-- are both the single Postgres role `authenticated`.
--
-- So the helper gets no policy on `public.children` at all, and a view that
-- does not mention the sensitive columns anywhere. Deliberately NOT
-- `security_invoker`: the view runs as its owner, which is the only way it can
-- read a table the caller has no policy on. Its own WHERE clause is the whole
-- access rule, and `helper_child_ids()` is empty for everyone who is not an
-- active helper, so a parent or a child selecting from this view gets nothing.
-- =============================================================================
drop view if exists public.helper_children;
create view public.helper_children
with (security_barrier = true) as
  select
    c.id,
    c.family_id,
    c.name,
    c.grade,
    c.school,
    c.birth_date,
    c.avatar_url,
    c.color,
    c.is_active
  from public.children c
  where c.id in (select public.helper_child_ids());

comment on view public.helper_children is
  'The children the calling helper is assigned to, without invite_code, pin_hash, pin_attempts, pin_locked_until, ui_mode or show_own_stats. Empty for every other caller.';

revoke all on public.helper_children from public;
revoke all on public.helper_children from anon;
grant select on public.helper_children to authenticated, service_role;

-- =============================================================================
-- 3. helper_invitations
--
-- An adult with their own email and password, so not the child flow: no PIN,
-- no 6-character code typed on a phone. A row here is a pending offer; on
-- acceptance it becomes a `family_members` row and the invitation is stamped.
--
-- The token is stored as issued rather than hashed, for the same reason
-- `children.invite_code` is: sending email is out of scope, so the parent has
-- to be able to re-open the page and copy the link again. It is 160+ bits of
-- CSPRNG output, single-use, expiring, and readable only by the family owner
-- (the redemption path itself runs as service_role, never as `authenticated`).
-- Once real email exists, hash it and show it once.
-- =============================================================================
create table if not exists public.helper_invitations (
  id           uuid        primary key default gen_random_uuid(),
  family_id    uuid        not null references public.families (id) on delete cascade,
  email        text        not null check (length(btrim(email)) between 3 and 320),
  token        text        not null unique
                           check (length(token) between 16 and 64),
  -- cardinality(), not array_length(): array_length('{}', 1) is NULL and a
  -- CHECK that evaluates to NULL passes, so an invitation granting nothing
  -- would slip through. No default either — naming a child is the whole point.
  child_ids    uuid[]      not null
                           check (cardinality(child_ids) between 1 and 50),
  can_comment  boolean     not null default true,
  can_review   boolean     not null default false,
  invited_by   uuid        not null references public.profiles (id) on delete cascade,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid        references public.profiles (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.helper_invitations is
  'Pending helper invitations. One row per offer; accepted/revoked rows are kept as a record.';
comment on column public.helper_invitations.email is
  'Lower-cased address the invitation was issued to. Acceptance requires the signed-in user to hold exactly this address.';
comment on column public.helper_invitations.child_ids is
  'The children this invitation grants. Copied into family_members.permissions.children on acceptance.';

create index if not exists idx_helper_invitations_family
  on public.helper_invitations (family_id, created_at desc);
create index if not exists idx_helper_invitations_email
  on public.helper_invitations (lower(email));

drop trigger if exists trg_helper_invitations_updated_at on public.helper_invitations;
create trigger trg_helper_invitations_updated_at
  before update on public.helper_invitations
  for each row execute function public.set_updated_at();

alter table public.helper_invitations enable row level security;

grant select, insert, update, delete on public.helper_invitations to authenticated;
revoke all on public.helper_invitations from anon;

-- Only the family OWNER manages invitations. Not `is_parent() and family_id =
-- current_family_id()` like the rest of 0004: inviting an adult into the family
-- is an ownership decision, and this keeps a second parent-member from quietly
-- widening the circle.
--
-- There is deliberately no policy for the invitee. They have no membership yet,
-- so no predicate could name them; redemption goes through the service role in
-- `acceptHelperInvitation`, which is also the only place the token is compared.
drop policy if exists helper_invitations_owner_all on public.helper_invitations;
create policy helper_invitations_owner_all on public.helper_invitations
  for all to authenticated
  using (
    public.is_parent()
    and family_id in (select f.id from public.families f where f.owner_id = auth.uid())
  )
  with check (
    public.is_parent()
    and family_id in (select f.id from public.families f where f.owner_id = auth.uid())
    and invited_by = auth.uid()
  );

-- =============================================================================
-- 4. profiles / family_members: a helper is not a directory
--
-- Both policies were last written in 0008, which carved siblings out for a
-- child. The same reasoning applies one step further out for a helper: the
-- grandparent invited for Nika has no business learning that Ana exists, what
-- her auth user id is, or which other adults hold which permissions.
--
-- profiles       self, the family's ADULTS (their display_name renders as the
--                author on every message and assignment_event), and the
--                profiles of the assigned children only.
-- family_members own row only. `requireParent()` reads exactly that row to
--                resolve family_id, so the app is unaffected.
--
-- The 0008 child clauses are reproduced verbatim; re-run 0008 after this file
-- and you lose the helper clauses, exactly as re-running 0004 after 0007 would.
-- =============================================================================

-- Profile ids of the children in the caller's family that the caller is NOT
-- assigned to. Empty unless the caller is a helper.
create or replace function public.helper_unassigned_child_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.profile_id
    from public.family_members fm
    join public.children c on c.family_id = fm.family_id
   where fm.user_id = auth.uid()
     and fm.role = 'helper'
     and c.profile_id is not null
     and c.id not in (select public.helper_child_ids());
$$;

comment on function public.helper_unassigned_child_profile_ids() is
  'Auth user ids of the children a helper is NOT assigned to. Meaningful only when the caller is a helper.';

revoke all on function public.helper_unassigned_child_profile_ids() from public;
grant execute on function public.helper_unassigned_child_profile_ids()
  to authenticated, service_role;

drop policy if exists profiles_select_self_or_family on public.profiles;
create policy profiles_select_self_or_family on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      id in (select public.my_family_user_ids())
      and (
        not public.is_child()
        or id not in (select public.sibling_profile_ids())
      )
      and (
        not public.is_helper()
        or id not in (select public.helper_unassigned_child_profile_ids())
      )
    )
  );

drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      not public.is_helper()
      and family_id = public.current_family_id()
      and (
        not public.is_child()
        or user_id not in (select public.sibling_profile_ids())
      )
    )
  );

-- =============================================================================
-- 5. Read policies, one per table, all keyed on helper_sees_child()
--
-- Every one is SELECT only. There is no helper INSERT/UPDATE/DELETE policy on
-- any of these tables, which is what stops a helper editing the timetable,
-- renaming a subject, inventing a lesson or retitling homework: with no policy
-- the write matches nothing and Postgres refuses it.
--
-- grades and topic_mastery appear nowhere in this file. A helper is told what
-- to supervise, not what the school thinks of the child.
-- =============================================================================
drop policy if exists subjects_helper_select on public.subjects;
create policy subjects_helper_select on public.subjects
  for select to authenticated
  using (public.helper_sees_child(child_id));

drop policy if exists schedule_slots_helper_select on public.schedule_slots;
create policy schedule_slots_helper_select on public.schedule_slots
  for select to authenticated
  using (public.helper_sees_child(child_id));

drop policy if exists lessons_helper_select on public.lessons;
create policy lessons_helper_select on public.lessons
  for select to authenticated
  using (public.helper_sees_child(child_id));

drop policy if exists topics_helper_select on public.topics;
create policy topics_helper_select on public.topics
  for select to authenticated
  using (public.helper_sees_child(public.subject_child_id(subject_id)));

drop policy if exists assignments_helper_select on public.assignments;
create policy assignments_helper_select on public.assignments
  for select to authenticated
  using (public.helper_sees_child(child_id));

drop policy if exists assignment_events_helper_select on public.assignment_events;
create policy assignment_events_helper_select on public.assignment_events
  for select to authenticated
  using (public.helper_sees_child(public.assignment_child_id(assignment_id)));

drop policy if exists attachments_helper_select on public.attachments;
create policy attachments_helper_select on public.attachments
  for select to authenticated
  using (public.helper_sees_child(child_id));

-- =============================================================================
-- 6. messages: the 0004 scaffold, narrowed
--
-- Was: any helper of the family, every child, always allowed to post.
-- Now: the assigned children only, and posting needs `can_comment`.
--
-- A helper may edit their OWN message and nothing else. There is no DELETE
-- policy for them, and none for the parent to delete a helper's message
-- individually either — `messages_parent_all` (0004) already covers the
-- parent's own moderation needs and is out of scope here.
-- =============================================================================
drop policy if exists messages_helper_select on public.messages;
create policy messages_helper_select on public.messages
  for select to authenticated
  using (public.helper_sees_child(child_id));

drop policy if exists messages_helper_insert on public.messages;
create policy messages_helper_insert on public.messages
  for insert to authenticated
  with check (
    public.helper_can_comment(child_id)
    and author_id = auth.uid()
  );

drop policy if exists messages_helper_update_own on public.messages;
create policy messages_helper_update_own on public.messages
  for update to authenticated
  using (public.helper_sees_child(child_id) and author_id = auth.uid())
  with check (public.helper_sees_child(child_id) and author_id = auth.uid());

-- 0007's `resolve_message_child_id()` already overwrites whatever child_id the
-- client sent with the one derived from the assignment, so a helper cannot post
-- into an unassigned child's thread by sending an assigned child's id: the
-- derived value is the other child's, and the WITH CHECK above then fails.

-- =============================================================================
-- 7. assignments: the review decision, and nothing else
--
-- Row scope is the policy below; column scope is the trigger in section 8.
-- Both are needed. The policy cannot say "only these columns", and the trigger
-- alone would let a helper without review rights UPDATE rows in ways the
-- trigger does not inspect.
-- =============================================================================
drop policy if exists assignments_helper_review on public.assignments;
create policy assignments_helper_review on public.assignments
  for update to authenticated
  using (public.is_helper() and public.can_review(child_id))
  with check (public.is_helper() and public.can_review(child_id));

-- =============================================================================
-- 8. assignments_status_guard(), with a helper column lock
--
-- Replaces the 0007 version wholesale. The child branch is reproduced verbatim
-- — this file must not become a way to relax it. What is new is the helper
-- branch: a reviewing helper may move the status and write `review_comment`,
-- and may not touch a single other column. Without it, `assignments_helper_review`
-- would let a helper with review rights rewrite the title, the source reference
-- or the due date of homework the parent set, which is squarely on the
-- "must never" list.
--
-- `reviewed_at` / `reviewed_by` are excluded from the lock because the
-- transition block below stamps them itself, after this check has run.
-- =============================================================================
create or replace function public.assignments_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid    := auth.uid();
  v_service       boolean := (auth.uid() is null);
  v_child_profile uuid;
  v_is_child      boolean;
  v_is_helper     boolean;
  v_can_review    boolean;
  v_transition    text;
  v_comment       text;
begin
  select c.profile_id into v_child_profile
    from public.children c
   where c.id = new.child_id;

  v_is_child   := (v_uid is not null and v_uid is not distinct from v_child_profile);
  v_is_helper  := (not v_service) and public.is_helper();
  v_can_review := (not v_service) and public.can_review(new.child_id);

  -- ---------------------------------------------------------------- ownership
  if new.child_id is distinct from old.child_id and not v_service then
    raise exception 'assignments.child_id cannot be changed'
      using errcode = '42501';
  end if;

  -- ------------------------------------------------------- child column lock
  if v_is_child and not v_can_review then
    -- reviewer-owned columns
    if new.review_comment is distinct from old.review_comment then
      raise exception 'A child may not change review_comment' using errcode = '42501';
    end if;
    if new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'A child may not change reviewed_by' using errcode = '42501';
    end if;
    if new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'A child may not change reviewed_at' using errcode = '42501';
    end if;
    if new.redo_count is distinct from old.redo_count then
      raise exception 'A child may not change redo_count' using errcode = '42501';
    end if;

    -- the assignment as the parent set it. `submitted_at` is checked before the
    -- transition block below stamps it, so handing work in is still allowed.
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.source_ref  is distinct from old.source_ref
       or new.due_date    is distinct from old.due_date
       or new.due_time    is distinct from old.due_time
       or new.subject_id  is distinct from old.subject_id
       or new.topic_id    is distinct from old.topic_id
       or new.lesson_id   is distinct from old.lesson_id
       or new.priority    is distinct from old.priority
       or new.ai_check    is distinct from old.ai_check
       or new.created_by  is distinct from old.created_by
       or new.created_at  is distinct from old.created_at
       or new.submitted_at is distinct from old.submitted_at then
      raise exception 'A child may only change status, self_rating, difficulty_note and minutes_spent'
        using errcode = '42501';
    end if;
  end if;

  -- ------------------------------------------------------ helper column lock
  -- A helper is never the child, so this cannot collide with the branch above.
  if v_is_helper and not v_is_child then
    if new.title is distinct from old.title
       or new.description  is distinct from old.description
       or new.source_ref   is distinct from old.source_ref
       or new.due_date     is distinct from old.due_date
       or new.due_time     is distinct from old.due_time
       or new.subject_id   is distinct from old.subject_id
       or new.topic_id     is distinct from old.topic_id
       or new.lesson_id    is distinct from old.lesson_id
       or new.priority     is distinct from old.priority
       or new.ai_check     is distinct from old.ai_check
       or new.created_by   is distinct from old.created_by
       or new.created_at   is distinct from old.created_at
       or new.submitted_at is distinct from old.submitted_at
       or new.self_rating  is distinct from old.self_rating
       or new.difficulty_note is distinct from old.difficulty_note
       or new.minutes_spent   is distinct from old.minutes_spent
       or new.redo_count      is distinct from old.redo_count then
      raise exception 'A helper may only change status and review_comment'
        using errcode = '42501';
    end if;

    if not v_can_review
       and new.review_comment is distinct from old.review_comment then
      raise exception 'This helper has no review rights for this child'
        using errcode = '42501';
    end if;
  end if;

  -- -------------------------------------------------------------- transition
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_transition := old.status || '->' || new.status;

  if v_transition not in (
       'assigned->in_progress',
       'assigned->submitted',
       'in_progress->submitted',
       'submitted->approved',
       'submitted->redo',
       'redo->in_progress',
       'approved->redo',
       'approved->in_progress'
     ) then
    raise exception 'Illegal assignment status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  -- A helper without review rights has no business moving the status at all.
  -- The child-side transitions below belong to the child; the reviewer-side
  -- ones are already refused further down. This closes the middle: a viewing
  -- helper nudging 'assigned' to 'in_progress' on someone else's behalf.
  if v_is_helper and not v_can_review then
    raise exception 'This helper has no review rights for this child'
      using errcode = '42501';
  end if;

  -- corrections out of an already approved assignment are reviewer-only
  if old.status = 'approved' and not (v_can_review or v_service) then
    raise exception 'Only a parent (or a helper with review rights) may reopen an approved assignment'
      using errcode = '42501';
  end if;

  -- approve / return for redo are reviewer-only
  if new.status in ('approved', 'redo') then
    if not (v_can_review or v_service) then
      raise exception 'Only a parent (or a helper with review rights) may set status to %', new.status
        using errcode = '42501';
    end if;
    new.reviewed_at := now();
    new.reviewed_by := v_uid;
  end if;

  if new.status = 'submitted' then
    new.submitted_at := now();
  end if;

  if old.status = 'redo' and new.status = 'in_progress' then
    new.redo_count := coalesce(old.redo_count, 0) + 1;
  end if;

  -- ------------------------------------------------------------------ audit
  -- On a review decision always record the comment that was in force, even when it
  -- repeats the previous one. Returning the same work twice with the same wording is
  -- exactly the case the audit trail exists to show; de-duplicating it would hide
  -- the second rejection.
  v_comment := case
                 when new.status in ('approved', 'redo')
                   then new.review_comment
                 when new.review_comment is distinct from old.review_comment
                   then new.review_comment
                 else null
               end;

  insert into public.assignment_events
    (assignment_id, actor_id, from_status, to_status, comment)
  values
    (new.id, v_uid, old.status, new.status, v_comment);

  return new;
end;
$$;

drop trigger if exists trg_assignments_status_guard on public.assignments;
create trigger trg_assignments_status_guard
  before update on public.assignments
  for each row execute function public.assignments_status_guard();

-- =============================================================================
-- 9. Storage: look, do not touch
--
-- 0005 gave a helper SELECT on `{any child of the family}/...`. Narrow it to the
-- assigned children. There is still no helper INSERT/UPDATE/DELETE policy on
-- storage.objects, so evidence cannot be planted or quietly removed by someone
-- who is not responsible for the child.
-- =============================================================================
drop policy if exists evidence_helper_select on storage.objects;
create policy evidence_helper_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and public.helper_sees_child(public.storage_child_id(name))
  );

-- =============================================================================
-- 10. Why a helper cannot be used to reopen 0007 or 0008
--
-- 0007 (profiles.role not self-writable): the fix is a column-level REVOKE on
--   `authenticated` plus `trg_profiles_guard_identity`. Both are role-wide and
--   this file grants nothing back, so a helper hits the same
--   "permission denied for table profiles" a child does. A helper therefore
--   cannot promote themselves to parent and inherit `is_parent()`.
--
-- 0008 (a child cannot enumerate a sibling): untouched — the child clauses in
--   section 4 are the 0008 text, and every new predicate in this file starts
--   from `is_helper()`, which is false for a child. The reverse direction is
--   new and handled: section 4 also hides the unassigned children from the
--   helper, so the promise "you were invited for Nika" does not leak Ana.
--
-- Escalation paths a helper might try, and what stops them:
--   widen their own permissions   family_members has no helper UPDATE policy;
--                                 `family_members_update_parent` needs
--                                 is_parent() AND ownership of the family.
--   invite another helper         `helper_invitations_owner_all` needs
--                                 is_parent() AND ownership.
--   create their own family and   `families_insert_parent` needs is_parent().
--     become its parent
--   read the child's invite_code  no policy on public.children for a helper at
--     and take over the account   all; `helper_children` does not select the
--                                 column.
--   approve for an unassigned     `can_review()` requires the id to be in the
--     child                       explicit array of a non-revoked membership.
--   keep access after removal     every function in section 1 filters on
--                                 `revoked_at is null`, and they are STABLE,
--                                 i.e. re-evaluated per statement.
-- =============================================================================
