-- =============================================================================
-- SCHOOL-HUB — 0003_functions.sql
-- Authorisation helpers (used by the RLS policies in 0004) and the assignment
-- status machine.
-- Depends on: 0002_core_tables.sql
--
-- Every helper is SECURITY DEFINER + STABLE so that a policy on table X can look
-- up table Y without triggering Y's own RLS (and without recursive policies).
-- They take no user input other than an id, and each one pins search_path.
-- =============================================================================

-- =============================================================================
-- 1. Identity helpers
-- =============================================================================

-- The family the current user belongs to.
-- Order of preference: explicit membership -> child record -> family ownership.
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select fm.family_id
       from public.family_members fm
      where fm.user_id = auth.uid()
      order by case fm.role when 'parent' then 0 when 'child' then 1 else 2 end,
               fm.created_at
      limit 1),
    (select c.family_id
       from public.children c
      where c.profile_id = auth.uid()
      limit 1),
    (select f.id
       from public.families f
      where f.owner_id = auth.uid()
      limit 1)
  );
$$;

comment on function public.current_family_id() is
  'Family id of the calling user (membership, child record or ownership).';

-- Is the caller a parent? (profile role is the source of truth)
create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'parent'
  );
$$;

create or replace function public.is_helper()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'helper'
  );
$$;

-- The children row that IS the caller (null for parents/helpers).
create or replace function public.my_child_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
    from public.children c
   where c.profile_id = auth.uid()
   limit 1;
$$;

create or replace function public.is_child()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.my_child_id() is not null;
$$;

-- All children in the caller's family.
create or replace function public.my_family_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
    from public.children c
   where c.family_id = public.current_family_id();
$$;

-- All users in the caller's family (including the owner).
create or replace function public.my_family_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select fm.user_id
    from public.family_members fm
   where fm.family_id = public.current_family_id()
  union
  select f.owner_id
    from public.families f
   where f.id = public.current_family_id()
  union
  select c.profile_id
    from public.children c
   where c.family_id = public.current_family_id()
     and c.profile_id is not null;
$$;

create or replace function public.child_in_my_family(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.children c
     where c.id = p_child_id
       and c.family_id = public.current_family_id()
  );
$$;

-- Does the child let a logged-in child see their own statistics?
create or replace function public.child_stats_visible(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.children c
     where c.id = p_child_id and c.show_own_stats
  );
$$;

-- =============================================================================
-- 2. Lookup helpers for tables that do not carry child_id directly
-- =============================================================================

create or replace function public.assignment_child_id(p_assignment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.child_id from public.assignments a where a.id = p_assignment_id;
$$;

create or replace function public.lesson_child_id(p_lesson_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.child_id from public.lessons l where l.id = p_lesson_id;
$$;

create or replace function public.message_child_id(p_message_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.child_id from public.messages m where m.id = p_message_id;
$$;

create or replace function public.subject_child_id(p_subject_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.child_id from public.subjects s where s.id = p_subject_id;
$$;

create or replace function public.topic_child_id(p_topic_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.child_id
    from public.topics t
    join public.subjects s on s.id = t.subject_id
   where t.id = p_topic_id;
$$;

-- =============================================================================
-- 3. Review authority
-- A parent of the family, or (phase 2) a helper whose permissions grant review
-- rights for this child.
-- =============================================================================
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
       and (
         fm.role = 'parent'
         or (
           fm.role = 'helper'
           and lower(coalesce(fm.permissions ->> 'can_review', 'false'))
               in ('true', 't', '1', 'yes')
           and (
             jsonb_typeof(fm.permissions -> 'children') is distinct from 'array'
             or (fm.permissions -> 'children') ? (p_child_id::text)
           )
         )
       )
  );
$$;

comment on function public.can_review(uuid) is
  'True when the caller may approve/return work for this child (parent, family owner, or helper with can_review).';

-- =============================================================================
-- 4. Grants
-- =============================================================================
do $$
declare
  fn text;
  fns text[] := array[
    'public.current_family_id()',
    'public.is_parent()',
    'public.is_helper()',
    'public.is_child()',
    'public.my_child_id()',
    'public.my_family_child_ids()',
    'public.my_family_user_ids()',
    'public.child_in_my_family(uuid)',
    'public.child_stats_visible(uuid)',
    'public.assignment_child_id(uuid)',
    'public.lesson_child_id(uuid)',
    'public.message_child_id(uuid)',
    'public.subject_child_id(uuid)',
    'public.topic_child_id(uuid)',
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
-- 5. child_id backfill for messages and attachments
-- Lets RLS on those tables be a single-column comparison.
-- =============================================================================
create or replace function public.resolve_message_child_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.child_id is null then
    new.child_id := coalesce(
      (select a.child_id from public.assignments a where a.id = new.assignment_id),
      (select l.child_id from public.lessons l where l.id = new.lesson_id)
    );
  end if;

  if new.child_id is null then
    raise exception 'messages.child_id could not be resolved from assignment_id/lesson_id'
      using errcode = '23502';
  end if;

  if new.author_id is null then
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
begin
  if new.child_id is null then
    new.child_id := coalesce(
      (select a.child_id from public.assignments a where a.id = new.assignment_id),
      (select l.child_id from public.lessons   l where l.id = new.lesson_id),
      (select m.child_id from public.messages  m where m.id = new.message_id)
    );
  end if;

  if new.child_id is null then
    raise exception 'attachments.child_id could not be resolved from assignment_id/lesson_id/message_id'
      using errcode = '23502';
  end if;

  if new.uploaded_by is null then
    new.uploaded_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attachments_resolve_child on public.attachments;
create trigger trg_attachments_resolve_child
  before insert on public.attachments
  for each row execute function public.resolve_attachment_child_id();

-- =============================================================================
-- 6. Assignment status machine
--
-- Allowed transitions
--   assigned    -> in_progress
--   assigned    -> submitted
--   in_progress -> submitted
--   submitted   -> approved      (reviewer only)
--   submitted   -> redo          (reviewer only)
--   redo        -> in_progress   (redo_count += 1)
--   approved    -> redo          (reviewer only, correction)
--   approved    -> in_progress   (reviewer only, correction)
--
-- Side effects
--   -> submitted            : submitted_at = now()
--   -> approved | redo      : reviewed_at = now(), reviewed_by = auth.uid()
--   redo -> in_progress     : redo_count = redo_count + 1
--   any status change       : one row appended to assignment_events
--
-- Column lockdown: a child may never change review_comment, reviewed_by,
-- reviewed_at, redo_count, child_id.
--
-- Service context (auth.uid() is null: service_role key, SQL editor, seed) is
-- treated as privileged so migrations and admin scripts are not blocked.
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

-- Log the initial status so the audit trail starts at row creation.
create or replace function public.assignments_log_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.assignment_events
    (assignment_id, actor_id, from_status, to_status, comment)
  values
    (new.id, coalesce(auth.uid(), new.created_by), null, new.status, null);
  return new;
end;
$$;

drop trigger if exists trg_assignments_log_insert on public.assignments;
create trigger trg_assignments_log_insert
  after insert on public.assignments
  for each row execute function public.assignments_log_insert();
