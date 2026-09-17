"use server";

/**
 * Sending and reading per-assignment messages.
 *
 * Chat photos follow the same handshake as assignment evidence: the browser
 * writes the object (Storage RLS decides), then this action re-reads its real
 * size and mime before creating any row. Everything is validated BEFORE the
 * message is inserted, so a rejected photo never leaves a half-written thread.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { loadAssignment, requireCaller } from "@/features/assignments/access";
import { logDbError, uploadErrorMessage } from "@/features/assignments/errors";
import { isWellFormedEvidencePath } from "@/features/attachments/paths";
import { removeObjects, statObject } from "@/features/attachments/storage";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { MAX_UPLOAD_BYTES, isAllowedImageMime } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY_LENGTH = 4000;
const MAX_IMAGES_PER_MESSAGE = 4;

const sendSchema = z.object({
  assignmentId: z.uuid(),
  body: z.string().max(MAX_BODY_LENGTH, ka.messages.errTooLong).nullable(),
  imagePaths: z.array(z.string().min(1).max(300)).max(MAX_IMAGES_PER_MESSAGE),
});

export type SendMessageInput = z.input<typeof sendSchema>;

export async function sendMessageAction(
  input: SendMessageInput,
): Promise<ActionResult<{ messageId: string }>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return fail(ka.messages.errSendFailed);

  const body = parsed.data.body?.trim() || null;
  const imagePaths = Array.from(new Set(parsed.data.imagePaths));

  if (!body && imagePaths.length === 0) return fail(ka.messages.errEmpty);

  const caller = await requireCaller();
  const supabase = await createClient();

  const assignment = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!assignment) return fail(ka.assignments.errNotFound);

  const childId = assignment.childId;

  // ---- validate every object BEFORE anything is written -------------------
  for (const path of imagePaths) {
    if (!isWellFormedEvidencePath(path, childId)) {
      await removeObjects(supabase, imagePaths);
      return fail(ka.attachments.errForbidden);
    }
    const fact = await statObject(supabase, path);
    if (!fact) {
      await removeObjects(supabase, imagePaths);
      return fail(ka.attachments.errUploadFailed);
    }
    if (fact.sizeBytes > MAX_UPLOAD_BYTES) {
      await removeObjects(supabase, imagePaths);
      return fail(ka.attachments.errTooLarge);
    }
    if (!isAllowedImageMime(fact.mime)) {
      await removeObjects(supabase, imagePaths);
      return fail(ka.attachments.errBadType);
    }
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      assignment_id: assignment.id,
      child_id: childId,
      author_id: caller.session.id,
      body,
    })
    .select("id")
    .single();

  if (error || !message) {
    logDbError("messages.send", error);
    await removeObjects(supabase, imagePaths);
    return fail(ka.messages.errSendFailed);
  }

  if (imagePaths.length > 0) {
    const { error: attachError } = await supabase.from("attachments").insert(
      imagePaths.map((path, index) => ({
        assignment_id: assignment.id,
        message_id: message.id,
        kind: "chat" as const,
        storage_path: path,
        mime: "image/webp",
        sort_order: index,
      })),
    );

    if (attachError) {
      logDbError("messages.attachments", attachError);
      // The text survived; make sure no object is left without a row.
      await removeObjects(supabase, imagePaths);
      revalidateThread(assignment.id);
      return fail(uploadErrorMessage(attachError));
    }
  }

  revalidateThread(assignment.id);
  return ok({ messageId: message.id });
}

const readSchema = z.object({ assignmentId: z.uuid() });

/** Mark every message in the thread the caller did not write as read. */
export async function markThreadReadAction(
  input: z.input<typeof readSchema>,
): Promise<ActionResult<null>> {
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const caller = await requireCaller();
  const supabase = await createClient();

  const assignment = await loadAssignment(
    supabase,
    caller,
    parsed.data.assignmentId,
  );
  if (!assignment) return fail(ka.assignments.errNotFound);

  const { data: messages } = await supabase
    .from("messages")
    .select("id")
    .eq("assignment_id", assignment.id)
    .neq("author_id", caller.session.id)
    .limit(500);

  const ids = (messages ?? []).map((row) => row.id);
  if (ids.length === 0) return ok(null);

  const { error } = await supabase.from("message_reads").upsert(
    ids.map((messageId) => ({
      message_id: messageId,
      user_id: caller.session.id,
    })),
    { onConflict: "message_id,user_id", ignoreDuplicates: true },
  );

  if (error) {
    logDbError("messages.markRead", error);
    return fail(ka.errors.generic);
  }

  revalidateThread(assignment.id);
  return ok(null);
}

function revalidateThread(assignmentId: string): void {
  revalidatePath(`/kid/assignments/${assignmentId}`);
  revalidatePath(`/parent/review/${assignmentId}`);
  revalidatePath("/kid/chat");
  revalidatePath("/kid/assignments");
  revalidatePath("/parent/inbox");
}
