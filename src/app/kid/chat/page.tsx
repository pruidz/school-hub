import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { formatDateTime } from "@/features/assignments/dates";
import { getChatThreads } from "@/features/messages/queries";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: ka.messages.chatListTitle };

/**
 * C4 list — every assignment that has a thread, unread first then newest.
 * The thread itself lives on the assignment page, so this only routes there.
 */
export default async function KidChatPage() {
  const threads = await getChatThreads();

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight">
        {ka.messages.chatListTitle}
      </h1>

      {threads.length === 0 ? (
        <div className="grid place-items-center gap-1 rounded-xl border bg-card p-8 text-center">
          <MessageCircle className="size-7 text-muted-foreground" />
          <p className="text-lg font-medium">{ka.messages.chatListEmpty}</p>
          <p className="text-sm text-muted-foreground">
            {ka.messages.chatListEmptyHint}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {threads.map((thread) => (
            <li key={thread.assignmentId}>
              <Link
                href={`/kid/assignments/${thread.assignmentId}#chat`}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/60",
                  thread.unreadCount > 0 && "border-primary/50 bg-primary/5",
                )}
              >
                <span
                  aria-hidden
                  className="w-1.5 shrink-0 self-stretch rounded-full bg-border"
                  style={
                    thread.subjectColor
                      ? { backgroundColor: thread.subjectColor }
                      : undefined
                  }
                />

                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate font-medium">{thread.title}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {thread.lastMessagePreview || ka.messages.voiceMessage}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("messages.lastMessageAt", {
                      time: formatDateTime(thread.lastMessageAt),
                    })}
                  </span>
                </span>

                {thread.unreadCount > 0 ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {thread.unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
