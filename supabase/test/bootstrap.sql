-- =============================================================================
-- SCHOOL-HUB — supabase/test/bootstrap.sql
--
-- Recreates the parts of a Supabase project that `supabase/migrations/**` and
-- `supabase/seed.sql` assume already exist, so the whole SQL story can be
-- applied and exercised on a plain PostgreSQL instance (embedded-postgres,
-- no Docker, no `supabase start`).
--
-- This file is TEST INFRASTRUCTURE ONLY. It must never be applied to a real
-- project, and it must never be MORE PERMISSIVE than production — a harness
-- that grants more than Supabase does would turn a real hole into a green
-- test. Where the reproduction is inexact the divergence is written down in a
-- `DIVERGENCE:` comment right next to it.
--
-- What it creates, and nothing else:
--   1. roles anon / authenticated / service_role / authenticator, with the
--      role attributes and default privileges Supabase gives them
--   2. schema auth: auth.users, auth.identities, and auth.uid() / auth.role()
--      / auth.jwt() reading `request.jwt.claims`
--   3. schema storage: storage.buckets and storage.objects with the columns
--      0005_storage.sql's policies touch
-- =============================================================================


-- =============================================================================
-- 1. Roles
-- =============================================================================
-- Supabase creates these in its base image (see supabase/postgres
-- migrations/db/init-scripts/00000000000000-initial-schema.sql and
-- 10000000000000-auth-schema.sql).
--
--   anon, authenticated : NOLOGIN NOINHERIT, no special attributes.
--   service_role        : NOLOGIN NOINHERIT BYPASSRLS  <- the escape hatch.
--   authenticator       : LOGIN NOINHERIT, member of all three; PostgREST
--                         connects as this and does `set local role <x>`.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'postgres';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin noinherit createrole;
  end if;
end;
$$;

grant anon, authenticated, service_role to authenticator;
-- The test harness connects as `postgres` and uses SET LOCAL ROLE, exactly as
-- PostgREST does from `authenticator`. postgres is a member of all of them on
-- Supabase too.
grant anon, authenticated, service_role, supabase_auth_admin, supabase_storage_admin
  to postgres;

-- -----------------------------------------------------------------------------
-- public schema privileges, as Supabase's initial schema sets them.
-- This is the single most important line in this file for test 13: Supabase
-- DOES hand `anon` full table privileges by default, and 0004_rls.sql's
-- `revoke all ... from anon` is what takes them away. If the harness never
-- granted them, "anon gets permission denied" would pass for the wrong reason.
-- -----------------------------------------------------------------------------
grant usage on schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

-- Supabase also grants EXECUTE on functions to PUBLIC by default (the Postgres
-- default), which is why 0003/0005 bother to `revoke all on function ... from
-- public` before re-granting. Nothing to do here; that is stock behaviour.


-- =============================================================================
-- 2. schema auth
-- =============================================================================
create schema if not exists auth authorization supabase_auth_admin;

-- Supabase: GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role.
-- Note what is NOT granted: no table privileges on auth.users for any of them.
-- A signed-in user cannot read auth.users; only the GoTrue admin API can.
grant usage on schema auth to anon, authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- auth.users
--
-- The real table has ~35 columns. Reproduced here: every column that
-- 0002_core_tables.sql, 0007_privilege_hardening.sql or seed.sql actually
-- names, plus the handful the seed inserts positionally by name, with the real
-- types, nullability and defaults.
--
-- DIVERGENCE: columns no SCHOOL-HUB SQL references are omitted
-- (phone*, banned_until, is_sso_user, is_anonymous, reauthentication_*, ...).
-- They cannot affect the RLS story: nothing in migrations/, seed.sql or the
-- policies reads them. If app code ever selects one, this harness will not
-- catch it -- but app code cannot select auth.users at all (no grant).
--
-- DIVERGENCE: the real auth.users is owned by supabase_auth_admin and has RLS
-- enabled with zero policies. Here it is owned by supabase_auth_admin as well,
-- and RLS is enabled below, so an `authenticated` caller gets the same
-- "permission denied" it would get in production (privilege, not policy).
-- -----------------------------------------------------------------------------
create table if not exists auth.users (
  instance_id                 uuid,
  id                          uuid        not null primary key,
  aud                         varchar(255),
  role                        varchar(255),
  email                       varchar(255),
  encrypted_password          varchar(255),
  email_confirmed_at          timestamptz,
  invited_at                  timestamptz,
  confirmation_token          varchar(255),
  confirmation_sent_at        timestamptz,
  recovery_token              varchar(255),
  recovery_sent_at            timestamptz,
  email_change_token_new      varchar(255),
  email_change                varchar(255),
  email_change_sent_at        timestamptz,
  last_sign_in_at             timestamptz,
  raw_app_meta_data           jsonb,
  raw_user_meta_data          jsonb,
  is_super_admin              boolean,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  deleted_at                  timestamptz
);

