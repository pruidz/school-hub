/**
 * Shapes shared by the server-side thread queries and the client-side live
 * thread.
 *
 * This module deliberately has no `server-only` marker and no imports beyond
 * types: `src/lib/realtime/` and the live thread are Client Components and must
 * be able to `import type` from here without dragging `queries.ts` (and its
 * `server-only` guard) into the browser bundle.
 */

import type { AssignmentStatus, Attachment } from "@/lib/db.types";

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

/** What the last message in a thread was, when it carries no text. */
export type ChatMessageKind = "text" | "photo" | "voice";

/**
 * One row of a conversation list — `/kid/chat` and `/parent/chat` render the
 * same shape. Lives here rather than beside the query that builds it because
 * the parent's list is a Client Component and must be able to `import type` it
 * without pulling `queries.ts` and its `server-only` guard into the bundle.
 */
export type ChatThreadSummary = {
  assignmentId: string;
  title: string;
  /** Live or finished? The list shows it, so closed threads can be skipped. */
  status: AssignmentStatus;
  subjectName: string | null;
  subjectColor: string | null;
  childId: string | null;
  childName: string | null;
  childColor: string | null;
  childAvatarUrl: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageKind: ChatMessageKind;
  lastMessageAuthorId: string | null;
  lastMessageAuthorName: string | null;
  lastMessageIsMine: boolean;
  unreadCount: number;
  messageCount: number;
};

/** The header of one thread: what it hangs off and where it links through to. */
export type ThreadContext = {
  assignmentId: string;
  title: string;
  status: AssignmentStatus;
  dueDate: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  childId: string;
  childName: string | null;
  childColor: string | null;
  childAvatarUrl: string | null;
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
