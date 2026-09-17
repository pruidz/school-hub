import "server-only";

import { ka } from "@/lib/i18n/ka";
import { requireParent, type ParentSession } from "@/lib/auth/session";
import { fail, type ActionFailure } from "@/lib/auth/result";
import { createClient } from "@/lib/supabase/server";
import type { Child } from "@/lib/db.types";

/**
 * Guards shared by every Server Action in the A3 slice.
 *
 * The order is always the same and never varies:
 *   1. `requireParent()` / `requireChild()`  — who is calling
 *   2. zod                                    — is the input well formed
 *   3. an ownership lookup through the USER-SCOPED client — may they touch it
 *
 * Step 3 matters even though RLS would reject a foreign write anyway: it turns
 * "permission denied" into a readable Georgian message, and it is the only
 * thing standing between a forged id and the service-role client in the two
 * places where we have to use it (`children.pin_*`, `children.invite_code`).
 */

export type Guarded<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ActionFailure };

/**
 * A parent who may write.
 *
 * `requireParent()` also admits `helper`, but the RLS predicate behind every
 * parent policy is `public.is_parent()`, i.e. `profiles.role = 'parent'`. A
 * helper's write would be rejected by Postgres with an opaque error, so it is
 * refused here instead.
 */
export async function guardParentWrite(): Promise<Guarded<ParentSession>> {
  const parent = await requireParent();
  if (parent.role !== "parent") {
    return { ok: false, failure: fail(ka.errors.unauthorized) };
  }
  return { ok: true, value: parent };
}

/**
 * Resolve a child id coming from the browser to a real row, using the
 * user-scoped client so that RLS — not our code — decides whether this caller
 * is allowed to see it. Returns `null` for "does not exist" and "not yours"
 * alike; the caller must not distinguish the two.
 */
export async function findOwnChild(childId: string): Promise<Child | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("children")
    .select("*")
    .eq("id", childId)
    .maybeSingle();

  return data ?? null;
}

/** `findOwnChild` folded into the `Guarded` shape. */
export async function guardOwnChild(childId: string): Promise<Guarded<Child>> {
  const child = await findOwnChild(childId);
  if (!child) return { ok: false, failure: fail(ka.errors.notFound) };
  return { ok: true, value: child };
}

/**
 * Does `subjectId` belong to a child in the caller's family? Resolved through
 * the user-scoped client, so a subject from another family reads as missing.
 */
export async function findOwnSubjectChildId(
  subjectId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subjects")
    .select("child_id")
    .eq("id", subjectId)
    .maybeSingle();

  return data?.child_id ?? null;
}
