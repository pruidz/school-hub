import type { LessonUpdate } from "@/lib/db.types";

/**
 * "დავალება არ მოგვცეს" — the child confirming that a lesson produced no
 * homework.
 *
 * The column lives in `supabase/migrations/0006_lesson_no_homework.sql` and is
 * present in `src/lib/db.types.ts`. Everything that touches it still funnels
 * through this module so the "column not applied yet" path stays in one place.
 *
 * Why not encode it in an existing column: `lessons.notes` is free text the
 * parent reads, and `lessons.topic` is the lesson content — smuggling a flag
 * into either would corrupt real user data and break the moment a child types
 * the magic string themselves. "Zero assignments" is not the same fact either:
 * "nobody has entered the homework yet" and "there is no homework" have to be
 * distinguishable, which is the whole point of the button.
 *
 * Against a database where 0006 has not been applied, reads return `false` (the
 * column is simply absent from the row) and writes fail with Postgres 42703,
 * which `isMissingColumnError` turns into a readable Georgian message instead
 * of a crash.
 */

/** Postgres `undefined_column`. */
const UNDEFINED_COLUMN = "42703";

export function isMissingColumnError(
  error: { code?: string | null } | null,
): boolean {
  return error?.code === UNDEFINED_COLUMN;
}

/**
 * Read the flag off a row selected with `select("*")`. Tolerates a row from a
 * database where 0006 has not been applied, where the key is simply absent.
 */
export function readNoHomework(row: object): boolean {
  if (!("no_homework" in row)) return false;
  return (row as { no_homework: unknown }).no_homework === true;
}

/** The update payload. */
export function noHomeworkPatch(value: boolean): LessonUpdate {
  return { no_homework: value };
}
