"use server";

/**
 * Attachment bookkeeping.
 *
 * The binary itself goes straight from the browser to Storage (that is the only
 * way to report real per-file progress, and it keeps ~300 KB blobs out of the
 * Server Action body limit). Storage RLS decides whether the write is allowed —
 * the first path segment must be a child id the caller may touch.
 *
 * This module is the second half of that handshake: it re-reads the object that
 * was just written, checks its REAL size and mime against the allowlist (a
 * hand-rolled request can lie about both in its JSON payload), and only then
 * inserts the `attachments` row. If anything fails, the object is removed again
 * so no file is ever left without a row.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  loadAssignment,
  lessonBelongsToChild,
  requireCaller,
  type Caller,
} from "@/features/assignments/access";
import { logDbError, uploadErrorMessage } from "@/features/assignments/errors";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import type { Attachment } from "@/lib/db.types";
import { ka } from "@/lib/i18n/ka";
import { MAX_UPLOAD_BYTES, isAllowedImageMime } from "@/lib/images";
import { createClient, type ServerClient } from "@/lib/supabase/server";

import {
  HARD_MAX_ATTACHMENTS_PER_TARGET,
  isWellFormedEvidencePath,
} from "./paths";
import { removeObjects, statObject } from "./storage";

/* -------------------------------------------------------------------------- */
/*  schemas                                                                    */
/* -------------------------------------------------------------------------- */

const targetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("assignment"),
    assignmentId: z.uuid(),
    childId: z.uuid(),
    attachmentKind: z.enum(["task_source", "solution", "review"]),
  }),
  z.object({
    kind: z.literal("lesson"),
    lessonId: z.uuid(),
    childId: z.uuid(),
  }),
]);

const registerSchema = z.object({
  target: targetSchema,
  storagePath: z.string().min(1).max(300),
  /** Declared by the browser; verified against Storage before it is trusted. */
  mime: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES),
  width: z.number().int().positive().max(30000).nullable().optional(),
  height: z.number().int().positive().max(30000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export type RegisterAttachmentInput = z.infer<typeof registerSchema>;

/* -------------------------------------------------------------------------- */
/*  helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function assertTargetOwnership(
  supabase: ServerClient,
  caller: Caller,
  target: z.infer<typeof targetSchema>,
): Promise<boolean> {
  if (caller.role === "child" && caller.session.childId !== target.childId) {
    return false;
  }

  if (target.kind === "assignment") {
    const assignment = await loadAssignment(
      supabase,
      caller,
      target.assignmentId,
    );
    return Boolean(assignment && assignment.childId === target.childId);
  }

  return lessonBelongsToChild(
    supabase,
    caller,
    target.lessonId,
    target.childId,
  );
}

function revalidateForTarget(target: z.infer<typeof targetSchema>): void {
  if (target.kind === "assignment") {
    revalidatePath(`/kid/assignments/${target.assignmentId}`);
    revalidatePath(`/parent/review/${target.assignmentId}`);
    revalidatePath(`/parent/assignments/${target.assignmentId}`);
    revalidatePath("/kid/assignments");
    revalidatePath("/parent/inbox");
  } else {
    revalidatePath("/kid/today");
    revalidatePath("/parent");
  }
}

/* -------------------------------------------------------------------------- */
/*  actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn an object the browser has just written into an `attachments` row.
 * On any failure the object is deleted again.
 */
export async function registerAttachmentAction(
  input: RegisterAttachmentInput,
): Promise<ActionResult<Attachment>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail(ka.attachments.errUploadFailed);

  const { target, storagePath } = parsed.data;

  if (!isWellFormedEvidencePath(storagePath, target.childId)) {
    return fail(ka.attachments.errForbidden);
  }

  const caller = await requireCaller();
  const supabase = await createClient();

  if (!(await assertTargetOwnership(supabase, caller, target))) {
    // The caller cannot reach the target, so they cannot have legitimately
    // written under it either — clean up whatever slipped through.
    await removeObjects(supabase, [storagePath]);
    return fail(ka.attachments.errForbidden);
  }

  // ---- server-side size / mime enforcement on the REAL object ----------------
  const fact = await statObject(supabase, storagePath);
  if (!fact) return fail(ka.attachments.errUploadFailed);

  if (fact.sizeBytes > MAX_UPLOAD_BYTES) {
    await removeObjects(supabase, [storagePath]);
    return fail(ka.attachments.errTooLarge);
  }
  if (!isAllowedImageMime(fact.mime)) {
    await removeObjects(supabase, [storagePath]);
    return fail(ka.attachments.errBadType);
  }

  const attachmentKind =
    target.kind === "assignment" ? target.attachmentKind : "task_source";

  // ---- per-target ceiling ----------------------------------------------------
  const countQuery = supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("kind", attachmentKind);

  const { count } =
    target.kind === "assignment"
      ? await countQuery.eq("assignment_id", target.assignmentId)
      : await countQuery.eq("lesson_id", target.lessonId);

  if ((count ?? 0) >= HARD_MAX_ATTACHMENTS_PER_TARGET) {
    await removeObjects(supabase, [storagePath]);
    return fail(
      ka.attachments.limitReached.replace(
        "{count}",
        String(HARD_MAX_ATTACHMENTS_PER_TARGET),
      ),
    );
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      assignment_id: target.kind === "assignment" ? target.assignmentId : null,
      lesson_id: target.kind === "lesson" ? target.lessonId : null,
      kind: attachmentKind,
      storage_path: storagePath,
      mime: fact.mime,
      size_bytes: fact.sizeBytes,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      sort_order: parsed.data.sortOrder ?? (count ?? 0),
    })
    .select("*")
    .single();

  if (error || !data) {
    logDbError("attachments.register", error);
    await removeObjects(supabase, [storagePath]);
    return fail(uploadErrorMessage(error));
  }

  revalidateForTarget(target);
  return ok(data);
}

