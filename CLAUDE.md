# SCHOOL-HUB — repo conventions

Remote homework-supervision app. Parent tracks each child's lessons, homework, photo
evidence of the assigned task and of the solution, reviews it, and chats per assignment.

Read `docs/SPEC.md` before writing code. It is the contract.

## Stack (already scaffolded — do not re-scaffold)
- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind v4 + shadcn/ui (components already installed in `src/components/ui/`)
- Supabase: Postgres + Auth + Storage + Realtime
- `src/` dir, import alias `@/*`

## UI language
All user-facing strings are **Georgian**. Keep them in `src/lib/i18n/ka.ts` as a flat
object and import from there — never hardcode Georgian text inside components.
Code, identifiers, comments and commit messages are English.

## Directory ownership (respect it — agents work in parallel)
```
supabase/                    A1  migrations, RLS, seed, config
src/lib/db.types.ts          A1  generated types (do not hand-edit)

src/lib/supabase/*           A2  browser/server/middleware clients
src/middleware.ts            A2
src/app/(auth)/*             A2  login, invite-code, PIN
src/app/parent/layout.tsx    A2
src/app/kid/layout.tsx       A2
src/components/layout/*      A2  nav, shells, theme toggle
src/lib/auth/*               A2  session helpers, role guards
src/lib/i18n/ka.ts           A2  creates it; others append keys only

src/app/parent/schedule/*    A3
src/app/parent/subjects/*    A3
src/app/kid/today/*          A3
src/features/schedule/*      A3
src/features/lessons/*       A3

src/app/parent/inbox/*       A4
src/app/parent/assignments/* A4
src/app/parent/review/*      A4
src/app/kid/assignment/*     A4
src/features/assignments/*   A4
src/features/attachments/*   A4
src/lib/images.ts            A4  client-side resize/compress
```
Shared files (`src/app/layout.tsx`, `globals.css`, `package.json`) — do not restructure.
Need something outside your area? Say so in your report instead of editing it.

## Data access rules
- Server Components / Server Actions for reads and writes. No client-side direct
  table writes except realtime subscriptions.
- Never trust the client for `status`, `review_comment`, `reviewed_by`, `grades`.
  The DB enforces this; the UI must not be the only guard.
- Always type queries against `Database` from `@/lib/db.types`.

## Status machine (assignments.status)
`assigned → in_progress → submitted → approved | redo`, and `redo → in_progress`
(increments `redo_count`). Only a parent may set `approved` or `redo`.

## Conventions
- Server Actions live in `actions.ts` next to the route that uses them, `"use server"`.
- Zod-validate every action input.
- Dates: store `date`/`timestamptz`; format with `date-fns` and the `ka` locale.
- Images: compress client-side to WebP (max 1600px, ~300KB) before upload.
- Storage bucket `evidence`, path `{child_id}/{assignment_id}/{uuid}.webp`.
- Mobile-first for everything under `/kid`; desktop-first for `/parent`.
- Run `npx tsc --noEmit` and `npm run lint` before reporting done.

## Not in scope for phase 1
Realtime chat, notifications, reports/charts, topic mastery, grades, AI check.
Leave the DB columns in place; do not build the UI.
