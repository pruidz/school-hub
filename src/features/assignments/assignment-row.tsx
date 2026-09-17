import Link from "next/link";
import { AlertTriangle, ChevronLeft, MessageCircle } from "lucide-react";

import type { Assignment } from "@/lib/db.types";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { dueState, formatDueLabel } from "./dates";
import type { SubjectLite } from "./queries";
import { AssignmentStatusBadge } from "./status-badge";

/**
 * One assignment in a list. Shared by the child's list, the parent's list and
 * both day views so a row looks identical wherever it appears.
 *
 * `size="lg"` is the `ui_mode = "simple"` variant: bigger touch targets and no
 * secondary text.
 */
export function AssignmentRow({
  assignment,
  subject,
  href,
  childName,
  unreadCount = 0,
  size = "default",
  className,
}: {
  assignment: Assignment;
  subject: SubjectLite | null;
  href: string;
  childName?: string | null;
  unreadCount?: number;
  size?: "default" | "lg";
  className?: string;
}) {
  const due = dueState(assignment.due_date);
  const isOverdue =
    due === "overdue" &&
    assignment.status !== "approved" &&
    assignment.status !== "submitted";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/60",
        size === "lg" && "min-h-20 gap-4 p-4",
        isOverdue && "border-destructive/40",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("w-1.5 shrink-0 self-stretch rounded-full", !subject && "bg-border")}
        style={subject ? { backgroundColor: subject.color } : undefined}
      />

      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "truncate font-medium",
              size === "lg" && "text-lg",
            )}
          >
            {assignment.title}
          </span>
          {assignment.priority === 3 ? (
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          ) : null}
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {childName ? <span className="font-medium">{childName}</span> : null}
          {subject ? <span>{subject.name}</span> : null}
          {assignment.source_ref ? (
            <span className="truncate">{assignment.source_ref}</span>
          ) : null}
          <span className={cn(isOverdue && "font-medium text-destructive")}>
            {isOverdue
              ? ka.assignments.overdue
              : formatDueLabel(assignment.due_date)}
          </span>
          {assignment.redo_count > 0 ? (
            <span>
              {t("assignments.redoCount", { count: assignment.redo_count })}
            </span>
          ) : null}
        </span>
      </span>

      {unreadCount > 0 ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <MessageCircle className="size-3" />
          {unreadCount}
        </span>
      ) : null}

      <AssignmentStatusBadge status={assignment.status} className="shrink-0" />

      <ChevronLeft
        aria-hidden
        className="size-4 shrink-0 rotate-180 text-muted-foreground"
      />
    </Link>
  );
}
