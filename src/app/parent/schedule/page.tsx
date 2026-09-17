import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireParent } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";
import { resolveActiveChild } from "@/features/children/queries";
import { formatDateLong, isIsoDate, todayIso } from "@/features/schedule/dates";
import { listSlotsActiveOn, listSubjects } from "@/features/schedule/queries";
import { ScheduleGrid } from "@/features/schedule/schedule-grid";
import { ScheduleToolbar } from "@/features/schedule/schedule-toolbar";

export const metadata: Metadata = { title: ka.schedule.title };

/**
 * P5 — the weekly timetable editor.
 *
 * `?from=` is the date the editor is showing ("today's active timetable" by
 * default). It is only ever a view: a change made while looking at a past date
 * still takes effect from today, and "new timetable from …" is the explicit way
 * to start a new version.
 */
export default async function ParentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireParent();

  const { from } = await searchParams;
  const today = todayIso();
  const asOf = typeof from === "string" && isIsoDate(from) ? from : today;

  const { active } = await resolveActiveChild();
  if (!active) return <NoChildren />;

  const [subjects, slots] = await Promise.all([
    listSubjects(active.id),
    listSlotsActiveOn(active.id, asOf),
  ]);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {ka.schedule.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {active.name} ·{" "}
          {asOf === today
            ? ka.schedule.asOfToday
            : t("schedule.effectiveFrom", { from: formatDateLong(asOf) })}
        </p>
      </header>

      <ScheduleToolbar childId={active.id} asOf={asOf} />

      {asOf < today ? (
        <Alert>
          <AlertDescription>{ka.schedule.pastNotice}</AlertDescription>
        </Alert>
      ) : null}

      {subjects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{ka.schedule.noSubjects}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/parent/subjects">{ka.schedule.goToSubjects}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScheduleGrid
          childId={active.id}
          asOf={asOf}
          slots={slots}
          subjects={subjects}
          isPast={asOf < today}
        />
      )}
    </div>
  );
}

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
