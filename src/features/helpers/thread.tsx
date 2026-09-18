import "server-only";

/**
 * The read-only half of the thread, for the helper's assignment page.
 *
 * A4's `MessageThread` cannot be reused: it renders `ThreadComposer`, which
 * posts through `sendMessageAction` -> `requireCaller()` -> `loadAssignment()`
 * -> `childInFamily()`, and that last step reads `public.children`, which
 * migration 0010 keeps closed to a helper. Every helper message would come back
 * "not found". The composer lives in `./review-panel.tsx` instead, and this
 * component only renders what `getAssignmentThread()` returns — that query is
 * RLS-scoped with no role guard of its own, so it is safe to share.
 */

import { MessageCircle } from "lucide-react";

import { formatDateTime } from "@/features/assignments/dates";
import { getSignedUrls } from "@/features/attachments/signed-urls";
import { getAssignmentThread } from "@/features/messages/queries";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

export async function HelperThread({ assignmentId }: { assignmentId: string }) {
  const thread = await getAssignmentThread(assignmentId);

  if (!thread || thread.messages.length === 0) {
    return (
      <div className="grid place-items-center gap-1 py-6 text-center">
        <MessageCircle className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{ka.messages.empty}</p>
      </div>
    );
  }

  const urls = await getSignedUrls(
    thread.messages.flatMap((message) =>
      message.attachments.map((file) => file.storage_path),
    ),
  );

  return (
    <ul className="grid max-h-96 gap-3 overflow-y-auto">
      {thread.messages.map((message) => (
        <li
          key={message.id}
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
                          className="size-24 rounded-lg object-cover"
                        />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
