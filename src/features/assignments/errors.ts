/**
 * Turn a Postgres / PostgREST failure into a sentence a Georgian-speaking
 * parent or child can act on.
 *
 * The status machine lives in `public.assignments_status_guard()`
 * (supabase/migrations/0003_functions.sql) and raises plain English with an
 * SQLSTATE. Those messages must never reach the screen, so every one of them
 * is matched here; anything unrecognised degrades to `errors.generic` and is
 * logged server-side instead.
 */

import { ka } from "@/lib/i18n/ka";

export type DbError = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

/** Substring of the trigger's English message -> Georgian key. */
const TRIGGER_MESSAGES: ReadonlyArray<[string, string]> = [
  ["Illegal assignment status transition", ka.assignments.errIllegalTransition],
  [
    "may reopen an approved assignment",
    ka.assignments.errReopenReviewerOnly,
  ],
  ["may set status to", ka.assignments.errReviewerOnly],
  ["A child may not change review_comment", ka.assignments.errChildLocked],
  ["A child may not change reviewed_by", ka.assignments.errChildLocked],
  ["A child may not change reviewed_at", ka.assignments.errChildLocked],
  ["A child may not change redo_count", ka.assignments.errChildLocked],
  ["assignments.child_id cannot be changed", ka.assignments.errForbidden],
  [
    "child_id could not be resolved",
    ka.assignments.errForbidden,
  ],
];

export function assignmentErrorMessage(error: DbError): string {
  if (!error) return ka.errors.generic;

  const message = error.message ?? "";

  for (const [needle, translated] of TRIGGER_MESSAGES) {
    if (message.includes(needle)) return translated;
  }

  switch (error.code) {
    case "PGRST116":
      // "JSON object requested, multiple (or no) rows returned" — the row is
      // gone or RLS hid it.
      return ka.assignments.errNotFound;
    case "42501":
      return ka.assignments.errForbidden;
    case "23514":
      // A CHECK constraint that is not the status machine (rating range,
      // negative minutes, empty title).
      return ka.assignments.errInvalidValue;
    case "23503":
      return ka.assignments.errNotFound;
    case "23502":
      return ka.validation.required;
    default:
      break;
  }

  if (message.includes("row-level security")) {
    return ka.assignments.errForbidden;
  }

  return ka.errors.generic;
}

/** Same treatment for storage / attachment failures. */
export function uploadErrorMessage(error: DbError): string {
  if (!error) return ka.errors.generic;
  const message = error.message ?? "";

  if (message.includes("exceeded the maximum allowed size")) {
    return ka.attachments.errTooLarge;
  }
  if (message.includes("mime type") || message.includes("not supported")) {
    return ka.attachments.errBadType;
  }
  if (message.includes("Duplicate") || error.code === "23505") {
    return ka.attachments.errDuplicate;
  }
  if (error.code === "42501" || message.includes("row-level security")) {
    return ka.attachments.errForbidden;
  }
  return ka.attachments.errUploadFailed;
}

/**
 * Keep the English original where an operator can see it without leaking it to
 * the browser.
 */
export function logDbError(scope: string, error: DbError): void {
  if (!error) return;
  console.error(`[${scope}]`, error.code ?? "-", error.message ?? "");
}
