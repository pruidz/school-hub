import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AssignmentRow } from "@/features/assignments/assignment-row";
import { FilterBar } from "@/features/assignments/filter-bar";
import { getParentAssignments } from "@/features/assignments/queries";
import { getUnreadCounts } from "@/features/messages/queries";
import { ASSIGNMENT_STATUSES } from "@/lib/assignment-status";
import type { AssignmentStatus } from "@/lib/assignment-status";
import { ka, statusLabel, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.parent.assignmentsTitle };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asStatus(value: string | null): AssignmentStatus | null {
  return (ASSIGNMENT_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as AssignmentStatus)
    : null;
}

function asDue(value: string | null): "today" | "week" | "overdue" | null {
  return value === "today" || value === "week" || value === "overdue"
    ? value
    : null;
}

export default async function ParentAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const childFilter = first(params.child);
  const subjectFilter = first(params.subject);
  const statusFilter = asStatus(first(params.status));
  const dueFilter = asDue(first(params.due));

  const { items, children, subjects } = await getParentAssignments({
    childId: childFilter,
    subjectId: subjectFilter,
    status: statusFilter,
    due: dueFilter,
  });

  const unread = await getUnreadCounts(items.map((item) => item.assignment.id));

  const subjectOptions = subjects
    .filter((subject) => !childFilter || subject.childId === childFilter)
    .map((subject) => ({ value: subject.id, label: subject.name }));

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ka.parent.assignmentsTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length > 0
              ? t("assignments.count", { count: items.length })
              : ka.parent.assignmentsSubtitle}
          </p>
        </div>

        <Button asChild>
          <Link href="/parent/assignments/new">
            <Plus />
            {ka.parent.newAssignment}
          </Link>
        </Button>
      </header>

      {/* `FilterBar` reads `useSearchParams`; keep it behind Suspense. */}
      <Suspense fallback={<div className="h-9" />}>
        <FilterBar
          filters={[
          {
            name: "child",
            label: ka.assignments.filterChild,
            value: childFilter,
            options: children.map((child) => ({
              value: child.id,
              label: child.name,
            })),
          },
          {
            name: "subject",
            label: ka.assignments.filterSubject,
            value: subjectFilter,
            options: subjectOptions,
          },
          {
            name: "status",
            label: ka.assignments.filterStatus,
            value: statusFilter,
            options: ASSIGNMENT_STATUSES.map((status) => ({
              value: status,
              label: statusLabel(status),
            })),
          },
          ]}
        />
      </Suspense>

      {items.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <p className="font-medium">{ka.assignments.empty}</p>
            <p className="text-sm text-muted-foreground">
              {ka.assignments.emptyHint}
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/parent/assignments/new">
                {ka.parent.newAssignment}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {items.map(({ assignment, subject, child }) => (
            <li key={assignment.id}>
              <AssignmentRow
                assignment={assignment}
                subject={subject}
                childName={children.length > 1 ? (child?.name ?? null) : null}
                unreadCount={unread[assignment.id] ?? 0}
                href={
                  assignment.status === "submitted"
                    ? `/parent/review/${assignment.id}`
                    : `/parent/assignments/${assignment.id}`
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
