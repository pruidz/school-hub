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

/** The parent's messenger (`/parent/chat`). Both are Client Components. */
export { ChatPanes } from "./chat-panes";
export { ThreadList } from "./thread-list";

export {
  getAssignmentThread,
  getChatThreads,
  getThreadContext,
  getUnreadCounts,
} from "./queries";

export type {
  ChatMessageKind,
  ChatThreadSummary,
  PendingMessage,
  Thread,
  ThreadContext,
  ThreadMessage,
  ThreadSlice,
} from "./types";

export {
  getThreadSliceAction,
  listChatThreadsAction,
  markThreadReadAction,
  sendMessageAction,
  type SendMessageInput,
} from "./actions";
