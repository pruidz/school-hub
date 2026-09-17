-- =============================================================================
-- SCHOOL-HUB — 0004_rls.sql
-- Row Level Security. RLS is enabled on EVERY table in the public schema.
-- Depends on: 0003_functions.sql
--
-- Roles
--   parent  : full access to everything under their own family_id
--   child   : row scope limited to their own children.id; SELECT/INSERT/UPDATE
--             only, never DELETE, never grades, never a sibling's rows.
--             Column-level limits on assignments are enforced by the trigger
--             public.assignments_status_guard() (0003), because policies cannot
--             express "these columns may not change".
--   helper  : phase 2 scaffold — SELECT + INSERT on messages only.
--
-- anon has no policies anywhere, so unauthenticated requests see nothing.
-- service_role bypasses RLS (used by server actions that must act as admin:
-- creating child auth users, redeeming invite codes, verifying PINs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'families', 'family_members', 'children', 'subjects',
    'schedule_slots', 'lessons', 'topics', 'assignments', 'assignment_events',
    'messages', 'message_reads', 'attachments', 'grades', 'topic_mastery',
    'notifications'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Baseline privileges (RLS still decides which rows are visible).
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'families', 'family_members', 'children', 'subjects',
    'schedule_slots', 'lessons', 'topics', 'assignments', 'assignment_events',
    'messages', 'message_reads', 'attachments', 'grades', 'topic_mastery',
    'notifications'
  ];
begin
  foreach t in array tables loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- =============================================================================
-- profiles
-- =============================================================================
drop policy if exists profiles_select_self_or_family on public.profiles;
create policy profiles_select_self_or_family on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or id in (select public.my_family_user_ids())
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT/DELETE policies: profiles are created by the auth.users trigger
-- (public.handle_new_user) and removed by the cascade from auth.users.

-- =============================================================================
-- families
-- =============================================================================
drop policy if exists families_select_member on public.families;
create policy families_select_member on public.families
  for select to authenticated
  using (id = public.current_family_id() or owner_id = auth.uid());

drop policy if exists families_insert_parent on public.families;
create policy families_insert_parent on public.families
  for insert to authenticated
  with check (public.is_parent() and owner_id = auth.uid());

drop policy if exists families_update_owner on public.families;
create policy families_update_owner on public.families
  for update to authenticated
  using (public.is_parent() and owner_id = auth.uid())
  with check (public.is_parent() and owner_id = auth.uid());

drop policy if exists families_delete_owner on public.families;
create policy families_delete_owner on public.families
  for delete to authenticated
  using (owner_id = auth.uid());

-- =============================================================================
-- family_members
-- =============================================================================
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select to authenticated
  using (family_id = public.current_family_id() or user_id = auth.uid());

drop policy if exists family_members_insert_parent on public.family_members;
create policy family_members_insert_parent on public.family_members
  for insert to authenticated
  with check (
    public.is_parent()
    and family_id in (select f.id from public.families f where f.owner_id = auth.uid())
  );

drop policy if exists family_members_update_parent on public.family_members;
create policy family_members_update_parent on public.family_members
  for update to authenticated
  using (
    public.is_parent()
    and family_id in (select f.id from public.families f where f.owner_id = auth.uid())
  )
  with check (
    public.is_parent()
    and family_id in (select f.id from public.families f where f.owner_id = auth.uid())
  );

drop policy if exists family_members_delete_parent on public.family_members;
create policy family_members_delete_parent on public.family_members
  for delete to authenticated
  using (
    public.is_parent()
    and family_id in (select f.id from public.families f where f.owner_id = auth.uid())
  );

-- =============================================================================
-- children
-- The child may READ their own row only. invite_code / pin_hash / ui_mode /
-- show_own_stats are parent-controlled, so the child gets no UPDATE policy;
-- PIN setup and invite redemption run through the service role.
-- =============================================================================
drop policy if exists children_parent_all on public.children;
create policy children_parent_all on public.children
  for all to authenticated
  using (public.is_parent() and family_id = public.current_family_id())
  with check (public.is_parent() and family_id = public.current_family_id());

drop policy if exists children_select_self on public.children;
create policy children_select_self on public.children
  for select to authenticated
  using (id = public.my_child_id());

-- =============================================================================
-- subjects
-- =============================================================================
drop policy if exists subjects_parent_all on public.subjects;
create policy subjects_parent_all on public.subjects
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists subjects_select_own on public.subjects;
create policy subjects_select_own on public.subjects
  for select to authenticated
  using (child_id = public.my_child_id());

-- =============================================================================
-- schedule_slots
-- =============================================================================
drop policy if exists schedule_slots_parent_all on public.schedule_slots;
create policy schedule_slots_parent_all on public.schedule_slots
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists schedule_slots_select_own on public.schedule_slots;
create policy schedule_slots_select_own on public.schedule_slots
  for select to authenticated
  using (child_id = public.my_child_id());

-- =============================================================================
-- lessons  (the child records "what we covered" — screen C2)
-- =============================================================================
drop policy if exists lessons_parent_all on public.lessons;
create policy lessons_parent_all on public.lessons
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists lessons_select_own on public.lessons;
create policy lessons_select_own on public.lessons
  for select to authenticated
  using (child_id = public.my_child_id());

drop policy if exists lessons_insert_own on public.lessons;
create policy lessons_insert_own on public.lessons
  for insert to authenticated
  with check (child_id = public.my_child_id());

drop policy if exists lessons_update_own on public.lessons;
create policy lessons_update_own on public.lessons
  for update to authenticated
  using (child_id = public.my_child_id())
  with check (child_id = public.my_child_id());

