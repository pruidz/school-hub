"use client";

/**
 * The live half of `<MessageThread />`.
 *
 * Everything on screen still starts as server-rendered data — this component is
 * handed the thread and the signed URLs its Server Component parent already
 * read through RLS. From there it keeps itself current over a realtime channel
 * (`src/lib/realtime/use-realtime-messages.ts`) instead of asking Next.js to
 * re-render the route.
 *
 * If the socket never connects, the only difference is that new messages appear
 * on the fallback poll or the next navigation rather than instantly. The list,
 * the composer and the photos all work exactly as they did before phase 2; the
 * connection state is never allowed to gate a render.
 */

import * as React from "react";
import { MessageCircle, WifiOff } from "lucide-react";

import { useRealtimeMessages } from "@/lib/realtime";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { getThreadSliceAction } from "./actions";
import { MarkThreadRead } from "./mark-thread-read";
import { MessageBubble } from "./message-bubble";
import { ThreadComposer } from "./thread-composer";
import type { ThreadMessage } from "./types";

/** Treat the reader as "at the bottom" within this many pixels. */
const STICK_TO_BOTTOM_PX = 80;

export function ThreadLive({
  assignmentId,
  childId,
  viewerId,
  initialMessages,
  initialUrls,
  initialUnreadCount,
  autoMarkRead,
  className,
}: {
  assignmentId: string;
  childId: string;
  viewerId: string;
  initialMessages: ThreadMessage[];
  initialUrls: Record<string, string>;
  initialUnreadCount: number;
  autoMarkRead: boolean;
  className?: string;
}) {
  const {
    messages,
    urls,
    status,
    beginSend,
    settleSend,
    failSend,
    discardSend,
  } = useRealtimeMessages({
    assignmentId,
    viewerId,
    initialMessages,
    initialUrls,
    fetchSince: getThreadSliceAction,
  });

  // Follow the conversation, but never yank the view away from somebody who has
  // scrolled up to re-read something.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickRef = React.useRef(true);

  const onScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    stickRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <
      STICK_TO_BOTTOM_PX;
  }, []);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {autoMarkRead ? (
        <MarkThreadRead
          assignmentId={assignmentId}
          unreadCount={initialUnreadCount}
        />
      ) : null}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="grid place-items-center gap-1 py-8 text-center">
            <MessageCircle className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{ka.messages.empty}</p>
            <p className="text-xs text-muted-foreground">
              {ka.messages.emptyHint}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {messages.map((message) => (
              <li key={message.localId ?? message.id}>
                <MessageBubble
                  message={message}
                  urls={urls}
                  onRetryDismiss={
                    message.localId
                      ? () => discardSend(message.localId as string)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {status === "offline" ? (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <WifiOff className="size-3" />
          {ka.messages.liveOffline}
        </p>
      ) : null}

      <ThreadComposer
        assignmentId={assignmentId}
        childId={childId}
        onSendStart={beginSend}
        onSendSettled={settleSend}
        onSendFailed={failSend}
      />
    </div>
  );
}
