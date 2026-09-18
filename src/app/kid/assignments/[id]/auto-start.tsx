"use client";

/**
 * Opening the assignment IS starting it.
 *
 * Renders nothing. It exists only because a Server Component may not have side
 * effects: the page render can be replayed, prefetched or streamed twice, and
 * `revalidatePath` during a render throws — so the one write that "the child
 * opened this" implies has to be fired from the client, exactly once.
 *
 * Firing exactly once is enforced in three layers, because any one of them
 * alone leaks:
 *
 *   1. `status !== "assigned"` short-circuits before the effect does anything,
 *      so the ninety-nine percent of page views that are not the first one
 *      cost no round trip at all;
 *   2. a ref keyed on the assignment id, which survives `router.refresh()` and
 *      React's development double-invoke (the component stays mounted through
 *      both, so the ref is still set);
 *   3. `autoStartAssignmentAction` itself, which only moves a row that is
 *      still `assigned` — a second tab, a hard reload or a restored bfcache
 *      page therefore changes nothing and writes no second
 *      `assignment_events` row.
 *
 * There is no loading state, no toast and no error path on purpose. The child
 * did not press anything; being told that something they did not do has failed
 * would be worse than the status quietly staying `assigned` until they submit.
 *
 * `router.refresh()` runs only when the row really moved, so the badge stops
 * saying „მიცემული" without the page being refetched on every visit. Nothing
 * appears or disappears as a result — the „დაწყება" button this replaced is
 * gone from the markup entirely, so there is no element to flicker.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { autoStartAssignmentAction } from "@/features/assignments/actions";
import type { AssignmentStatus } from "@/lib/assignment-status";

export function AutoStartAssignment({
  assignmentId,
  status,
}: {
  assignmentId: string;
  status: AssignmentStatus;
}) {
  const router = useRouter();
  const firedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    if (status === "assigned" && firedForRef.current !== assignmentId) {
      firedForRef.current = assignmentId;

      void autoStartAssignmentAction({ assignmentId })
        .then((result) => {
          if (cancelled) return;
          if (result.ok && result.data.started) router.refresh();
        })
        .catch(() => {
          // Offline, a dropped session, a server hiccup. The page is already
          // rendered and usable; submitting later moves the status anyway.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [assignmentId, router, status]);

  return null;
}
