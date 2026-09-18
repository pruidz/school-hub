/**
 * The visible half of P7.
 *
 * Every one of these is a plain function component with no hooks and no
 * `"use client"` — the whole report renders on the server, including the window
 * picker, which is three links rather than a state machine.
 *
 * Two house rules run through all of it:
 *   - no number without its denominator, and no percentage at all when the
 *     window is too small to carry one (`Metrics.reliable`);
 *   - no number without a link to the rows behind it (`reportListHref`).
 */

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateShort } from "@/features/schedule/dates";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import {
  direction,
  percent,
  type Metrics,
  type SubjectMetrics,
  type TopicStat,
  type TrendPoint,
} from "./metrics";
import type { RecentReturn } from "./queries";
import { WINDOW_KEYS, type DateRange, type WindowKey } from "./windows";

/* -------------------------------------------------------------------------- */
/*  links                                                                      */
/* -------------------------------------------------------------------------- */

export type DrillTarget = {
  range: DateRange;
  metric: "all" | "approved" | "returned" | "late" | "open" | "timed" | "rated";
  /** A subject id, or the literal `"none"` for assignments without a subject. */
  subjectId?: string | null;
  topicId?: string | null;
};

/**
 * The URL for "show me the rows this number came from".
 *
 * Deliberately no `child` in the query string: which child a parent is looking
 * at lives in the `sh_active_child` cookie the shell's switcher writes, exactly
 * as on /parent/schedule and /parent/subjects. Put it in the URL as well and
 * the two disagree the moment somebody uses the switcher.
 */
export function reportListHref(target: DrillTarget): string {
  const params = new URLSearchParams({
    from: target.range.from,
    to: target.range.to,
    metric: target.metric,
  });
  if (target.subjectId) params.set("subject", target.subjectId);
  if (target.topicId) params.set("topic", target.topicId);
  return `/parent/reports/list?${params.toString()}`;
}

const WINDOW_LABELS: Record<WindowKey, string> = {
  week: ka.reports.windowWeek,
  "4weeks": ka.reports.window4Weeks,
  term: ka.reports.windowTerm,
};

export function formatRange(range: DateRange): string {
  return t("reports.range", {
    from: formatDateShort(range.from),
    to: formatDateShort(range.to),
  });
}

/* -------------------------------------------------------------------------- */
/*  window picker                                                              */
/* -------------------------------------------------------------------------- */