const deleteSchema = z.object({ attachmentId: z.uuid() });

/**
 * Remove an attachment the caller owns. The row goes first: an orphan blob is
 * invisible, an orphan row renders as a broken tile.
 */
export async function deleteAttachmentAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult<null>> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail(ka.attachments.errDeleteFailed);

  const caller = await requireCaller();
  const supabase = await createClient();

  const { data: attachment } = await supabase
    .from("attachments")
    .select("id, child_id, assignment_id, lesson_id, storage_path, thumb_path")
    .eq("id", parsed.data.attachmentId)
    .maybeSingle();

  if (!attachment) return fail(ka.attachments.errDeleteFailed);

  if (caller.role === "child" && attachment.child_id !== caller.session.childId) {
    return fail(ka.attachments.errForbidden);
  }
  if (caller.role === "parent") {
    const { data: child } = await supabase
      .from("children")
      .select("id, family_id")
      .eq("id", attachment.child_id)
      .maybeSingle();
    if (!child || child.family_id !== caller.session.familyId) {
      return fail(ka.attachments.errForbidden);
    }
  }

  // `.select()` matters: RLS turns a forbidden delete into "0 rows affected"
  // rather than an error, and removing the object then would leave a row
  // pointing at nothing.
  const { data: deleted, error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachment.id)
    .select("id");

  if (error) {
    logDbError("attachments.delete", error);
    return fail(uploadErrorMessage(error));
  }
  if (!deleted || deleted.length === 0) {
    return fail(ka.attachments.errForbidden);
  }

  await removeObjects(
    supabase,
    [attachment.storage_path, attachment.thumb_path].filter(
      (path): path is string => Boolean(path),
    ),
  );

  if (attachment.assignment_id) {
    revalidatePath(`/kid/assignments/${attachment.assignment_id}`);
    revalidatePath(`/parent/review/${attachment.assignment_id}`);
    revalidatePath("/parent/inbox");
  }
  if (attachment.lesson_id) {
    revalidatePath("/kid/today");
  }

  return ok(null);
}

/**
 * Delete an object the browser wrote but never managed to register. Called by
 * `PhotoUploader` when `registerAttachmentAction` fails, so a half-finished
 * upload never survives as a file with no row.
 */
export async function discardOrphanObjectAction(
  storagePath: string,
): Promise<void> {
  if (typeof storagePath !== "string") return;

  const caller = await requireCaller();
  const childId =
    caller.role === "child" ? caller.session.childId : undefined;

  if (!isWellFormedEvidencePath(storagePath, childId)) return;

  const supabase = await createClient();
  await removeObjects(supabase, [storagePath]);
}
