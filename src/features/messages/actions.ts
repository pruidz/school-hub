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
import { getSignedUrls } from "@/features/attachments/signed-urls";
import { removeObjects, statObject } from "@/features/attachments/storage";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { getSessionUser } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { MAX_UPLOAD_BYTES, isAllowedImageMime } from "@/lib/images";
import { createClient, type ServerClient } from "@/lib/supabase/server";

import { getAssignmentThread, getChatThreads } from "./queries";
import type { ChatThreadSummary, ThreadSlice } from "./types";

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

const sliceSchema = z.object({
  assignmentId: z.uuid(),
  since: z.iso.datetime({ offset: true }).nullable(),
});

/**
 * The tail of a thread, with every attachment signed. What the realtime hook
 * calls on every insert and on every reconnect.
 *
 * Returns `null` rather than an empty slice when the caller may not read the
 * thread, so the browser can tell "nothing new" from "you lost access" and keep
 * what it already has on screen instead of blanking it.
 *
 * Authorisation is the same two layers as every other read here: RLS scopes
 * `getAssignmentThread`, and nothing in the returned slice depends on the
 * `since` argument being honest — a caller who lies about it gets more of their
 * own thread, never anybody else's.
 */
export async function getThreadSliceAction(
  assignmentId: string,
  since: string | null,
): Promise<ThreadSlice | null> {
  const parsed = sliceSchema.safeParse({ assignmentId, since });
  if (!parsed.success) return null;

  const thread = await getAssignmentThread(
    parsed.data.assignmentId,
    parsed.data.since,
  );
  if (!thread) return null;

  const paths = thread.messages.flatMap((message) => [
    ...message.attachments.map((file) => file.storage_path),
    ...(message.voicePath ? [message.voicePath] : []),
  ]);

  return { ...thread, urls: await getSignedUrls(paths) };
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
  if (ids.length === 0) {
    // Still worth clearing the bell: a `message_posted` row can outlive the
    // messages it collapsed (an edit, a deleted message), and a bell that
    // insists on unread mail the chat screen says is read is the single most
    // annoying thing an inbox can do.
    await clearMessageNotifications(supabase, caller.session.id, assignment.id);
    revalidateThread(assignment.id);
    return ok(null);
  }

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

  await clearMessageNotifications(supabase, caller.session.id, assignment.id);

  revalidateThread(assignment.id);
  return ok(null);
}

/**
 * The bell and the chat screen count different things — `notifications` rows
 * against `message_reads` rows — so reading a thread has to settle both or the
 * two disagree for as long as the bell's row sits there.
 *
 * Only `message_posted` rows are touched: "your child submitted something" is
 * not answered by reading the chat, and clearing it here would hide work.
 * Ownership is enforced twice, by `user_id` here and by the `user_id =
 * auth.uid()` policy underneath, and a failure is deliberately swallowed —
 * marking the thread itself read is the part the user asked for.
 */
async function clearMessageNotifications(
  supabase: ServerClient,
  userId: string,
  assignmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("type", "message_posted")
    .is("read_at", null)
    // `payload` is jsonb; `->>` is the only way to reach inside it from
    // PostgREST, and `filter` is the typed escape hatch for a non-column key.
    .filter("payload->>assignment_id", "eq", assignmentId);

  if (error) logDbError("messages.clearNotifications", error);
}

/**
 * Every thread the caller can see, for the live list on `/parent/chat`.
 *
 * Returns `null` rather than `[]` when nobody is signed in, so the browser can
 * tell "you have no conversations" from "your session went away" and keep what
 * is on screen — the same contract as `getThreadSliceAction` above. No input to
 * validate: the answer is whatever RLS says this user may read.
 */
export async function listChatThreadsAction(): Promise<
  ChatThreadSummary[] | null
> {
  const user = await getSessionUser();
  if (!user) return null;
  return getChatThreads();
}

function revalidateThread(assignmentId: string): void {
  revalidatePath(`/kid/assignments/${assignmentId}`);
  revalidatePath(`/parent/review/${assignmentId}`);
  revalidatePath("/kid/chat");
  revalidatePath("/kid/assignments");
  revalidatePath("/parent/inbox");
  // The parent chat list lives in a layout, so the whole segment has to go —
  // revalidating the page alone would leave a stale unread badge in the list.
  revalidatePath("/parent/chat", "layout");
}