export function WindowTabs({ active }: { active: WindowKey }) {
  return (
    <nav
      aria-label={ka.reports.windowLabel}
      className="inline-flex w-full max-w-full overflow-x-auto rounded-lg border p-1 sm:w-auto"
    >
      {WINDOW_KEYS.map((key) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={`/parent/reports?window=${key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {WINDOW_LABELS[key]}
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*  headline numbers                                                           */
/* -------------------------------------------------------------------------- */

function DeltaArrow({
  current,
  previous,
  goodWhen,
}: {
  current: number | null;
  previous: number | null;
  /** Which way of moving is an improvement for this particular metric. */
  goodWhen: "up" | "down";
}) {
  const dir = direction(current, previous);
  if (dir === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="size-3" aria-hidden />
        <span className="sr-only">{ka.reports.trendFlat}</span>
      </span>
    );
  }

  const good = dir === goodWhen;
  const Icon = dir === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">
        {good ? ka.reports.trendBetter : ka.reports.trendWorse}
      </span>
    </span>
  );
}

function StatCard({
  label,
  hint,
  value,
  sub,
  previousText,
  href,
  delta,
  emphasis = false,
}: {
  label: string;
  hint: string;
  value: string;
  sub: string | null;
  previousText: string;
  href: string;
  delta?: { current: number | null; previous: number | null; goodWhen: "up" | "down" };
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "grid content-start gap-1 rounded-xl border p-3 transition-colors hover:bg-muted/60",
        emphasis &&
          "col-span-2 border-primary/50 bg-primary/5 ring-1 ring-primary/20 md:col-span-1",
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            emphasis && "text-3xl",
          )}
        >
          {value}
        </span>
        {delta ? <DeltaArrow {...delta} /> : null}
      </span>
      {sub ? (
        <span className="text-xs tabular-nums text-muted-foreground">{sub}</span>
      ) : null}
      <span className="text-[11px] leading-tight text-muted-foreground">
        {previousText}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground/80">
        {hint}
      </span>
    </Link>
  );
}

const DASH = "—";

export function HeadlineStats({
  range,
  current,
  previous,
}: {
  range: DateRange;
  current: Metrics;
  previous: Metrics;
}) {
  const show = current.reliable;
  const showPrev = previous.reliable;

  // With too few assignments the percentage is replaced by the raw count, and
  // the comparison with the previous period is dropped rather than faked.
  const rate = (value: number | null) => (show ? (percent(value) ?? DASH) : DASH);
  const prevRate = (value: number | null, part: number, whole: number) =>
    showPrev
      ? t("reports.previousLabel", { value: percent(value) ?? DASH })
      : previous.total > 0
        ? t("reports.previousLabel", {
            value: t("reports.countOf", { part, total: whole }),
          })
        : ka.reports.previousNone;

  const href = (metric: DrillTarget["metric"]) =>
    reportListHref({ range, metric });

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {/* Redo rate leads the row on every screen size: it is the quality
          signal, the rest are throughput. */}
      <StatCard
        emphasis
        label={ka.reports.redoRate}
        hint={ka.reports.redoRateHint}
        value={rate(current.redoRate)}
        sub={t("reports.countOf", {
          part: current.returned,
          total: current.total,
        })}
        previousText={prevRate(
          previous.redoRate,
          previous.returned,
          previous.total,
        )}
        href={href("returned")}
        delta={
          show && showPrev
            ? {
                current: current.redoRate,
                previous: previous.redoRate,
                goodWhen: "down",
              }
            : undefined
        }
      />

      <StatCard
        label={ka.reports.completion}
        hint={ka.reports.completionHint}
        value={rate(current.completionRate)}
        sub={t("reports.countOf", {
          part: current.approved,
          total: current.total,
        })}
        previousText={prevRate(
          previous.completionRate,
          previous.approved,
          previous.total,
        )}
        href={href("approved")}
        delta={
          show && showPrev
            ? {
                current: current.completionRate,
                previous: previous.completionRate,
                goodWhen: "up",
              }
            : undefined
        }
      />

      <StatCard
        label={ka.reports.onTime}
        hint={ka.reports.onTimeHint}
        value={
          show && current.onTimeBase >= 1 ? (percent(current.onTimeRate) ?? DASH) : DASH
        }
        sub={t("reports.countOf", {
          part: current.onTime,
          total: current.onTimeBase,
        })}
        previousText={prevRate(previous.onTimeRate, previous.onTime, previous.onTimeBase)}
        href={href("late")}
        delta={
          show && showPrev
            ? {
                current: current.onTimeRate,
                previous: previous.onTimeRate,
                goodWhen: "up",
              }
            : undefined
        }
      />

      {/* Median, not mean: one forgotten timer left running at 240 minutes
          would otherwise redefine the child's whole week. */}
      <StatCard
        label={ka.reports.medianMinutes}
        hint={ka.reports.medianMinutesHint}
        value={
          current.medianMinutes === null
            ? DASH
            : `${current.medianMinutes} ${ka.assignments.minutesUnit}`
        }
        sub={t("reports.basedOn", { count: current.timedCount })}
        previousText={
          previous.medianMinutes === null
            ? ka.reports.previousNone
            : t("reports.previousLabel", {
                value: `${previous.medianMinutes} ${ka.assignments.minutesUnit}`,
              })
        }
        href={href("timed")}
      />

      <StatCard
        label={ka.reports.avgSelfRating}
        hint={ka.reports.avgSelfRatingHint}
        value={
          current.avgSelfRating === null
            ? DASH
            : t("reports.ofFive", { value: current.avgSelfRating.toFixed(1) })
        }
        sub={t("reports.basedOn", { count: current.ratedCount })}
        previousText={
          previous.avgSelfRating === null
            ? ka.reports.previousNone
            : t("reports.previousLabel", {
                value: t("reports.ofFive", {
                  value: previous.avgSelfRating.toFixed(1),
                }),
              })
        }
        href={href("rated")}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  by subject                                                                 */
/* -------------------------------------------------------------------------- */

function cellValue(metrics: Metrics, value: number | null): string {
  return metrics.reliable ? (percent(value) ?? DASH) : DASH;
}

export function SubjectBreakdown({
  range,
  rows,
}: {
  range: DateRange;
  rows: SubjectMetrics[];
}) {
  // The weakest subject is called out above the table so the answer survives a
  // 375px screen where the table itself has to scroll sideways.
  const weakest = rows.find(
    (row) => row.metrics.reliable && (row.metrics.redoRate ?? 0) > 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.reports.bySubject}</CardTitle>
        <CardDescription>{ka.reports.bySubjectHint}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ka.reports.subjectsEmpty}
          </p>
        ) : (
          <>
            {weakest ? (
              <Link
                href={reportListHref({
                  range,
                  metric: "returned",
                  subjectId: weakest.subjectId ?? "none",
                })}
                className="grid gap-1 rounded-xl border border-destructive/40 bg-destructive/5 p-3 transition-colors hover:bg-destructive/10"
              >
                <span className="text-sm font-medium">
                  {t("reports.weakestTitle", { subject: weakest.name })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("reports.weakestBody", {
                    returned: weakest.metrics.returned,
                    total: weakest.metrics.total,
                    completion:
                      percent(weakest.metrics.completionRate) ?? DASH,
                  })}
                </span>
              </Link>
            ) : null}

            <div className="-mx-2 overflow-x-auto px-2">
              <Table className="min-w-[34rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{ka.reports.colSubject}</TableHead>
                    <TableHead className="text-right">
                      {ka.reports.colTotal}
                    </TableHead>
                    <TableHead className="text-right">
                      {ka.reports.colRedo}
                    </TableHead>
                    <TableHead className="text-right">
                      {ka.reports.colCompletion}
                    </TableHead>
                    <TableHead className="text-right">
                      {ka.reports.colOnTime}
                    </TableHead>
                    <TableHead className="text-right">
                      {ka.reports.colMinutes}
                    </TableHead>
                    <TableHead className="text-right">
                      {ka.reports.colRating}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const key = row.subjectId ?? "none";
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Link
                            href={reportListHref({
                              range,
                              metric: "all",
                              subjectId: key,
                            })}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "size-2.5 shrink-0 rounded-full",
                                !row.color && "bg-border",
                              )}
                              style={
                                row.color
                                  ? { backgroundColor: row.color }
                                  : undefined
                              }
                            />
                            <span className="truncate font-medium">
                              {row.name}
                            </span>
                            {row === weakest ? (
                              <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                                {ka.reports.weakestBadge}
                              </span>
                            ) : null}
                            {!row.metrics.reliable ? (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {ka.reports.lowSampleBadge}
                              </span>
                            ) : null}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.metrics.total}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Link
                            href={reportListHref({
                              range,
                              metric: "returned",
                              subjectId: key,
                            })}
                            className="hover:underline"
                          >
                            {cellValue(row.metrics, row.metrics.redoRate)}
                            <span className="ms-1 text-xs text-muted-foreground">
                              ({row.metrics.returned})
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Link
                            href={reportListHref({
                              range,
                              metric: "approved",
                              subjectId: key,
                            })}
                            className="hover:underline"
                          >
                            {cellValue(row.metrics, row.metrics.completionRate)}
                            <span className="ms-1 text-xs text-muted-foreground">
                              ({row.metrics.approved})
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.metrics.onTimeBase === 0
                            ? DASH
                            : cellValue(row.metrics, row.metrics.onTimeRate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.metrics.medianMinutes ?? DASH}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.metrics.avgSelfRating === null
                            ? DASH
                            : row.metrics.avgSelfRating.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  weak topics                                                                */
/* -------------------------------------------------------------------------- */

function TopicList({
  range,
  heading,
  topics,
  names,
  render,
}: {
  range: DateRange;
  heading: string;
  topics: TopicStat[];
  names: Record<string, string>;
  render: (topic: TopicStat) => string;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{heading}</h3>
      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ka.reports.topicsEmpty}</p>
      ) : (
        <ol className="grid gap-1.5">
          {topics.map((topic) => (
            <li key={topic.topicId}>
              <Link
                href={reportListHref({
                  range,
                  metric: "all",
                  topicId: topic.topicId,
                })}
                className="flex items-center justify-between gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/60"
              >
                <span className="min-w-0 grid gap-0.5">
                  <span className="truncate text-sm">
                    {names[topic.topicId] ?? ka.reports.unknownTopic}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("reports.topicSamples", { count: topic.total })}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {render(topic)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function WeakTopicsCard({
  range,
  byRedo,
  byRating,
  names,
}: {
  range: DateRange;
  byRedo: TopicStat[];
  byRating: TopicStat[];
  names: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.reports.weakTopics}</CardTitle>
        <CardDescription>{ka.reports.topicsFloorNote}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <TopicList
          range={range}
          heading={ka.reports.weakTopicsByRedo}
          topics={byRedo}
          names={names}
          render={(topic) => t("reports.topicReturned", { count: topic.returned })}
        />
        <TopicList
          range={range}
          heading={ka.reports.weakTopicsByRating}
          topics={byRating}
          names={names}
          render={(topic) =>
            t("reports.ofFive", {
              value: (topic.avgSelfRating as number).toFixed(1),
            })
          }
        />
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  trend                                                                      */
/* -------------------------------------------------------------------------- */

const CHART_WIDTH = 320;
const COLUMN = CHART_WIDTH / 8;
const BAR = 22;
const ROW_HEIGHT = 52;
const TOP_BASE = 8 + ROW_HEIGHT; // completion bars grow upward to y = 8
const BOTTOM_TOP = TOP_BASE + 14; // redo bars grow downward from here
const LABEL_Y = BOTTOM_TOP + ROW_HEIGHT + 14;

/**
 * Eight weeks of completion (up) and redo (down), as inline SVG.
 *
 * No chart library, and no hard-coded colours either: the bars are painted with
 * `fill-primary` / `fill-destructive` / `fill-muted`, so the whole thing
 * re-themes with the rest of the app and stays legible in dark mode. Every bar
 * carries a `<title>` with its raw counts, and weeks too thin to mean anything
 * are drawn hollow rather than confidently.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const hasData = points.some((point) => point.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.reports.trend}</CardTitle>
        <CardDescription>{ka.reports.trendHint}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!hasData ? (
          <p className="text-sm text-muted-foreground">{ka.reports.trendEmpty}</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${LABEL_Y + 6}`}
              className="h-auto w-full"
              role="img"
              aria-label={ka.reports.trendAria}
            >
              {points.map((point, index) => {
                const x = index * COLUMN + (COLUMN - BAR) / 2;
                const completion = point.completionRate ?? 0;
                const redo = point.redoRate ?? 0;
                const upHeight = Math.max(point.total > 0 ? 2 : 0, completion * ROW_HEIGHT);
                const downHeight = Math.max(point.total > 0 ? 2 : 0, redo * ROW_HEIGHT);
                const summary =
                  point.total === 0
                    ? t("reports.trendWeekEmpty", {
                        from: formatDateShort(point.from),
                        to: formatDateShort(point.to),
                      })
                    : t("reports.trendWeekSummary", {
                        from: formatDateShort(point.from),
                        to: formatDateShort(point.to),
                        approved: point.approved,
                        total: point.total,
                        returned: point.returned,
                      });

                return (
                  <g key={point.index}>
                    <title>{summary}</title>

                    {/* 0–100% frame, so a short bar reads as "low", not "no data". */}
                    <rect
                      x={x}
                      y={TOP_BASE - ROW_HEIGHT}
                      width={BAR}
                      height={ROW_HEIGHT}
                      rx={3}
                      className="fill-muted"
                    />
                    <rect
                      x={x}
                      y={BOTTOM_TOP}
                      width={BAR}
                      height={ROW_HEIGHT}
                      rx={3}
                      className="fill-muted"
                    />

                    {point.total > 0 ? (
                      <>
                        <rect
                          x={x}
                          y={TOP_BASE - upHeight}
                          width={BAR}
                          height={upHeight}
                          rx={3}
                          className={cn(
                            "fill-primary",
                            !point.reliable && "opacity-40",
                          )}
                        />
                        <rect
                          x={x}
                          y={BOTTOM_TOP}
                          width={BAR}
                          height={downHeight}
                          rx={3}
                          className={cn(
                            "fill-destructive",
                            !point.reliable && "opacity-40",
                          )}
                        />
                      </>
                    ) : null}
                  </g>
                );
              })}

              {/* Only three labels: eight dates do not fit on a phone. */}
              {[0, 3, 7].map((index) => {
                const point = points[index];
                if (!point) return null;
                return (
                  <text
                    key={point.index}
                    x={index * COLUMN + COLUMN / 2}
                    y={LABEL_Y}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                  >
                    {formatDateShort(point.from)}
                  </text>
                );
              })}
            </svg>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm bg-primary" />
                {ka.reports.trendCompletion}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm bg-destructive"
                />
                {ka.reports.trendRedo}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  recent returns                                                             */
/* -------------------------------------------------------------------------- */

export function RecentReturns({ items }: { items: RecentReturn[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.reports.recentReturns}</CardTitle>
        <CardDescription>{ka.reports.recentReturnsHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ka.reports.recentReturnsEmpty}
          </p>
        ) : (
          <ul className="grid gap-2">
            {items.map((item) => (
              <li key={item.eventId}>
                <Link
                  href={`/parent/assignments/${item.assignmentId}`}
                  className="flex gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/60"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "w-1.5 shrink-0 self-stretch rounded-full",
                      !item.subjectColor && "bg-border",
                    )}
                    style={
                      item.subjectColor
                        ? { backgroundColor: item.subjectColor }
                        : undefined
                    }
                  />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {item.subjectName ? <span>{item.subjectName}</span> : null}
                      <span>{formatDateShort(item.day)}</span>
                    </span>
                    <span className="truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        item.comment
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.comment ?? ka.reports.noComment}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
