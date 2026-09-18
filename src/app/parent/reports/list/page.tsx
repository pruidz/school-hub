import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShortDate } from "@/features/assignments/dates";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import type { ReportRow } from "@/features/reports/metrics";
import {
  getReportAssignments,
  isReportMetricFilter,
  type ReportMetricFilter,
} from "@/features/reports/queries";
import { formatRange } from "@/features/reports/report-sections";
import { DEFAULT_WINDOW, minIso, resolveWindow } from "@/features/reports/windows";
import { isIsoDate, todayIso } from "@/features/schedule/dates";
import { requireParent } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: ka.reports.listTitle };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const METRIC_LABELS: Record<ReportMetricFilter, string> = {
  all: ka.reports.filterAll,
  approved: ka.reports.filterApproved,
  returned: ka.reports.filterReturned,
  late: ka.reports.filterLate,
  open: ka.reports.filterOpen,
  timed: ka.reports.filterTimed,
  rated: ka.reports.filterRated,
};

/**
 * The rows behind one number on the report.
 *
 * Every figure on `/parent/reports` links here with the exact window, subject,
 * topic and slice it was computed from. A percentage a parent cannot open is a
 * percentage they have to take on faith, and this screen is the whole reason
 * they do not have to.
 *
 * It is a separate list from `/parent/assignments` for one reason: that list
 * filters by `today | week | overdue`, not by an arbitrary date range, so it
 * cannot reproduce "the four weeks this 62% came from".
 */
export default async function ReportListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireParent();

  const params = await searchParams;
  const today = todayIso();
  const fallback = resolveWindow(DEFAULT_WINDOW, today).current;

  // A range out of the query string is clamped rather than trusted: never past
  // today, and never inverted.
  const fromParam = first(params.from);
  const toParam = first(params.to);
  const to = minIso(isIsoDate(toParam) ? toParam : fallback.to, today);
  const fromCandidate = isIsoDate(fromParam) ? fromParam : fallback.from;
  const range = { from: minIso(fromCandidate, to), to };

  const metricParam = first(params.metric);
  const metric: ReportMetricFilter = isReportMetricFilter(metricParam)
    ? metricParam
    : "all";

  const result = await getReportAssignments({
    range,
    metric,
    subjectId: first(params.subject),
    topicId: first(params.topic),
  });

  if (result.kind === "no-children") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ka.parent.noChildren}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/parent/children">{ka.parent.manageChildren}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { child, rows, subjects, subjectName, topicName } = result;
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));

  const context = [child.name, subjectName, topicName]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit -ms-2 text-muted-foreground"
        >
          <Link href="/parent/reports">
            <ChevronLeft />
            {ka.reports.listBack}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {METRIC_LABELS[metric]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {context} ·{" "}
          {t("reports.listSummary", {
            count: rows.length,
            range: formatRange(range),
          })}
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{ka.reports.listEmpty}</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <ExtractRow
                row={row}
                subject={
                  row.subjectId ? (subjectById.get(row.subjectId) ?? null) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A report-flavoured list row: the same shape as `AssignmentRow`, but showing
 * the numbers this screen exists to explain (time spent, self-rating, how many
 * times it came back) instead of the priority flag.
 */
function ExtractRow({
  row,
  subject,
}: {
  row: ReportRow;
  subject: { name: string; color: string } | null;
}) {
  return (
    <Link
      href={`/parent/assignments/${row.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/60"
    >
      <span
        aria-hidden
        className={cn(
          "w-1.5 shrink-0 self-stretch rounded-full",
          !subject && "bg-border",
        )}
        style={subject ? { backgroundColor: subject.color } : undefined}
      />

      <span className="grid min-w-0 flex-1 gap-1">
        <span className="truncate font-medium">{row.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {subject ? <span>{subject.name}</span> : null}
          <span>{formatShortDate(row.day)}</span>
          {row.minutesSpent !== null ? (
            <span className="tabular-nums">
              {row.minutesSpent} {ka.assignments.minutesUnit}
            </span>
          ) : null}
          {row.selfRating !== null ? (
            <span className="tabular-nums">
              {t("reports.ofFive", { value: String(row.selfRating) })}
            </span>
          ) : null}
          {row.returned ? (
            <span className="text-destructive">
              {t("assignments.redoCount", {
                count: Math.max(1, row.redoCount),
              })}
            </span>
          ) : null}
        </span>
      </span>

      <AssignmentStatusBadge status={row.status} className="shrink-0" />
    </Link>
  );
}
