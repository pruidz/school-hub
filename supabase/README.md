# SCHOOL-HUB — database

Postgres schema, RLS, storage policies and seed data for the app.
Owned by agent A1. Everything here is plain SQL: it runs through the Supabase
CLI *or* by pasting into the SQL editor of a cloud project.

```
supabase/
  migrations/
    0001_extensions.sql   extensions + set_updated_at() + try_uuid()
    0002_core_tables.sql  all tables, constraints, indexes, auth.users -> profiles
    0003_functions.sql    RLS helpers + assignment status machine + audit trail
    0004_rls.sql          RLS enabled on every table + explicit policies
    0005_storage.sql      private "evidence" bucket + object policies
    0006_lesson_no_homework.sql
                          lessons.no_homework + uq_lessons_child_slot_date
    0007_privilege_hardening.sql
                          profiles.role lockdown, derived child_id on
                          messages/attachments, wider child column lock
  seed.sql                one family, one parent, two children, a full week
```

Run them **in numeric order**. Each file is written to be re-runnable
(`create ... if not exists`, `create or replace`, `drop policy if exists`).

---

## Applying the migrations

### Option A — Supabase CLI

```bash
npm i -g supabase          # or: npx supabase ...

supabase init              # only once; creates supabase/config.toml
supabase login
supabase link --project-ref <your-project-ref>

supabase db push           # applies everything in supabase/migrations/
```

Local stack instead of the cloud:

```bash
supabase start             # Postgres + Auth + Storage in Docker
supabase db reset          # re-applies migrations AND runs seed.sql
```

### Option B — Supabase SQL editor (no CLI)

1. Open your project → **SQL Editor** → **New query**.
2. Paste the contents of `0001_extensions.sql`, run it.
3. Repeat for `0002` … `0007` — one file at a time, in order. Do not merge them
   into one query; later files depend on objects created by earlier ones, and
   `0007` in particular must run after `0004`, which would otherwise re-grant
   the table-wide UPDATE on `profiles` that `0007` narrows.
4. If `0005_storage.sql` prints a notice about `storage.objects` RLS, ignore it:
   Supabase enables it already, the statement is only a fallback for other hosts.

---

## Seeding

The seed writes to `auth.users`, so it needs an admin connection — the SQL
editor, `psql` as `postgres`, or the CLI. It is **not** runnable with the anon
key.

```bash
supabase db reset                                   # local: migrations + seed
psql "$DATABASE_URL" -f supabase/seed.sql           # any environment
```

Or paste `supabase/seed.sql` into the SQL editor and run it.

It is delete-then-insert on fixed UUIDs, so running it twice is safe and always
lands on the same data.

**Dev logins it creates** (password `SchoolHub123!`, child PIN `1234`):

| role   | email                    | note                        |
|--------|--------------------------|-----------------------------|
| parent | `parent@school-hub.test` | owns the family             |
| child  | `nika@school-hub.test`   | grade 3, `ui_mode = simple` |
| child  | `ana@school-hub.test`    | grade 7, `show_own_stats`   |

Delete these users before pointing the project at anything real.

What you get: 1 family, 2 children, 12 subjects, 12 topics, 45 schedule slots
(Mon–Fri), 10 lessons, 14 assignments spread across all five statuses (4
assigned / 3 in_progress / 3 submitted / 2 approved / 2 redo, two of them with
`redo_count = 1`), 9 attachment rows with placeholder storage paths, 5 chat
messages, 4 grades and 5 topic-mastery rows. The attachment rows point at paths
in the `evidence` bucket; no image files are uploaded, so thumbnails 404 until
you upload something yourself.

---

## Regenerating `src/lib/db.types.ts`

`src/lib/db.types.ts` is currently hand-written because the cloud project does
not exist yet. As soon as it does, replace it:

```bash
npx supabase gen types typescript --project-id <your-project-ref> --schema public \
  > src/lib/db.types.ts

# or against the local stack
npx supabase gen types typescript --local --schema public > src/lib/db.types.ts
```

Generated output does not include the hand-added convenience aliases at the
bottom of that file (`Child`, `Assignment`, `AssignmentStatus`,
`ASSIGNMENT_TRANSITIONS`, …). Re-append them after regenerating, or keep them in
a separate module.

---

## Environment variables

Copy `.env.local.example` to `.env.local` and fill it in from
**Project Settings → API**:

| variable | where it is used | notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | safe to expose; RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | bypasses RLS — never import it into a Client Component |
| `NEXT_PUBLIC_SITE_URL` | auth redirects | `http://localhost:3000` in dev |
| `CHILD_AUTH_SECRET` | server only | not a Supabase value — generate it yourself (`openssl rand -base64 48`). Every child login derives its password from it, so a missing or rotated value locks every child out |

No keys are committed to this repo, and none belong in these SQL files.

---

## How access control is put together

**Helper functions** (`0003`), all `security definer` + `stable` so a policy on
one table can look at another without re-entering RLS:

`current_family_id()`, `is_parent()`, `is_helper()`, `is_child()`,
`my_child_id()`, `my_family_child_ids()`, `my_family_user_ids()`,
`child_in_my_family(uuid)`, `child_stats_visible(uuid)`, `can_review(uuid)`,
and the `*_child_id(uuid)` lookups for tables that do not carry `child_id`.

**Row scope** is policies; **column scope** is triggers. Postgres policies
cannot say "this column may not change", so `public.assignments_status_guard()`
enforces the status machine and limits a child to `status`, `self_rating`,
`difficulty_note` and `minutes_spent` — everything the parent authored (title,
source_ref, due date, subject, priority) and every reviewer field
(`review_comment`, `reviewed_by`, `reviewed_at`, `redo_count`) is immutable for
them. Every status change is appended to `assignment_events`.

`public.profiles_guard_identity()` (0007) is the same idea one table over: a
signed-in user may not change their own `profiles.role`, because every
parent-side policy is `public.is_parent()`, which reads exactly that column.
`profiles` also carries a column-level grant so `authenticated` can only write
`display_name` and `avatar_url`.

`messages.child_id` and `attachments.child_id` are **derived** from the owning
assignment/lesson/message by a BEFORE INSERT trigger, never taken from the
client: the RLS WITH CHECK on both tables compares nothing but `child_id`, so
trusting the submitted value would let a child post into a sibling's thread.

**`anon` has no access at all.** `0004` revokes every table privilege from the
`anon` role and creates no policy for it, so an unauthenticated PostgREST
request gets `permission denied` rather than an empty result. Anything the
login / invite / PIN screens need before a session exists must go through a
Server Action using the service role.

**Service role** bypasses RLS and is required for the flows that RLS
deliberately does not allow the client to do:

* creating the child's auth user,
* generating and redeeming `children.invite_code`,
* writing `children.pin_hash` and checking a PIN (incl. `pin_attempts` /
  `pin_locked_until`),
* inserting `notifications`.

Run those from Server Actions only.

**Storage.** Bucket `evidence` is private, 10 MB per object, images + audio
only. Path convention:

```
{child_id}/{assignment_id}/{uuid}.webp      assignment evidence
{child_id}/lesson/{lesson_id}/{uuid}.webp   lesson evidence
```

The first segment is always the child id; `public.storage_child_id(name)` reads
it and the policies key on it. A parent reaches any path under their family's
children; a child only under their own id. Read images back with signed URLs
(`createSignedUrl`), not public URLs.
