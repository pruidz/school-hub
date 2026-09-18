-- =============================================================================
-- SCHOOL-HUB — 0012_child_assignment_insert.sql
-- Makes `assignments_insert_own` safe now that a child-facing create screen
-- actually uses it. No schema change, so `src/lib/db.types.ts` is unaffected.
-- Depends on: 0003_functions.sql (the lookup helpers), 0004_rls.sql
--
-- WHY
-- SPEC section 3.1 has the child record, per lesson, what homework was given
-- and photograph the book page. Until now the only create path was
-- `createAssignmentAction`, which is `requireParent()`, so nothing inserted
-- through `assignments_insert_own` and its gap never mattered.
--
-- THE GAP
-- The 0004 policy pins the row's own identity — `child_id = my_child_id()`,
-- `status = 'assigned'`, no review fields — but says nothing about the three
-- foreign keys the row points AT. A child could therefore post
--
--     insert into public.assignments (child_id, title, lesson_id)
--     values (<my child id>, 'x', <SIBLING's lesson id>);
--
-- and the row passes: it is their own assignment, in the right state, merely
-- hanging off their sibling's lesson / subject / topic. The damage is not a
-- read (RLS still hides the sibling's row from them) but a write into shared
-- structure: the sibling's lesson card starts counting an assignment that is
-- not theirs, the parent's per-subject filters and redo-rate-by-subject report
-- attribute the child's work to the wrong child's subject, and a child could
-- quietly graft their own homework onto a sibling's timetable.
--
-- THE FIX
-- Each foreign key, when not null, must resolve back to the same child. The
-- three `security definer` lookups from 0003 already express exactly that and
-- are reused verbatim rather than inlining joins into the policy — a policy
-- body runs as the caller, so a hand-written `select ... from public.subjects`
-- inside it would be filtered by `subjects_select_own` and silently evaluate
-- to null (i.e. NOT NULL = false, "reject everything") the moment the subject
-- is a sibling's. The helpers are `security definer`, so they see the real row
-- and the comparison is the one intended.
--
-- `public.topic_child_id()` already walks topics -> subjects, which is how a
-- topic is child-scoped (SPEC section 2: `topics` carries only `subject_id`).
--
-- NOT CHANGED HERE
-- The column lock in 0007 section 3 is a BEFORE UPDATE trigger and is not
-- involved in an INSERT; the initial state of a child-created row is pinned by
-- this policy instead (`status = 'assigned'`, no `review_comment`, no
-- `reviewed_by` / `reviewed_at`, `redo_count = 0`). Both halves are asserted in
-- supabase/test/rls.test.mjs block 24.
-- =============================================================================

drop policy if exists assignments_insert_own on public.assignments;
create policy assignments_insert_own on public.assignments
  for insert to authenticated
  with check (
    -- ---------------------------------------------------- the row itself
    child_id = public.my_child_id()
    and status = 'assigned'
    and redo_count = 0
    and reviewed_by is null
    and reviewed_at is null
    and review_comment is null

    -- ------------------------------------------- what the row points at
    -- Null is allowed: homework that belongs to no lesson, no subject and no
    -- topic is legitimate (the "+" on /kid/assignments). A value that IS given
    -- must be the child's own.
    and (
      subject_id is null
      or public.subject_child_id(subject_id) = public.my_child_id()
    )
    and (
      topic_id is null
      or public.topic_child_id(topic_id) = public.my_child_id()
    )
    and (
      lesson_id is null
      or public.lesson_child_id(lesson_id) = public.my_child_id()
    )
  );

comment on policy assignments_insert_own on public.assignments is
  'A child may add homework they were given, in the initial state only, and only '
  'hanging off their own lesson / subject / topic (0012).';
