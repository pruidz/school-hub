import "server-only";

/**
 * The per-assignment thread, used from both the parent's review screen and the
 * child's assignment page. Server Component: it reads the thread through RLS,
 * signs every attachment in one batch, and hands interaction to two small
 * client components.
 */

import { MessageCircle } from "lucide-react";

import { formatDateTime } from "@/features/assignments/dates";
import { getSignedUrls } from "@/features/attachments/signed-urls";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { MarkThreadRead } from "./mark-thread-read";
import { getAssignmentThread, type ThreadMessage } from "./queries";
import { ThreadComposer } from "./thread-composer";

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
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {autoMarkRead ? (
        <MarkThreadRead
          assignmentId={assignmentId}
          unreadCount={thread.unreadCount}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {thread.messages.length === 0 ? (
          <div className="grid place-items-center gap-1 py-8 text-center">
            <MessageCircle className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {ka.messages.empty}
            </p>
            <p className="text-xs text-muted-foreground">
              {ka.messages.emptyHint}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {thread.messages.map((message) => (
              <li key={message.id}>
                <Bubble message={message} urls={urls} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ThreadComposer assignmentId={assignmentId} childId={childId} />
    </div>
  );
}

function Bubble({
  message,
  urls,
}: {
  message: ThreadMessage;
  urls: Record<string, string>;
}) {
  const voiceUrl = message.voicePath ? urls[message.voicePath] : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        message.isMine ? "items-end" : "items-start",
      )}
    >
      <span className="px-1 text-[11px] text-muted-foreground">
        {message.isMine
          ? ka.messages.you
          : (message.authorName ?? ka.messages.unknownAuthor)}
        {" · "}
        {formatDateTime(message.createdAt)}
      </span>

      <div
        className={cn(
          "grid max-w-[85%] gap-2 rounded-2xl px-3 py-2 text-sm",
          message.isMine
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
          message.isUnread && !message.isMine && "ring-2 ring-primary/40",
        )}
      >
        {message.body ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : null}

        {message.attachments.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((file) => {
              const url = urls[file.storage_path];
              if (!url) {
                return (
                  <li key={file.id} className="text-xs opacity-70">
                    {ka.attachments.unavailable}
                  </li>
                );
              }
              return (
                <li key={file.id}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      className="size-28 rounded-lg object-cover"
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}

        {message.voicePath ? (
          voiceUrl ? (
            <audio controls src={voiceUrl} className="h-9 w-56 max-w-full" />
          ) : (
            <p className="text-xs opacity-70">
              {ka.messages.voiceUnsupported}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
