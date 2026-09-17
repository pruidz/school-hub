-- =============================================================================
-- SCHOOL-HUB — 0001_extensions.sql
-- Extensions and shared utility functions.
-- Safe to run more than once. Runs in the Supabase SQL editor as-is.
-- =============================================================================

create schema if not exists extensions;

-- pgcrypto: bcrypt (crypt/gen_salt) for seeded auth users and child PIN hashes.
-- On Supabase this extension already lives in the "extensions" schema.
create extension if not exists pgcrypto with schema extensions;

-- gen_random_uuid() is core in Postgres 13+, no extension needed.

-- -----------------------------------------------------------------------------
-- Generic updated_at maintenance trigger.
-- Attached in 0002 to every table that has an updated_at column.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with now().';

-- -----------------------------------------------------------------------------
-- Non-throwing text -> uuid cast. Used by the storage path helper in 0005,
-- where object names are arbitrary user-supplied strings.
-- -----------------------------------------------------------------------------
create or replace function public.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.try_uuid(text) is
  'Casts text to uuid, returning null instead of raising on malformed input.';

grant execute on function public.try_uuid(text) to authenticated, anon, service_role;
