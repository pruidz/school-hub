/**
 * Shapes shared by the server-side thread queries and the client-side live
 * thread.
 *
 * This module deliberately has no `server-only` marker and no imports beyond
 * types: `src/lib/realtime/` and the live thread are Client Components and must
 * be able to `import type` from here without dragging `queries.ts` (and its
 * `server-only` guard) into the browser bundle.
 */

import type { Attachment } from "@/lib/db.types";

export type ThreadMessage = {
  id: string;
  body: string | null;
  voicePath: string | null;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
  isMine: boolean;
  isUnread: boolean;
  attachments: Attachment[];
};

export type Thread = {
  assignmentId: string;
  messages: ThreadMessage[];
  unreadCount: number;
  viewerId: string;
};

/**
 * A thread, or a tail of one, with every attachment/voice object already
 * signed. What the realtime hook asks the server for on every insert and on
 * every reconnect.
 */
export type ThreadSlice = Thread & {
  urls: Record<string, string>;
};

/**
 * A message the browser has composed but not yet had confirmed. It renders in
 * the list immediately and is dropped the moment the real row arrives.
 */
export type PendingMessage = {
  localId: string;
  /** Set once the Server Action has returned the real row id. */
  serverId: string | null;
  body: string | null;
  createdAt: string;
  /** Object URLs for the photos being sent, so they render before the upload. */
  previewUrls: string[];
  state: "sending" | "sent" | "failed";
};
