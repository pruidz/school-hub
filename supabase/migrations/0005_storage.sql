-- =============================================================================
-- SCHOOL-HUB — 0005_storage.sql
-- Private "evidence" bucket + object policies.
-- Depends on: 0003_functions.sql
--
-- Object path convention (CLAUDE.md / SPEC section 2):
--     {child_id}/{assignment_id}/{uuid}.webp
-- Lesson-level evidence uses:
--     {child_id}/lesson/{lesson_id}/{uuid}.webp
-- In both cases the FIRST path segment is the child id, which is what the
-- policies below key on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  10485760,  -- 10 MB hard ceiling; the client compresses to ~300 KB WebP
  array['image/webp', 'image/jpeg', 'image/png',
        'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Path helpers
-- -----------------------------------------------------------------------------
create or replace function public.storage_child_id(p_name text)
returns uuid
language sql
immutable
as $$
  select public.try_uuid(split_part(coalesce(p_name, ''), '/', 1));
$$;

comment on function public.storage_child_id(text) is
  'First path segment of a storage object name, as a uuid (null when it is not one).';

create or replace function public.storage_assignment_id(p_name text)
returns uuid
language sql
immutable
as $$
  select public.try_uuid(split_part(coalesce(p_name, ''), '/', 2));
$$;

revoke all on function public.storage_child_id(text) from public;
revoke all on function public.storage_assignment_id(text) from public;
grant execute on function public.storage_child_id(text) to authenticated, service_role;
grant execute on function public.storage_assignment_id(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS on storage.objects
-- Supabase enables it already; the guard keeps this file runnable everywhere.
-- -----------------------------------------------------------------------------
do $$
begin
  execute 'alter table storage.objects enable row level security';
exception
  when insufficient_privilege then
    raise notice 'storage.objects RLS left as-is (not the table owner) — already enabled on Supabase.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Parent: anything under any child of their family
-- -----------------------------------------------------------------------------
drop policy if exists evidence_parent_all on storage.objects;
create policy evidence_parent_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'evidence'
    and public.is_parent()
    and public.storage_child_id(name) in (select public.my_family_child_ids())
  )
  with check (
    bucket_id = 'evidence'
    and public.is_parent()
    and public.storage_child_id(name) in (select public.my_family_child_ids())
  );

-- -----------------------------------------------------------------------------
-- Child: only under {their_child_id}/...
-- -----------------------------------------------------------------------------
drop policy if exists evidence_child_select on storage.objects;
create policy evidence_child_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and public.storage_child_id(name) = public.my_child_id()
  );

drop policy if exists evidence_child_insert on storage.objects;
create policy evidence_child_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and public.storage_child_id(name) = public.my_child_id()
  );

drop policy if exists evidence_child_update on storage.objects;
create policy evidence_child_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'evidence'
    and public.storage_child_id(name) = public.my_child_id()
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'evidence'
    and public.storage_child_id(name) = public.my_child_id()
  );

drop policy if exists evidence_child_delete on storage.objects;
create policy evidence_child_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and public.storage_child_id(name) = public.my_child_id()
    and owner = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- Helper (phase 2): read-only on the family's evidence.
-- -----------------------------------------------------------------------------
drop policy if exists evidence_helper_select on storage.objects;
create policy evidence_helper_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and public.is_helper()
    and public.storage_child_id(name) in (select public.my_family_child_ids())
  );
