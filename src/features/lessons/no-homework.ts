import type { LessonUpdate } from "@/lib/db.types";

/**
 * "დავალება არ მოგვცეს" — the child confirming that a lesson produced no
 * homework.
 *
 * ============================== MISSING COLUMN ==============================
 * This needs a boolean on `lessons` and the column DOES NOT EXIST yet. A3 may
 * not add migrations, so the UI is written against the column as if it were
 * there and everything that touches it funnels through this module.
 *
 * The migration A1 has to add (`supabase/migrations/0006_lesson_no_homework.sql`):
 *
 *   alter table public.lessons
 *     add column if not exists no_homework boolean not null default false;
 *
 *   comment on column public.lessons.no_homework is
 *     'Child confirmed that this lesson produced no homework (screen C2).';
 *
 * …and then `src/lib/db.types.ts` regenerated so `no_homework` appears in the
 * lessons Row/Insert/Update types and the casts below can be deleted.
 *
 * Why not encode it in an existing column: `lessons.notes` is free text the
 * parent reads, and `lessons.topic` is the lesson content — smuggling a flag
 * into either would corrupt real user data and break the moment a child types
 * the magic string themselves. "Zero assignments" is not the same fact either:
 * "nobody has entered the homework yet" and "there is no homework" have to be
 * distinguishable, which is the whole point of the button.
 *
 * Until the migration lands, reads return `false` (the column is simply absent
 * from the row) and writes fail with Postgres 42703, which
 * `isMissingColumnError` turns into a readable Georgian message instead of a
 * crash.
 * ============================================================================
 */

/** Postgres `undefined_column`. */
const UNDEFINED_COLUMN = "42703";

export function isMissingColumnError(
  error: { code?: string | null } | null,
): boolean {
  return error?.code === UNDEFINED_COLUMN;
}

/**
 * Read the flag off a row selected with `select("*")`. The column is absent
 * today and present after the migration; both shapes are handled here so no
 * caller has to care.
 */
export function readNoHomework(row: object): boolean {
  if (!("no_homework" in row)) return false;
  return (row as { no_homework: unknown }).no_homework === true;
}

/**
 * The update payload. The cast is the single place where we outrun the
 * generated types; delete it together with the comment above once
 * `db.types.ts` knows about the column.
 */
export function noHomeworkPatch(value: boolean): LessonUpdate {
  return { no_homework: value } as unknown as LessonUpdate;
}
