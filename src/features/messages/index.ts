/**
 * Public surface of the messages feature (A4, extended in phase 2).
 * `MessageThread` is a Server Component — import it from a Server Component.
 * Everything below it (`ThreadLive`, `MessageBubble`, `ThreadComposer`) is a
 * Client Component and may be imported from either side.
 */

export { MessageThread } from "./message-thread";
export { ThreadLive } from "./thread-live";
export { MessageBubble } from "./message-bubble";
export { ThreadComposer, type ThreadComposerProps } from "./thread-composer";
export { MarkThreadRead } from "./mark-thread-read";

export {
  getAssignmentThread,
  getChatThreads,
  getUnreadCounts,
  type ChatThreadSummary,
} from "./queries";

export type {
  PendingMessage,
  Thread,
  ThreadMessage,
  ThreadSlice,
} from "./types";

export {
  getThreadSliceAction,
  markThreadReadAction,
  sendMessageAction,
  type SendMessageInput,
} from "./actions";
