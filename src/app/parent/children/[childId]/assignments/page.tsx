import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AssignmentRow } from "@/features/assignments/assignment-row";
import { FilterBar } from "@/features/assignments/filter-bar";
import { getParentAssignments } from "@/features/assignments/queries";
import { getUnreadCounts } from "@/features/messages/queries";
import { requireFamilyChild } from "@/features/children/child-scope";
import { ASSIGNMENT_STATUSES } from "@/lib/assignment-status";
import type { AssignmentStatus } from "@/lib/assignment-status";
import { ka, statusLabel, t } from "@/lib/i18n/ka";

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

/**
 * P4 / „დავალებები“ — the same list `/parent/assignments` renders, pinned to
 * one child.
 *
 * Nothing is re-implemented: `getParentAssignments` already scopes by child and
 * status (and re-checks the id against the family itself), and the rows are
 * A4's `AssignmentRow`. Only the child filter is dropped from the bar, because
 * the route already answers that question.
 */
export default async function ChildAssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { childId } = await params;
  const child = await requireFamilyChild(childId);

  const query = await searchParams;
  const subjectFilter = first(query.subject);
  const statusFilter = asStatus(first(query.status));

  const list = await getParentAssignments({
    childId: child.id,
    subjectId: subjectFilter,
    status: statusFilter,
  });

  // `getParentAssignments` scopes by child only when the id is in its own
  // active-children list, and falls back to the whole family otherwise — so an
  // archived child would show their siblings' work. Pin it here as well.
  const items = list.items.filter(
    (item) => item.assignment.child_id === child.id,
  );
  const subjects = list.subjects;

  const unread = await getUnreadCounts(items.map((item) => item.assignment.id));

  const subjectOptions = subjects
    .filter((subject) => subject.childId === child.id)
    .map((subject) => ({ value: subject.id, label: subject.name }));

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">
            {ka.children.pageTabAssignments}
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length > 0
              ? t("assignments.count", { count: items.length })
              : ka.children.tabAssignmentsSubtitle}
          </p>
        </div>

        <Button asChild size="sm">
          <Link href={`/parent/assignments/new?child=${child.id}`}>
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
              name: "status",
              label: ka.assignments.filterStatus,
              value: statusFilter,
              options: ASSIGNMENT_STATUSES.map((status) => ({
                value: status,
                label: statusLabel(status),
              })),
            },
            {
              name: "subject",
              label: ka.assignments.filterSubject,
              value: subjectFilter,
              options: subjectOptions,
            },
          ]}
        />
      </Suspense>

      {items.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <p className="font-medium">{ka.children.tabAssignmentsEmpty}</p>
            <p className="text-sm text-muted-foreground">
              {ka.children.tabAssignmentsEmptyHint}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {items.map(({ assignment, subject }) => (
            <li key={assignment.id}>
              <AssignmentRow
                assignment={assignment}
                subject={subject}
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
