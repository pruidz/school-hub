/**
 * Object names inside the private `evidence` bucket.
 *
 * The FIRST segment is always the child id — `public.storage_child_id(name)`
 * in `supabase/migrations/0005_storage.sql` reads it and every storage policy
 * keys on it. Nothing here may produce a path that breaks that rule.
 *
 *   {child_id}/{assignment_id}/{uuid}.webp        assignment + chat evidence
 *   {child_id}/lesson/{lesson_id}/{uuid}.webp     lesson evidence
 */

import { STORAGE_BUCKET_EVIDENCE } from "@/lib/assignment-status";

export const EVIDENCE_BUCKET = STORAGE_BUCKET_EVIDENCE;

/** How long a gallery URL stays valid. Long enough to read a page, short
 *  enough that a leaked link dies the same day. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4;

/** Default `max` for `PhotoUploader`. */
export const DEFAULT_MAX_PHOTOS = 6;

/** Server-side ceiling per assignment/kind, independent of any client `max`. */
export const HARD_MAX_ATTACHMENTS_PER_TARGET = 24;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function newObjectId(): string {
  return crypto.randomUUID();
}

export function assignmentObjectPath(
  childId: string,
  assignmentId: string,
  extension = "webp",
): string {
  return `${childId}/${assignmentId}/${newObjectId()}.${extension}`;
}

export function lessonObjectPath(
  childId: string,
  lessonId: string,
  extension = "webp",
): string {
  return `${childId}/lesson/${lessonId}/${newObjectId()}.${extension}`;
}

/**
 * Structural check on a path the browser claims to have written, before the
 * server trusts it enough to look the object up. Storage RLS is still the
 * real gate; this only rejects obvious nonsense and path traversal.
 */
export function isWellFormedEvidencePath(
  path: string,
  expectedChildId?: string,
): boolean {
  if (!path || path.length > 300) return false;
  if (path.includes("..") || path.startsWith("/") || path.includes("//")) {
    return false;
  }
  if (!/^[A-Za-z0-9/_.-]+$/.test(path)) return false;

  const segments = path.split("/");
  if (segments.length < 3 || segments.length > 4) return false;
  if (!isUuid(segments[0]!)) return false;
  if (expectedChildId && segments[0] !== expectedChildId) return false;

  const file = segments[segments.length - 1]!;
  return /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(file);
}

export function directoryOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function basenameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}
