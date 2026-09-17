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
src/app/parent/children/*    A3  children CRUD, invite codes, ui_mode, PIN unlock
src/app/parent/settings/*    A3
src/app/kid/today/*          A3
src/app/kid/me/*             A3
src/features/schedule/*      A3
src/features/lessons/*       A3
src/features/children/*      A3

src/app/parent/inbox/*       A4
src/app/parent/assignments/* A4
src/app/parent/review/*      A4
src/app/kid/assignments/*    A4  list at /, detail at /[id]
src/app/kid/chat/*           A4  thread list
src/features/assignments/*   A4
src/features/attachments/*   A4
src/features/messages/*      A4
src/lib/images.ts            A4  client-side resize/compress
```
Route naming is settled: `/kid/assignments` (list) and `/kid/assignments/[id]` (detail).
`src/components/layout/nav-items.ts` already points at these — do not rename them.
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

## Cross-agent contracts (A4 provides, A3 consumes)
A4 owns photo upload and assignment rendering; A3 imports them instead of duplicating.
These signatures are fixed — implement/consume them exactly.

```ts
// src/features/attachments/index.ts  — owned by A4
"use client" component:
PhotoUploader(props: {
  target:
    | { kind: "assignment"; assignmentId: string; childId: string;
        attachmentKind: "task_source" | "solution" | "review" }
    | { kind: "lesson"; lessonId: string; childId: string }
  max?: number          // default 6
  label?: string        // Georgian, from ka.ts
  onUploaded?: () => void
}): ReactNode

PhotoGallery(props: { attachments: Attachment[]; zoom?: boolean }): ReactNode
// server helper
getSignedUrls(paths: string[]): Promise<Record<string, string>>
```

```ts
// src/features/assignments/index.ts — owned by A4
KidDayAssignments(props: { childId: string; date: string }): Promise<ReactNode>   // RSC
ParentDayAssignments(props: { childId: string; date: string }): Promise<ReactNode> // RSC
AssignmentStatusBadge(props: { status: AssignmentStatus }): ReactNode
```

Until A4 lands, a missing-module error on these two paths is expected for A3; report it
rather than stubbing the files.

## Gotchas
- `next dev` appends a `nextjs-agent-rules` block to this file. Revert that before
  you finish — do not commit it.
- `src/lib/db.types.ts` is generated; never hand-edit it. Status constants live in
  `src/lib/assignment-status.ts` (`ASSIGNMENT_STATUSES`, `ASSIGNMENT_TRANSITIONS`,
  `REVIEWER_ONLY_TARGETS`, `STORAGE_BUCKET_EVIDENCE`) — import them from there.
- A child has **SELECT only** on `children`. Anything writing `pin_*`, `invite_code`,
  `ui_mode` or `show_own_stats` must go through a parent-authorised server action.
- `grades` is invisible to children at the RLS level. Don't build kid UI for it.
- `topic_mastery` is visible to a child only when `children.show_own_stats` is true.
- Role is on `app_metadata.role` (unforgeable) with a `profiles.role` fallback;
  use `requireParent()` / `requireChild()` from `@/lib/auth/session`.

## Not in scope for phase 1
Realtime subscriptions, push/email notifications, reports and charts, topic mastery
UI, grades UI, AI check. Per-assignment messaging IS in phase 1, but plain
request/response — no realtime. Leave the other DB columns in place; do not build the UI.
