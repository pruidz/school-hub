"use client";

/**
 * The two-pane frame of `/parent/chat`.
 *
 * Desktop (`lg` and up): a fixed-width conversation list on the left, the open
 * thread on the right, both filling the viewport below the shell header so the
 * page itself never scrolls — only the list and the message area do.
 *
 * Phone: one pane at a time. The list fills the screen; opening a thread pushes
 * the conversation over it and the thread's own header carries the way back.
 * Which pane is showing is decided from the URL, not from state, so the
 * browser's back button and the in-page back link do exactly the same thing.
 *
 * Both panes are rendered by the server on every navigation and handed in as
 * props; this component only decides which of them is visible. The list is
 * never unmounted on desktop, which is what lets it keep one realtime channel
 * for the whole session instead of re-subscribing per thread.
 *
 * Height is in `dvh`, not `vh`: on a phone the browser chrome and the on-screen
 * keyboard both change the usable height, and `dvh` is the unit that follows
 * them. Combined with the inner panes owning the only scroll containers, the
 * composer stays on screen when the keyboard opens instead of being pushed
 * under it.
 */

import * as React from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function ChatPanes({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const threadOpen = pathname.startsWith("/parent/chat/");

  return (
    <div
      className={cn(
        "grid min-h-0 gap-4",
        // Shell header (3.5rem) + the `main` padding (1rem, 1.5rem from `md`),
        // and the home-indicator inset on a notched phone, where `env()` is 0
        // everywhere else.
        "h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))]",
        "md:h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))]",
        "lg:grid-cols-[21rem_minmax(0,1fr)]",
      )}
    >
      <div className={cn("min-h-0", threadOpen ? "hidden lg:block" : "block")}>
        {list}
      </div>
      <div className={cn("min-h-0", threadOpen ? "block" : "hidden lg:block")}>
        {children}
      </div>
    </div>
  );
}
