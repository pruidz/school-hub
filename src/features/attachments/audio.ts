/**
 * Telling a recording apart from a photo.
 *
 * `attachments` has no `kind` for audio and should not grow one: `kind` says
 * WHERE the evidence belongs (task source / solution / review / chat), and a
 * recitation recording is solution evidence in exactly the same sense a photo
 * of the exercise book is. What differs is only how it is rendered, and `mime`
 * already carries that — it is written by the server from the object Storage
 * actually holds, never from the client's claim.
 *
 * Pure and dependency-free on purpose: a Server Component splitting a list and
 * a Client Component rendering it must agree, so both import this.
 */

import { normalizeMime } from "@/lib/images";

import type { Attachment } from "./types";

export function isAudioAttachment(attachment: Attachment): boolean {
  return normalizeMime(attachment.mime).startsWith("audio/");
}

export function isImageAttachment(attachment: Attachment): boolean {
  return normalizeMime(attachment.mime).startsWith("image/");
}

export type SplitEvidence = {
  /** Anything renderable as a thumbnail — the historical, image-only case. */
  photos: Attachment[];
  recordings: Attachment[];
};

/**
 * Split one list of evidence into the two things that render differently.
 *
 * A row whose mime is neither (there should be none — the register action
 * refuses anything outside the allowlist) is treated as a photo, so it shows up
 * as a broken tile rather than vanishing from the parent's view entirely.
 */
export function splitEvidence(attachments: Attachment[]): SplitEvidence {
  const recordings: Attachment[] = [];
  const photos: Attachment[] = [];

  for (const attachment of attachments) {
    (isAudioAttachment(attachment) ? recordings : photos).push(attachment);
  }

  return { photos, recordings };
}

/** Stable order for a list of recordings, matching `PhotoGallery`'s. */
export function orderEvidence(attachments: Attachment[]): Attachment[] {
  return [...attachments].sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
}
