-- =============================================================================
-- SCHOOL-HUB — 0013_child_evidence_delete_window.sql
-- A child may take back their own evidence only while the work is still theirs
-- to change. No schema change, so `src/lib/db.types.ts` is unaffected.
-- Depends on: 0002_core_tables.sql, 0003_functions.sql, 0004_rls.sql
--
-- WHY NOW
-- Audio evidence landed with 0005's bucket and needed no migration of its own
-- (asserted in supabase/test/rls.test.mjs block 25). Using it revealed a gap
-- that photos never made obvious: a first take of a recitation is almost always
-- scrapped, and there was no way to take one back once the page had reloaded.
-- `PhotoUploader` offers an X only on the tiles IT uploaded in the current
-- session — reload, and the bad take is attached for good. So the review screen
-- now offers the child a delete on their own solution evidence, which means the
-- window in which that is legitimate has to be written down somewhere the UI
-- cannot be the only guard.
--
-- THE GAP
-- The 0004 policy fences WHO (`child_id = my_child_id()`, `uploaded_by =
-- auth.uid()`) but says nothing about WHEN. A child could therefore delete the
-- photo of the exercise they had already handed in — while the parent had it
-- open, or after it was approved — and the record of the work the parent
-- accepted would quietly change underneath them. The audit trail in
-- `assignment_events` records the verdicts, not the evidence they were about.
--
-- THE RULE
--   assigned | in_progress | redo   -> the child may delete their own evidence
--   submitted | approved            -> nobody but a parent may
--
-- `submitted` is the boundary that matters: from the moment work is handed in,
-- what the parent sees must be what the child sent. `approved` is closed for
-- the same reason — accepted work is not retractable.
--
-- SCOPE OF THE FENCE
-- Only `solution` and `task_source`, i.e. evidence OF the work. `chat` keeps
-- the old rule: a photo in a conversation is a message, it hangs off the
-- assignment only so RLS can find its child, and locking it on submission
-- would make the thread partly immutable for no reason. `review` is a parent's
-- annotation and was never reachable by a child anyway (`uploaded_by =
-- auth.uid()` already excludes it) — it is named here so the intent survives
-- someone relaxing that clause later.
--
-- `lesson_id`-only rows (the book-page photo on a lesson card, A3's screen)
-- have no assignment and are untouched.
--
-- WHY A HELPER FUNCTION
-- A policy body runs as the caller. A literal `select status from
-- public.assignments where id = ...` inside it would be filtered by the
-- assignments policies and, for any row the reader cannot see, evaluate to
-- null — i.e. the whole predicate becomes null, which reads as "deny" and would
-- be indistinguishable from the fence doing its job. The same reasoning as
-- 0012: reuse a `security definer` lookup so the comparison is the intended one.
--
-- `attachments_parent_all` is not touched: a parent still deletes anything in
-- their family, in any status, which is what makes a mis-shot photo fixable
-- after submission.
-- =============================================================================

create or replace function public.assignment_status(p_assignment_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.status::text from public.assignments a where a.id = p_assignment_id;
$$;

comment on function public.assignment_status(uuid) is
  'Status of an assignment, readable from inside a policy (0013).';

-- `revoke ... from public` alone is not enough here: Supabase's default
-- privileges grant EXECUTE on new functions to `anon` explicitly, and this one
-- is SECURITY DEFINER — left as it comes, a signed-out caller could read the
-- status of any assignment by id, from a table anon cannot select a single row
-- of. 0009 revokes from the named roles for the same reason.
revoke all on function public.assignment_status(uuid) from public;
revoke all on function public.assignment_status(uuid) from anon;
grant execute on function public.assignment_status(uuid)
  to authenticated, service_role;

drop policy if exists attachments_delete_own on public.attachments;
create policy attachments_delete_own on public.attachments
  for delete to authenticated
  using (
    child_id = public.my_child_id()
    and uploaded_by = auth.uid()
    and kind <> 'review'
    and (
      -- Not evidence of assignment work: the old rule stands.
      assignment_id is null
      or kind not in ('solution', 'task_source')
      -- Evidence of work: only before it was handed in.
      or public.assignment_status(assignment_id)
         in ('assigned', 'in_progress', 'redo')
    )
  );

comment on policy attachments_delete_own on public.attachments is
  'A child may remove their own evidence only while the assignment is still '
  'assigned / in_progress / redo — never once submitted, never a review '
  'annotation (0013).';
