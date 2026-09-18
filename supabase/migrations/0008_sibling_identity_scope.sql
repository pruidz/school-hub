-- =============================================================================
-- SCHOOL-HUB — 0008_sibling_identity_scope.sql
-- Closes the last two rows a child could read that belong to a sibling.
-- Depends on: 0004_rls.sql (and must run after it, like 0007)
--
-- Found by supabase/test/rls.test.mjs, which walks EVERY public table as child
-- A and asks for child B's rows. Fourteen of the sixteen tables returned zero.
-- Two did not:
--
--   profiles        `profiles_select_self_or_family` (0004) admits
--                   `id in (select public.my_family_user_ids())`, and
--                   `my_family_user_ids()` deliberately includes every child of
--                   the family. So child A could read child B's profile row:
--                   auth user id, role, display_name, avatar_url.
--
--   family_members  `family_members_select` (0004) admits
--                   `family_id = public.current_family_id()`, i.e. the whole
--                   membership table of the family, including the sibling's
--                   row: their auth user id, role and permissions jsonb.
--
-- Severity: low but not zero. No policy anywhere keys on a client-supplied
-- user id -- every child-side predicate goes through `public.my_child_id()`,
-- which is derived from `auth.uid()` -- so knowing the sibling's uuid does not
-- by itself unlock anything. What it does do is contradict the SPEC, which
-- says in section 1 that a child "technically cannot see a sibling's data",
-- and it hands an attacker the identifiers to aim at if any future policy is
-- ever written against a supplied id instead of auth.uid(). A nine-year-old
-- being able to enumerate their sibling's account is also simply not what the
-- parent was promised.
--
-- Not fixed by narrowing `my_family_user_ids()`: that helper is also what makes
-- a PARENT able to see the whole family, which is correct. The scope belongs in
-- the policy, conditioned on who is asking.
--
-- What a child still sees, because the UI needs it: their own profile row, and
-- the profile + membership rows of the adults in the family (the parent's
-- display_name renders as the author on every chat message and every
-- assignment_events actor -- see src/features/messages/queries.ts and
-- src/features/assignments/queries.ts, both of which select display_name by
-- author/actor id).
--
-- Written as a new migration rather than an edit to 0004 for the same reason
-- 0007 was: 0004 states the baseline model and these files are the record of
-- what the security review found. Applying 0001..0008 in order is the only
-- supported path either way.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profile ids of the OTHER children in the caller's family.
-- Empty for a parent or helper (my_child_id() is null for them, so the guard in
-- each policy below switches this check off entirely rather than relying on
-- this function returning nothing).
-- -----------------------------------------------------------------------------
create or replace function public.sibling_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.profile_id
    from public.children c
   where c.family_id = public.current_family_id()
     and c.profile_id is not null
     and c.id is distinct from public.my_child_id();
$$;

comment on function public.sibling_profile_ids() is
  'Auth user ids of the other children in the caller''s family. Meaningful only when the caller is a child.';

revoke all on function public.sibling_profile_ids() from public;
grant execute on function public.sibling_profile_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- profiles: self, plus the family -- minus siblings when the caller is a child.
-- -----------------------------------------------------------------------------
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
    )
  );

-- -----------------------------------------------------------------------------
-- family_members: own row, plus the family -- minus siblings for a child.
-- -----------------------------------------------------------------------------
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      family_id = public.current_family_id()
      and (
        not public.is_child()
        or user_id not in (select public.sibling_profile_ids())
      )
    )
  );
