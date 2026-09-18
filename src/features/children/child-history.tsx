import "server-only";

import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";

import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { formatDateShort, isoWeekday, todayIso } from "@/features/schedule/dates";

import { getChildHistory, HISTORY_DAYS, type HistoryDay } from "./history";

/**
 * "ისტორია" — the last 30 days, newest first, one line each.
 *
 * The screen has exactly one job: let the eye find the days that were skipped
 * without reading anything. So the row is ordered by how alarming it is, not by
 * how much information it can carry — a coloured rail, then the filled/expected
 * ratio, then a bar of the same width the ratio describes. A day with nothing
 * expected of it (weekend, holiday) is dimmed rather than scored, otherwise
 * every Sunday would shout.
 */

type DayTone = "missed" | "partial" | "done" | "idle";

function toneOf(day: HistoryDay): DayTone {
  const expected = Math.max(day.scheduled, day.lessons);
  if (expected === 0) return day.assignments > 0 ? "done" : "idle";
  if (day.recorded === 0) return "missed";
  if (day.recorded < expected) return "partial";
  return "done";
}

const RAIL: Record<DayTone, string> = {
  missed: "bg-amber-500",
  partial: "bg-amber-400/70",
  done: "bg-emerald-500/60",
  idle: "bg-border",
};

/** ISO weekday 1–7, indexed from 1. */
const SHORT_WEEKDAY = [
  "",
  ka.weekday.short1,
  ka.weekday.short2,
  ka.weekday.short3,
  ka.weekday.short4,
  ka.weekday.short5,
  ka.weekday.short6,
  ka.weekday.short7,
];

const RATIO: Record<DayTone, string> = {
  missed: "font-semibold text-amber-700 dark:text-amber-400",
  partial: "font-medium text-amber-700 dark:text-amber-400",
  done: "text-muted-foreground",
  idle: "text-muted-foreground",
};

export async function ChildHistory({ childId }: { childId: string }) {
  const today = todayIso();
  const days = await getChildHistory(childId, HISTORY_DAYS, today);

  const active = days.filter(
    (day) => day.scheduled > 0 || day.lessons > 0 || day.assignments > 0,
  );
  const gaps = days.filter((day) => {
    const tone = toneOf(day);
    return tone === "missed" || tone === "partial";
  }).length;

  return (
    <section className="grid gap-3">
      <header className="grid gap-1">
        <h2 className="text-lg font-semibold">{ka.children.historyTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {ka.children.historyHint}
        </p>
      </header>

      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="font-medium">{ka.children.historyEmpty}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {ka.children.historyEmptyHint}
          </p>
        </div>
      ) : (
        <>
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm",
              gaps > 0
                ? "font-medium text-amber-700 dark:text-amber-400"
                : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {gaps > 0 ? (
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
            ) : (
              <Check aria-hidden className="size-4 shrink-0" />
            )}
            {gaps > 0
              ? t("children.historySummary", { days: gaps })
              : ka.children.historySummaryClean}
          </p>

          <ul className="grid gap-1.5">
            {days.map((day) => (
              <li key={day.date}>
                <HistoryRow childId={childId} day={day} today={today} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function HistoryRow({
  childId,
  day,
  today,
}: {
  childId: string;
  day: HistoryDay;
  today: string;
}) {
  const tone = toneOf(day);
  const expected = Math.max(day.scheduled, day.lessons);
  const percent =
    expected === 0 ? 0 : Math.round((day.recorded / expected) * 100);

  return (
    <Link
      href={`/parent/children/${childId}?d=${day.date}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card py-2 pe-3 ps-0 transition-colors hover:bg-muted/60",
        tone === "idle" && "opacity-60",
        tone === "missed" && "border-amber-500/50",
      )}
    >
      <span
        aria-hidden
        className={cn("w-1.5 shrink-0 self-stretch rounded-s-lg", RAIL[tone])}
      />

      <span className="w-[4.5rem] shrink-0 sm:w-24">
        <span className="block truncate text-sm font-medium">
          {formatDateShort(day.date)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {day.date === today
            ? ka.common.today
            : SHORT_WEEKDAY[isoWeekday(day.date)]}
        </span>
      </span>

      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          {expected === 0 ? (
            <span className="text-muted-foreground">
              {ka.children.historyNoSchedule}
            </span>
          ) : (
            <span className={cn("tabular-nums", RATIO[tone])}>
              {t("children.historyRatio", {
                done: day.recorded,
                total: expected,
              })}{" "}
              {ka.children.historyLessonsLabel}
            </span>
          )}

          {day.assignments > 0 ? (
            <span className="text-muted-foreground">
              {t("children.lessonAssignmentCount", { count: day.assignments })}
              {day.open > 0
                ? ` · ${t("children.historyOpenLabel", { count: day.open })}`
                : null}
            </span>
          ) : null}
        </span>

        {expected > 0 ? (
          <span
            aria-hidden
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn("block h-full rounded-full", RAIL[tone])}
              style={{ width: `${percent}%` }}
            />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
