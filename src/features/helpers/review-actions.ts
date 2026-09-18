"use server";

/**
 * What a helper can actually do: approve, return for redo, and write in the
 * thread.
 *
 * A4's `approveAssignmentAction` / `requestRedoAction` / `sendMessageAction`
 * cannot be reused. They resolve the caller with `requireParent()` and then
 * confirm ownership with `childInFamily()`, which reads `public.children` —
 * and migration 0010 deliberately gives a helper no policy on that table, so
 * the lookup returns nothing and every one of those actions would fail with
 * "not found" for a helper. Rewriting them is A4's call, so the helper area
 * carries its own three.
 *
 * Guard order, as everywhere: who is calling -> zod -> ownership -> write.
 * The ownership step reads the row back through the user-scoped client, so RLS
 * is the decision and this code only turns it into Georgian.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assignmentErrorMessage, logDbError } from "@/features/assignments/errors";
import { getHelperScope, type HelperScope } from "@/lib/auth/helper";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";
import type { AssignmentStatus } from "@/lib/db.types";

const approveSchema = z.object({
  assignmentId: z.uuid(),
  comment: z.string().max(2000).nullable().optional(),
});

const redoSchema = z.object({
  assignmentId: z.uuid(),
  comment: z
    .string()
    .trim()
    .min(3, ka.validation.commentRequired)
    .max(2000, ka.validation.tooLong),
});

const messageSchema = z.object({
  assignmentId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, ka.messages.errEmpty)
    .max(4000, ka.messages.errTooLong),
});

type Target = { id: string; childId: string; status: AssignmentStatus };

/**
 * The signed-in helper's scope, or a Georgian failure. Never redirects — a
 * Server Action returns a message the form renders inline.
 */
async function helperScopeOrFail(): Promise<
  { ok: true; scope: HelperScope } | { ok: false; failure: ActionResult<never> }
> {
  const scope = await getHelperScope();
  if (!scope) {
    return { ok: false, failure: fail(ka.helpers.errUnauthorized) };
  }
  return { ok: true, scope };
}

/** Read an assignment the helper may touch, or `null`. */
async function loadTarget(
  scope: HelperScope,
  assignmentId: string,
): Promise<Target | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select("id, child_id, status")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!data) return null;
  if (!scope.childIds.includes(data.child_id)) return null;
  return { id: data.id, childId: data.child_id, status: data.status };
}

function revalidateTarget(assignmentId: string) {
  revalidatePath("/helper");
  revalidatePath(`/helper/assignment/${assignmentId}`);
}

export async function helperApproveAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await helperScopeOrFail();
  if (!guard.ok) return guard.failure;
  if (!guard.scope.canReview) return fail(ka.helpers.errUnauthorized);

  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return fail(ka.assignments.errNotFound);

  const target = await loadTarget(guard.scope, parsed.data.assignmentId);
  if (!target) return fail(ka.assignments.errNotFound);
  if (target.status !== "submitted") return fail(ka.review.notSubmitted);

  const comment = parsed.data.comment?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .update(
      comment
        ? { status: "approved", review_comment: comment }
        : { status: "approved" },
    )
    .eq("id", target.id)
    .select("id");

  if (error) {
    logDbError("helper.approve", error);
    return fail(assignmentErrorMessage(error));
  }
  // Zero rows means `assignments_helper_review` did not match — the grant was
  // revoked or narrowed between the read above and this write.
  if (!data || data.length === 0) return fail(ka.helpers.errUnauthorized);

  revalidateTarget(target.id);
  return ok(null);
}

export async function helperRequestRedoAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await helperScopeOrFail();
  if (!guard.ok) return guard.failure;
  if (!guard.scope.canReview) return fail(ka.helpers.errUnauthorized);

  const parsed = redoSchema.safeParse(input);
  if (!parsed.success) return fail(ka.validation.commentRequired);

  const target = await loadTarget(guard.scope, parsed.data.assignmentId);
  if (!target) return fail(ka.assignments.errNotFound);
  if (target.status !== "submitted") return fail(ka.review.notSubmitted);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "redo", review_comment: parsed.data.comment })
    .eq("id", target.id)
    .select("id");

  if (error) {
    logDbError("helper.redo", error);
    return fail(assignmentErrorMessage(error));
  }
  if (!data || data.length === 0) return fail(ka.helpers.errUnauthorized);

  revalidateTarget(target.id);
  return ok(null);
}

/**
 * Post in the thread. `child_id` is deliberately not sent: 0007's
 * `resolve_message_child_id()` derives it from the assignment and discards
 * anything the client supplies.
 */
export async function helperSendMessageAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const guard = await helperScopeOrFail();
  if (!guard.ok) return guard.failure;
  if (!guard.scope.canComment) return fail(ka.helpers.errUnauthorized);

  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(ka.messages.errEmpty);

  const target = await loadTarget(guard.scope, parsed.data.assignmentId);
  if (!target) return fail(ka.assignments.errNotFound);

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    assignment_id: target.id,
    body: parsed.data.body,
  });

  if (error) {
    logDbError("helper.message", error);
    return fail(ka.messages.errSendFailed);
  }

  revalidateTarget(target.id);
  return ok(null);
}
