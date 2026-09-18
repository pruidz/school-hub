import type { ReactNode } from "react";
import type { Metadata } from "next";

import { requireParent } from "@/lib/auth/session";
import { ChatPanes } from "@/features/messages/chat-panes";
import { getChatThreads } from "@/features/messages/queries";
import { ThreadList } from "@/features/messages/thread-list";
import { ka } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.messages.parentChatTitle };

/**
 * `/parent/chat` — the parent's messenger.
 *
 * The conversation list is read here, in the LAYOUT, rather than in each page,
 * for one reason: a layout survives navigation between its children. Opening a
 * thread therefore does not re-read, re-render or re-subscribe the list; it
 * stays mounted with its realtime channel, its filters and its scroll position
 * intact, and only the right-hand pane changes.
 *
 * Six queries for the whole list, whatever the number of conversations — see
 * `getChatThreads`. The guard is belt and braces: `/parent/layout.tsx` has
 * already run `requireParent()` above this, and the call is `cache()`d.
 */
export default async function ParentChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireParent();

  const threads = await getChatThreads();

  return (
    <ChatPanes list={<ThreadList initialThreads={threads} />}>
      {children}
    </ChatPanes>
  );
}
