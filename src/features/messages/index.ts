/**
 * Public surface of the messages feature (A4).
 * Pulls in Server Components — import from a Server Component.
 */

export { MessageThread } from "./message-thread";
export { ThreadComposer } from "./thread-composer";
export { MarkThreadRead } from "./mark-thread-read";

export {
  getAssignmentThread,
  getChatThreads,
  getUnreadCounts,
  type ChatThreadSummary,
  type Thread,
  type ThreadMessage,
} from "./queries";

export {
  markThreadReadAction,
  sendMessageAction,
  type SendMessageInput,
} from "./actions";
