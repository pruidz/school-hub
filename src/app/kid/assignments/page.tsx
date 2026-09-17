import type { Metadata } from "next";

import { AssignmentRow } from "@/features/assignments/assignment-row";
import { dueState } from "@/features/assignments/dates";
import {
  getKidAssignments,
  type KidAssignmentItem,
} from "@/features/assignments/queries";
import { getUnreadCounts } from "@/features/messages/queries";
import { ka, statusLabel } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.kid.assignmentsTitle };

/**
 * C3 list — grouped by what the child has to do next, overdue at the top.
 * `ui_mode = "simple"` gets bigger rows and nothing else changes shape.
 */
export default async function KidAssignmentsPage() {
  const { items, uiMode } = await getKidAssignments();
  const unread = await getUnreadCounts(items.map((item) => item.assignment.id));

  const overdue: KidAssignmentItem[] = [];
  const byStatus = new Map<string, KidAssignmentItem[]>();

  for (const item of items) {
    const { status, due_date } = item.assignment;
    const open =
      status === "assigned" || status === "in_progress" || status === "redo";

    if (open && dueState(due_date) === "overdue") {
      overdue.push(item);
      continue;
    }
    const bucket = byStatus.get(status) ?? [];
    bucket.push(item);
    byStatus.set(status, bucket);
  }

  const groups: { key: string; heading: string; items: KidAssignmentItem[] }[] =
    [
      { key: "overdue", heading: ka.assignments.groupOverdue, items: overdue },
      { key: "redo", heading: statusLabel("redo"), items: byStatus.get("redo") ?? [] },
      {
        key: "in_progress",
        heading: statusLabel("in_progress"),
        items: byStatus.get("in_progress") ?? [],
      },
      {
        key: "assigned",
        heading: statusLabel("assigned"),
        items: byStatus.get("assigned") ?? [],
      },
      {
        key: "submitted",
        heading: statusLabel("submitted"),
        items: byStatus.get("submitted") ?? [],
      },
      {
        key: "approved",
        heading: statusLabel("approved"),
        items: byStatus.get("approved") ?? [],
      },
    ].filter((group) => group.items.length > 0);

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold tracking-tight">
        {ka.kid.assignmentsTitle}
      </h1>

      {groups.length === 0 ? (
        <div className="grid gap-1 rounded-xl border bg-card p-8 text-center">
          <p className="text-lg font-medium">{ka.kid.assignmentsEmpty}</p>
          <p className="text-sm text-muted-foreground">
            {ka.kid.assignmentsEmptyHint}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="grid gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {group.heading} ({group.items.length})
            </h2>
            <ul className="grid gap-2">
              {group.items.map(({ assignment, subject }) => (
                <li key={assignment.id}>
                  <AssignmentRow
                    assignment={assignment}
                    subject={subject}
                    href={`/kid/assignments/${assignment.id}`}
                    unreadCount={unread[assignment.id] ?? 0}
                    size={uiMode === "simple" ? "lg" : "default"}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
