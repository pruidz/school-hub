import "server-only";

/**
 * The per-assignment thread, used from both the parent's review screen and the
 * child's assignment page.
 *
 * Still a Server Component, and still the only thing that reads the thread: it
 * goes through RLS, signs every attachment in one batch, and hands the result
 * to `<ThreadLive />`, which keeps it current over a realtime channel.
 *
 * Splitting it this way is deliberate. The first paint is server-rendered with
 * real data, so the thread is readable before any JavaScript runs and before
 * any websocket is attempted; realtime is strictly an upgrade on top of that,
 * never a precondition for it.
 */

import { getSignedUrls } from "@/features/attachments/signed-urls";

import { getAssignmentThread } from "./queries";
import { ThreadLive } from "./thread-live";

export async function MessageThread({
  assignmentId,
  childId,
  className,
  autoMarkRead = true,
}: {
  assignmentId: string;
  childId: string;
  className?: string;
  autoMarkRead?: boolean;
}) {
  const thread = await getAssignmentThread(assignmentId);
  if (!thread) return null;

  const paths = thread.messages.flatMap((message) => [
    ...message.attachments.map((file) => file.storage_path),
    ...(message.voicePath ? [message.voicePath] : []),
  ]);
  const urls = await getSignedUrls(paths);

  return (
    <ThreadLive
      assignmentId={assignmentId}
      childId={childId}
      viewerId={thread.viewerId}
      initialMessages={thread.messages}
      initialUrls={urls}
      initialUnreadCount={thread.unreadCount}
      autoMarkRead={autoMarkRead}
      className={className}
    />
  );
}