-- =============================================================================
-- topics  (scoped through subjects.child_id)
-- =============================================================================
drop policy if exists topics_parent_all on public.topics;
create policy topics_parent_all on public.topics
  for all to authenticated
  using (
    public.is_parent()
    and public.subject_child_id(subject_id) in (select public.my_family_child_ids())
  )
  with check (
    public.is_parent()
    and public.subject_child_id(subject_id) in (select public.my_family_child_ids())
  );

drop policy if exists topics_select_own on public.topics;
create policy topics_select_own on public.topics
  for select to authenticated
  using (public.subject_child_id(subject_id) = public.my_child_id());

-- =============================================================================
-- assignments
-- Row scope here; column scope in public.assignments_status_guard().
-- =============================================================================
drop policy if exists assignments_parent_all on public.assignments;
create policy assignments_parent_all on public.assignments
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists assignments_select_own on public.assignments;
create policy assignments_select_own on public.assignments
  for select to authenticated
  using (child_id = public.my_child_id());

-- A child may add homework they were given, but only in the initial state.
drop policy if exists assignments_insert_own on public.assignments;
create policy assignments_insert_own on public.assignments
  for insert to authenticated
  with check (
    child_id = public.my_child_id()
    and status = 'assigned'
    and redo_count = 0
    and reviewed_by is null
    and reviewed_at is null
    and review_comment is null
  );

drop policy if exists assignments_update_own on public.assignments;
create policy assignments_update_own on public.assignments
  for update to authenticated
  using (child_id = public.my_child_id())
  with check (child_id = public.my_child_id());

-- No DELETE policy for the child.

-- =============================================================================
-- assignment_events  (append-only; written only by the SECURITY DEFINER triggers)
-- =============================================================================
drop policy if exists assignment_events_parent_select on public.assignment_events;
create policy assignment_events_parent_select on public.assignment_events
  for select to authenticated
  using (
    public.is_parent()
    and public.assignment_child_id(assignment_id) in (select public.my_family_child_ids())
  );

drop policy if exists assignment_events_child_select on public.assignment_events;
create policy assignment_events_child_select on public.assignment_events
  for select to authenticated
  using (public.assignment_child_id(assignment_id) = public.my_child_id());

-- Deliberately no INSERT/UPDATE/DELETE policies.

-- =============================================================================
-- messages
-- =============================================================================
drop policy if exists messages_parent_all on public.messages;
create policy messages_parent_all on public.messages
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select to authenticated
  using (child_id = public.my_child_id());

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (child_id = public.my_child_id() and author_id = auth.uid());

drop policy if exists messages_update_author on public.messages;
create policy messages_update_author on public.messages
  for update to authenticated
  using (child_id = public.my_child_id() and author_id = auth.uid())
  with check (child_id = public.my_child_id() and author_id = auth.uid());

-- phase 2 scaffold: helper may read and post messages for children in the family
drop policy if exists messages_helper_select on public.messages;
create policy messages_helper_select on public.messages
  for select to authenticated
  using (public.is_helper() and child_id in (select public.my_family_child_ids()));

drop policy if exists messages_helper_insert on public.messages;
create policy messages_helper_insert on public.messages
  for insert to authenticated
  with check (
    public.is_helper()
    and child_id in (select public.my_family_child_ids())
    and author_id = auth.uid()
  );

-- =============================================================================
-- message_reads
-- =============================================================================
drop policy if exists message_reads_own_select on public.message_reads;
create policy message_reads_own_select on public.message_reads
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists message_reads_own_insert on public.message_reads;
create policy message_reads_own_insert on public.message_reads
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists message_reads_own_update on public.message_reads;
create policy message_reads_own_update on public.message_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists message_reads_own_delete on public.message_reads;
create policy message_reads_own_delete on public.message_reads
  for delete to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- attachments
-- =============================================================================
drop policy if exists attachments_parent_all on public.attachments;
create policy attachments_parent_all on public.attachments
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists attachments_select_own on public.attachments;
create policy attachments_select_own on public.attachments
  for select to authenticated
  using (child_id = public.my_child_id());

drop policy if exists attachments_insert_own on public.attachments;
create policy attachments_insert_own on public.attachments
  for insert to authenticated
  with check (
    child_id = public.my_child_id()
    and kind in ('task_source', 'solution', 'chat')
  );

drop policy if exists attachments_update_own on public.attachments;
create policy attachments_update_own on public.attachments
  for update to authenticated
  using (child_id = public.my_child_id() and uploaded_by = auth.uid())
  with check (child_id = public.my_child_id() and uploaded_by = auth.uid());

drop policy if exists attachments_delete_own on public.attachments;
create policy attachments_delete_own on public.attachments
  for delete to authenticated
  using (child_id = public.my_child_id() and uploaded_by = auth.uid());

-- =============================================================================
-- grades  -- parent only. No child policy of any kind (SPEC section 2).
-- =============================================================================
drop policy if exists grades_parent_all on public.grades;
create policy grades_parent_all on public.grades
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

-- =============================================================================
-- topic_mastery
-- The child sees their own mastery only when the parent turned on show_own_stats.
-- =============================================================================
drop policy if exists topic_mastery_parent_all on public.topic_mastery;
create policy topic_mastery_parent_all on public.topic_mastery
  for all to authenticated
  using (public.is_parent() and child_id in (select public.my_family_child_ids()))
  with check (public.is_parent() and child_id in (select public.my_family_child_ids()));

drop policy if exists topic_mastery_select_own on public.topic_mastery;
create policy topic_mastery_select_own on public.topic_mastery
  for select to authenticated
  using (
    child_id = public.my_child_id()
    and public.child_stats_visible(child_id)
  );

-- =============================================================================
-- notifications  -- always personal
-- =============================================================================
drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_own_delete on public.notifications;
create policy notifications_own_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- No INSERT policy: notifications are produced server-side (service role).
