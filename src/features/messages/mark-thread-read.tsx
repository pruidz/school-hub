"use client";

/**
 * Marks a thread read once it has actually been rendered.
 *
 * A Server Component cannot write, and doing it inside the page render would
 * clear the badge for a thread the user never scrolled to. This fires exactly
 * once per mount, and only when something is unread.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { markThreadReadAction } from "./actions";

export function MarkThreadRead({
  assignmentId,
  unreadCount,
}: {
  assignmentId: string;
  unreadCount: number;
}) {
  const router = useRouter();
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (unreadCount <= 0 || doneRef.current) return;
    doneRef.current = true;

    void markThreadReadAction({ assignmentId }).then((result) => {
      if (result.ok) router.refresh();
    });
  }, [assignmentId, router, unreadCount]);

  return null;
}
