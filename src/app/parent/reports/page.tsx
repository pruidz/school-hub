import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getChildReport } from "@/features/reports/queries";
import {
  HeadlineStats,
  RecentReturns,
  SubjectBreakdown,
  TrendChart,
  WeakTopicsCard,
  WindowTabs,
  formatRange,
} from "@/features/reports/report-sections";
import { DEFAULT_WINDOW, isWindowKey } from "@/features/reports/windows";
import { requireParent } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.reports.title };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * P7 — the quality report for one child.
 *
 * The screen answers three questions in order: is it getting better or worse,
 * in which subject, and on which topic is the child stuck. Completion is
 * deliberately *not* the headline — a child can hand in everything and still be
 * learning nothing if half of it comes back — so the redo rate is given the
 * loudest card and the whole trend strip's lower half.
 *
 * All the reads happen in `@/features/reports/queries`; this file only decides
 * what to show when there is nothing worth showing.
 */
export default async function ParentReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireParent();

  const params = await searchParams;
  const windowParam = first(params.window);
  const windowKey = isWindowKey(windowParam) ? windowParam : DEFAULT_WINDOW;

  // No `?child=` here: the active child is the shell switcher's cookie, the
  // same source /parent/schedule and /parent/subjects read.
  const result = await getChildReport({
    window: windowKey,
    unnamedSubjectLabel: ka.reports.noSubject,
  });

  if (result.kind === "no-children") return <NoChildren />;

  const { data } = result;
  const { child, current, window: win } = data;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {ka.reports.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {child.name} · {ka.reports.subtitle}
          </p>
        </div>
        <WindowTabs active={win.key} />
      </header>

      {!data.hasAnyAssignments ? (
        <NothingYet />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {formatRange(win.current)}
          </p>

          {current.total === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{ka.reports.emptyWindowTitle}</CardTitle>
                <CardDescription>{ka.reports.emptyWindowBody}</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              {/* Under five assignments, every percentage on this page would be
                  noise, so they are suppressed and the reason is said out loud
                  rather than left for the parent to infer. */}
              {!current.reliable ? (
                <Alert>
                  <AlertTitle>{ka.reports.lowSampleTitle}</AlertTitle>
                  <AlertDescription>
                    {t("reports.lowSampleNote", { count: current.total })}
                  </AlertDescription>
                </Alert>
              ) : null}

              <HeadlineStats
                range={win.current}
                current={current}
                previous={data.previous}
              />

              <p className="text-xs text-muted-foreground">
                {ka.reports.hint}
              </p>
            </>
          )}

          <TrendChart points={data.trend} />

          {current.total > 0 ? (
            <>
              <SubjectBreakdown
                range={win.current}
                rows={data.subjectRows}
              />
              <WeakTopicsCard
                range={win.current}
                byRedo={data.weakByRedo}
                byRating={data.weakByRating}
                names={data.topicNames}
              />
            </>
          ) : null}

          <RecentReturns items={data.recentReturns} />
        </>
      )}
    </div>
  );
}

/** A family that has not added a child yet. */
function NoChildren() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.parent.noChildren}</CardTitle>
      </CardHeader>
      <CardContent className="grid justify-items-start gap-4">
        <p className="text-sm text-muted-foreground">
          {ka.parent.noActiveChild}
        </p>
        <Button asChild variant="outline">
          <Link href="/parent/children">{ka.parent.manageChildren}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * A child with no homework on record at all. This is the first thing a new
 * family sees here, so it explains what the screen will become instead of
 * showing five dashes and an empty grid.
 */
function NothingYet() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.reports.emptyTitle}</CardTitle>
        <CardDescription>{ka.reports.emptyBody}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/parent/assignments/new">{ka.parent.newAssignment}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
