-- =============================================================================
-- SCHOOL-HUB — 0007_privilege_hardening.sql
-- Closes four privilege holes found in the A5 review. No schema change, so
-- `src/lib/db.types.ts` is unaffected.
-- Depends on: 0004_rls.sql, 0005_storage.sql
--
-- 1. profiles.role was self-writable  -> full parent access for any child
-- 2. messages/attachments trusted the client's child_id -> cross-sibling writes
-- 3. the child column lock on assignments covered only the review fields
-- 4. handle_new_user() read the role out of forgeable user metadata
--
-- NOTE for whoever re-runs the migrations out of order: 0004 hands
-- `authenticated` a table-wide UPDATE on every table, which would undo the
-- column grant in section 1. Run 0007 last, as its number says.
-- =============================================================================

-- =============================================================================
-- 1. profiles.role is not self-writable
--
-- `profiles_update_self` (0004) is a row policy, and a row policy cannot say
-- "every column except this one". Every parent-side RLS predicate in 0004 is
-- `public.is_parent()`, which reads `profiles.role`. A signed-in child could
-- therefore run, from the browser client the app already ships,
--
--     supabase.from('profiles').update({ role: 'parent' }).eq('id', <own id>)
--
-- and from that point `is_parent()` is true for them and
-- `current_family_id()` still resolves to their own family. That combination
-- satisfies `children_parent_all`, `grades_parent_all`, `assignments_parent_all`,
-- `messages_parent_all`, `attachments_parent_all` and `evidence_parent_all`,
-- i.e. read AND write on every sibling's homework, photos, chat and grades,
-- plus their siblings' `pin_hash` and `invite_code`, plus their own
-- `show_own_stats` / `ui_mode` / PIN lockout.
--
-- Two independent guards, because this one must not come back:
--   a) a column-level grant, so the UPDATE never reaches the policy;
--   b) a trigger, so it still fails if the grant is ever widened again.
-- Both let the service role through (auth.uid() is null there), which is how
-- `signupAction` and `redeemInviteCode` set the role in the first place.
-- =============================================================================
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create or replace function public.profiles_guard_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;  -- service role / SQL editor / seed
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role can only be changed by the service role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_identity() is
  'BEFORE UPDATE on profiles: a signed-in user may never change their own id or role.';

drop trigger if exists trg_profiles_guard_identity on public.profiles;
create trigger trg_profiles_guard_identity
  before update on public.profiles
  for each row execute function public.profiles_guard_identity();

-- =============================================================================
-- 2. messages / attachments: child_id is derived, never accepted
--
-- The 0003 triggers only filled `child_id` when it arrived null. The RLS
-- WITH CHECK on both tables compares nothing but `child_id`, so a child could
-- post into a SIBLING's row by sending their own child_id together with the
-- sibling's assignment_id:
--
--     insert into messages (assignment_id, child_id, author_id, body)
--     values (<sibling's assignment>, <my child id>, auth.uid(), '...')
--
-- The row passes `messages_insert_own`, lands on the sibling's thread, and the
-- parent sees it on the review screen (that query filters by assignment_id, and
-- the parent policy admits any child_id in the family). Same shape for
-- attachments: a photo planted in a sibling's submission.
--
-- Deriving the value instead of validating it also makes the WITH CHECK do the
-- right thing for free — the derived child_id is the sibling's, which is not
-- `my_child_id()`, so the insert is rejected.
--
-- No app code is affected: every insert either omits child_id or already passes
-- the value read back off the owning row.
-- =============================================================================
create or replace function public.resolve_message_child_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  v_owner := coalesce(
    (select a.child_id from public.assignments a where a.id = new.assignment_id),
    (select l.child_id from public.lessons     l where l.id = new.lesson_id)
  );

  if v_owner is null then
    raise exception 'messages.child_id could not be resolved from assignment_id/lesson_id'
      using errcode = '23502';
  end if;

  -- Authoritative: whatever the client sent is discarded.
  new.child_id := v_owner;

  -- The author is the caller. Only the service role (seed, admin scripts) may
  -- write a message on someone else's behalf.
  if auth.uid() is not null then
    new.author_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_resolve_child on public.messages;
create trigger trg_messages_resolve_child
  before insert on public.messages
  for each row execute function public.resolve_message_child_id();

create or replace function public.resolve_attachment_child_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  v_owner := coalesce(
    (select a.child_id from public.assignments a where a.id = new.assignment_id),
    (select l.child_id from public.lessons     l where l.id = new.lesson_id),
    (select m.child_id from public.messages    m where m.id = new.message_id)
  );

  if v_owner is null then
    raise exception 'attachments.child_id could not be resolved from assignment_id/lesson_id/message_id'
      using errcode = '23502';
  end if;

  new.child_id := v_owner;

  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attachments_resolve_child on public.attachments;
create trigger trg_attachments_resolve_child
  before insert on public.attachments
  for each row execute function public.resolve_attachment_child_id();

-- An UPDATE must not be able to walk a row over to another child either;
-- `attachments_update_own` only re-checks child_id, not the foreign keys.
create or replace function public.attachments_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.child_id      is distinct from old.child_id
     or new.assignment_id is distinct from old.assignment_id
     or new.lesson_id     is distinct from old.lesson_id
     or new.message_id    is distinct from old.message_id
     or new.storage_path  is distinct from old.storage_path then
    raise exception 'attachments ownership columns are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attachments_guard_owner on public.attachments;
create trigger trg_attachments_guard_owner
  before update on public.attachments
  for each row execute function public.attachments_guard_owner();

-- =============================================================================
-- 3. assignments: the child column lock now matches SPEC section 2
--
-- SPEC: a child "changes only: the move to submitted, self_rating,
-- difficulty_note, minutes_spent, their own files". `assignments_update_own`
-- grants a row-wide UPDATE and 0003's trigger only locked review_comment,
-- reviewed_by, reviewed_at and redo_count — so a child could rewrite the title,
-- the source reference and the due date of homework their parent set, after the
-- fact and without an audit entry ("Maths p.45 ex.3" quietly becomes "ex.1",
-- Friday's deadline becomes next Wednesday).
--
-- This replaces the 0003 function wholesale; everything else in it is
-- unchanged, including the audit-comment logic.
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
  v_can_review    boolean;
  v_transition    text;
  v_comment       text;
begin
  select c.profile_id into v_child_profile
    from public.children c
   where c.id = new.child_id;

  v_is_child   := (v_uid is not null and v_uid is not distinct from v_child_profile);
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
-- 4. handle_new_user(): the role comes from app metadata, not user metadata
--
-- `raw_user_meta_data` is whatever the caller put in `signUp({ options: { data } })`,
-- so it is attacker-controlled. `raw_app_meta_data` can only be written with the
-- service role, which is exactly where the child provisioning in
-- `src/lib/auth/child.ts` sets `{ role: 'child' }`. Without this, a freshly
-- provisioned child briefly holds `profiles.role = 'parent'` — the window
-- between `admin.auth.admin.createUser()` and the profile upsert that follows it.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  v_role := coalesce(
    new.raw_app_meta_data  ->> 'role',
    new.raw_user_meta_data ->> 'role',
    'parent'
  );
  if v_role not in ('parent', 'child', 'helper') then
    v_role := 'parent';
  end if;

  insert into public.profiles (id, role, display_name, avatar_url)
  values (
    new.id,
    v_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The new functions are left with the default privileges, exactly like
-- the trigger functions in 0003: a trigger function cannot be called usefully
-- by hand (NEW/OLD are unbound, so it raises immediately), and PostgreSQL only
-- checks EXECUTE when the trigger is created, not when it fires.