-- Real Supabase: `create unique index users_email_partial_key on auth.users
-- (email) where is_sso_user = false`. Without is_sso_user the equivalent is a
-- plain unique index; the seed relies on email uniqueness being enforced.
create unique index if not exists users_email_partial_key on auth.users (email);

alter table auth.users enable row level security;

-- -----------------------------------------------------------------------------
-- auth.identities — seed.sql writes to it inside a guarded DO block.
-- -----------------------------------------------------------------------------
create table if not exists auth.identities (
  provider_id     text        not null,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  identity_data   jsonb       not null,
  provider        text        not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  email           text generated always as (lower(identity_data ->> 'email')) stored,
  id              uuid        not null default gen_random_uuid() primary key,
  constraint identities_provider_id_provider_unique unique (provider_id, provider)
);

alter table auth.identities enable row level security;

-- -----------------------------------------------------------------------------
-- auth.uid() / auth.role() / auth.jwt()
--
-- Copied from the Supabase base image (10000000000000-auth-schema.sql +
-- the later `auth.jwt()` addition). They are the ONLY thing standing between
-- a test session and a real PostgREST session, so they are reproduced verbatim
-- rather than approximated: both the legacy per-claim GUCs
-- (`request.jwt.claim.sub`) and the current whole-object GUC
-- (`request.jwt.claims`) are honoured, in that order.
--
-- LANGUAGE sql STABLE, no SECURITY DEFINER, no search_path pin — exactly as
-- Supabase ships them.
-- -----------------------------------------------------------------------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
    )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

-- Supabase leaves these with the PostgreSQL default (EXECUTE to PUBLIC), which
-- is how an `anon` request can evaluate a policy that calls auth.uid().
grant execute on function auth.uid()   to public;
grant execute on function auth.role()  to public;
grant execute on function auth.email() to public;
grant execute on function auth.jwt()   to public;


-- =============================================================================
-- 3. schema storage
-- =============================================================================
create schema if not exists storage authorization supabase_storage_admin;

-- Supabase: GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated,
-- service_role; and GRANT ALL ON ALL TABLES IN SCHEMA storage to the same.
-- Unlike public, storage is NOT revoked from anon by any SCHOOL-HUB migration:
-- an unauthenticated request against storage.objects gets an empty result set
-- (no policy matches), not permission denied. That asymmetry is real and the
-- tests assert the public-schema half only.
grant usage on schema storage to postgres, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- storage.buckets
-- Columns reproduced: exactly the ones 0005_storage.sql inserts/updates
-- (id, name, public, file_size_limit, allowed_mime_types) plus owner/timestamps
-- that the real table carries and defaults.
--
-- DIVERGENCE: `type storage.buckettype` (STANDARD | ANALYTICS) and the
-- avif_autodetection / owner_id columns are omitted. Nothing in this repo
-- references them.
-- -----------------------------------------------------------------------------
create table if not exists storage.buckets (
  id                 text        not null primary key,
  name               text        not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean     default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  constraint bname unique (name)
);

alter table storage.buckets enable row level security;

-- -----------------------------------------------------------------------------
-- storage.objects
--
-- 0005_storage.sql's policies reference exactly three columns:
--   bucket_id  (evidence_* policies: bucket_id = 'evidence')
--   name       (public.storage_child_id(name) / storage_assignment_id(name))
--   owner      (evidence_child_update / evidence_child_delete: owner = auth.uid())
-- Those three carry the real types. The rest of the real table is reproduced
-- where it is cheap, because a missing NOT NULL or a missing generated column
-- would let a test insert a row the real Storage API could not produce.
--
-- DIVERGENCE: `level int` and `user_metadata jsonb` (added by newer storage
-- releases) are omitted; no policy or app query touches them.
--
-- DIVERGENCE (important): in production, objects are created through the
-- Storage API, which sets `owner` to the JWT's sub and writes `metadata`
-- itself. Here the tests INSERT into storage.objects directly. That is a
-- faithful test of the RLS policy (the API's insert is an ordinary insert
-- under the caller's role), but it does NOT exercise bucket-level checks the
-- API performs in its own Node layer before touching Postgres:
-- file_size_limit and allowed_mime_types are enforced by the storage service,
-- not by a database constraint. So 0005's 10 MB / mime allow-list is NOT
-- proved by this harness.
-- -----------------------------------------------------------------------------
create table if not exists storage.objects (
  id               uuid        not null default gen_random_uuid() primary key,
  bucket_id        text        references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text
);

create unique index if not exists bucketid_objname
  on storage.objects (bucket_id, name);
create index if not exists name_prefix_search
  on storage.objects (name text_pattern_ops);

alter table storage.objects enable row level security;

grant all on storage.buckets to postgres, anon, authenticated, service_role;
grant all on storage.objects to postgres, anon, authenticated, service_role;

-- =============================================================================
-- Sanity: the migrations run as `postgres`. On Supabase the SQL editor also
-- runs as `postgres`, which owns the public schema and is a superuser-ish role
-- with rights over auth.users (it can create the on_auth_user_created trigger).
-- Reproduced by connecting as the bootstrap superuser.
-- =============================================================================
