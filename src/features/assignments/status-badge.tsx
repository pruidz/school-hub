import { Badge } from "@/components/ui/badge";
import type { AssignmentStatus } from "@/lib/assignment-status";
import { statusLabel } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

/**
 * Georgian status pill. Part of the cross-agent contract in CLAUDE.md.
 *
 * No `"use client"`: this renders the same in a Server Component and inside a
 * Client Component, so both sides can use it without a boundary.
 */
export function AssignmentStatusBadge({
  status,
  className,
}: {
  status: AssignmentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={VARIANT[status]}
      className={cn(EXTRA_CLASS[status], className)}
    >
      {statusLabel(status)}
    </Badge>
  );
}

const VARIANT: Record<
  AssignmentStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  assigned: "outline",
  in_progress: "secondary",
  submitted: "default",
  approved: "outline",
  redo: "destructive",
};

/** `approved` needs a green that neither `default` nor `outline` provides. */
const EXTRA_CLASS: Record<AssignmentStatus, string> = {
  assigned: "",
  in_progress: "",
  submitted: "",
  approved:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  redo: "",
};
