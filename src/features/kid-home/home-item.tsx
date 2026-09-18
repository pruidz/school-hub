import Link from "next/link";
import { ChevronLeft, MessageSquareWarning } from "lucide-react";

import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { formatDueLabel } from "@/features/assignments/dates";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";

import type { HomeAssignment } from "./model";

/**
 * One piece of homework on the child's home screen.
 *
 * Deliberately not `<AssignmentRow>`: that row is the shared list item for
 * screens where the child is browsing, and it needs the whole `assignments`
 * row. Here the section around it already says WHY the item is on screen, so
 * the row itself stays short — and „გადასაკეთებელი" carries the parent's
 * comment inside the row, which is the one thing the child must not scroll
 * past.
 */
export function HomeItem({
  item,
  tone,
  size = "default",
}: {
  item: HomeAssignment;
  tone: "overdue" | "plain" | "returned";
  size?: "default" | "lg";
}) {
  return (
    <Link
      href={`/kid/assignments/${item.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/60",
        size === "lg" && "min-h-20 gap-4 p-4",
        tone === "overdue" && "border-destructive/50 bg-destructive/5",
        tone === "returned" && "border-amber-500/50 bg-amber-500/5",
      )}
    >
      <span
        aria-hidden
        className="w-1.5 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: item.subjectColor }}
      />

      <span className="grid min-w-0 flex-1 gap-1">
        <span
          className={cn("truncate font-medium", size === "lg" && "text-lg")}
        >
          {item.title}
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {item.subjectName ? <span>{item.subjectName}</span> : null}
          {item.sourceRef ? (
            <span className="truncate">{item.sourceRef}</span>
          ) : null}
          <span
            className={cn(tone === "overdue" && "font-medium text-destructive")}
          >
            {tone === "overdue"
              ? ka.assignments.overdue
              : formatDueLabel(item.dueDate)}
          </span>
          {item.redoCount > 0 ? (
            <span>{t("assignments.redoCount", { count: item.redoCount })}</span>
          ) : null}
        </span>

        {tone === "returned" && item.reviewComment ? (
          <span className="mt-1 flex items-start gap-2 rounded-lg bg-background/80 p-2 text-sm">
            <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">
                {ka.kid.parentComment}
              </span>
              {item.reviewComment}
            </span>
          </span>
        ) : null}
      </span>

      <AssignmentStatusBadge status={item.status} className="shrink-0" />

      <ChevronLeft
        aria-hidden
        className="size-4 shrink-0 rotate-180 text-muted-foreground"
      />
    </Link>
  );
}
