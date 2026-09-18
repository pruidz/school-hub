/**
 * The arithmetic behind the report.
 *
 * Pure functions over a flat row shape, deliberately separated from the
 * Supabase calls in `./queries` so the definitions of "completion", "on time"
 * and "returned" live in one readable place and can be reasoned about — and
 * argued with — without a database.
 *
 * Every rate carries the counts it was computed from. A percentage without its
 * denominator is the main way this kind of screen misleads people, so nothing
 * here returns a bare number.
 */

import type { AssignmentStatus } from "@/lib/db.types";

import type { DateRange, TrendWeek } from "./windows";
import { isWithin } from "./windows";

/**
 * Below this many assignments in a window, percentages are not shown at all.
 * Three assignments of which one came back is not a 33% redo rate, it is one
 * bad afternoon.
 */
export const MIN_WINDOW_SAMPLE = 5;

/** A topic needs at least this many assignments before it can be called weak. */
export const MIN_TOPIC_SAMPLE = 2;

/** The report's view of one assignment, already normalised to calendar days. */
export type ReportRow = {
  id: string;
  title: string;
  subjectId: string | null;
  topicId: string | null;
  status: AssignmentStatus;
  /**
   * The day this assignment counts towards: its due date, or the day it was
   * created when it has none. Without the fallback, undated work would vanish
   * from every window and quietly inflate completion.
   */
  day: string;
  dueDate: string | null;
  /** Calendar day of `submitted_at` in the family's time zone. */
  submittedDay: string | null;
  minutesSpent: number | null;
  selfRating: number | null;
  redoCount: number;
  reviewComment: string | null;
  /**
   * Came back at least once. `redo_count` only increments when the child
   * restarts, so an assignment sitting in `redo` right now still has a count of
   * zero — it plainly came back, and is counted here.
   */
  returned: boolean;
};

export type Metrics = {
  total: number;
  approved: number;
  returned: number;
  /** Approved on or before the due date. */
  onTime: number;
  /** Approved assignments that have both a due date and a submission time. */
  onTimeBase: number;
  completionRate: number | null;
  onTimeRate: number | null;
  redoRate: number | null;
  medianMinutes: number | null;
  timedCount: number;
  avgSelfRating: number | null;
  ratedCount: number;
  /** `false` when `total` is under `MIN_WINDOW_SAMPLE`: show counts, not rates. */
  reliable: boolean;
};

export const EMPTY_METRICS: Metrics = {
  total: 0,
  approved: 0,
  returned: 0,
  onTime: 0,
  onTimeBase: 0,
  completionRate: null,
  onTimeRate: null,
  redoRate: null,
  medianMinutes: null,
  timedCount: 0,
  avgSelfRating: null,
  ratedCount: 0,
  reliable: false,
};

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeMetrics(rows: ReportRow[]): Metrics {
  const total = rows.length;
  if (total === 0) return EMPTY_METRICS;

  const approvedRows = rows.filter((row) => row.status === "approved");
  const returned = rows.filter((row) => row.returned).length;

  // Only approved work with both a deadline and a submission time can be judged
  // late or not; anything else would have to be guessed at.
  const datedApprovals = approvedRows.filter(
    (row) => row.dueDate !== null && row.submittedDay !== null,
  );
  const onTime = datedApprovals.filter(
    (row) => (row.submittedDay as string) <= (row.dueDate as string),
  ).length;

  const minutes = rows
    .map((row) => row.minutesSpent)
    .filter((value): value is number => typeof value === "number" && value >= 0);
  const ratings = rows
    .map((row) => row.selfRating)
    .filter((value): value is number => typeof value === "number");

  return {
    total,
    approved: approvedRows.length,
    returned,
    onTime,
    onTimeBase: datedApprovals.length,
    completionRate: ratio(approvedRows.length, total),
    onTimeRate: ratio(onTime, datedApprovals.length),
    redoRate: ratio(returned, total),
    medianMinutes: median(minutes),
    timedCount: minutes.length,
    avgSelfRating: mean(ratings),
    ratedCount: ratings.length,
    reliable: total >= MIN_WINDOW_SAMPLE,
  };
}

export function rowsIn(rows: ReportRow[], range: DateRange): ReportRow[] {
  return rows.filter((row) => isWithin(row.day, range));
}

/* -------------------------------------------------------------------------- */
/*  by subject                                                                 */
/* -------------------------------------------------------------------------- */

export type SubjectMetrics = {
  subjectId: string | null;
  name: string;
  color: string | null;
  metrics: Metrics;
};

/**
 * Worst first.
 *
 * Redo rate leads, because a subject that keeps coming back is the one the
 * child is actually stuck in; completion and self-rating only break ties.
 * Subjects with too little data never rank as "weakest" — they sort last,
 * whatever their percentages happen to look like.
 */
export function compareWeakest(a: SubjectMetrics, b: SubjectMetrics): number {
  if (a.metrics.reliable !== b.metrics.reliable) {
    return a.metrics.reliable ? -1 : 1;
  }
  const redo = (b.metrics.redoRate ?? 0) - (a.metrics.redoRate ?? 0);
  if (Math.abs(redo) > 1e-9) return redo;

  const completion = (a.metrics.completionRate ?? 1) - (b.metrics.completionRate ?? 1);
  if (Math.abs(completion) > 1e-9) return completion;

  const rating = (a.metrics.avgSelfRating ?? 5) - (b.metrics.avgSelfRating ?? 5);
  if (Math.abs(rating) > 1e-9) return rating;

  return b.metrics.total - a.metrics.total;
}

export function bySubject(
  rows: ReportRow[],
  subjects: { id: string; name: string; color: string }[],
  unnamedLabel: string,
): SubjectMetrics[] {
  const groups = new Map<string | null, ReportRow[]>();
  for (const row of rows) {
    const key = row.subjectId;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const byId = new Map(subjects.map((subject) => [subject.id, subject]));

  return Array.from(groups.entries())
    .map<SubjectMetrics>(([subjectId, group]) => {
      const subject = subjectId ? byId.get(subjectId) : undefined;
      return {
        subjectId,
        name: subject?.name ?? unnamedLabel,
        color: subject?.color ?? null,
        metrics: computeMetrics(group),
      };
    })
    .sort(compareWeakest);
}

/* -------------------------------------------------------------------------- */
/*  weak topics                                                                */
/* -------------------------------------------------------------------------- */

export type TopicStat = {
  topicId: string;
  total: number;
  returned: number;
  returnedRate: number;
  avgSelfRating: number | null;
  ratedCount: number;
};

function topicStats(rows: ReportRow[]): TopicStat[] {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    if (!row.topicId) continue;
    const bucket = groups.get(row.topicId);
    if (bucket) bucket.push(row);
    else groups.set(row.topicId, [row]);
  }

  return Array.from(groups.entries())
    // One assignment is an anecdote. Two is the floor for saying anything.
    .filter(([, group]) => group.length >= MIN_TOPIC_SAMPLE)
    .map(([topicId, group]) => {
      const ratings = group
        .map((row) => row.selfRating)
        .filter((value): value is number => typeof value === "number");
      const returned = group.filter((row) => row.returned).length;
      return {
        topicId,
        total: group.length,
        returned,
        returnedRate: returned / group.length,
        avgSelfRating: mean(ratings),
        ratedCount: ratings.length,
      };
    });
}

export type WeakTopics = {
  byRedo: TopicStat[];
  byRating: TopicStat[];
};

export function weakTopics(rows: ReportRow[], limit = 5): WeakTopics {
  const stats = topicStats(rows);

  const byRedo = stats
    .filter((stat) => stat.returned > 0)
    .sort(
      (a, b) =>
        b.returned - a.returned ||
        b.returnedRate - a.returnedRate ||
        b.total - a.total,
    )
    .slice(0, limit);

  const byRating = stats
    .filter(
      (stat) => stat.avgSelfRating !== null && stat.ratedCount >= MIN_TOPIC_SAMPLE,
    )
    .sort(
      (a, b) =>
        (a.avgSelfRating as number) - (b.avgSelfRating as number) ||
        b.total - a.total,
    )
    .slice(0, limit);

  return { byRedo, byRating };
}

/* -------------------------------------------------------------------------- */
/*  trend                                                                      */
/* -------------------------------------------------------------------------- */

export type TrendPoint = TrendWeek & {
  total: number;
  approved: number;
  returned: number;
  completionRate: number | null;
  redoRate: number | null;
  reliable: boolean;
};

export function weeklyTrend(
  rows: ReportRow[],
  weeks: TrendWeek[],
): TrendPoint[] {
  return weeks.map((week) => {
    const group = rowsIn(rows, week);
    const approved = group.filter((row) => row.status === "approved").length;
    const returned = group.filter((row) => row.returned).length;
    return {
      ...week,
      total: group.length,
      approved,
      returned,
      completionRate: ratio(approved, group.length),
      redoRate: ratio(returned, group.length),
      // A week is short; three assignments is normal, so the bar is drawn but
      // marked as provisional rather than hidden.
      reliable: group.length >= MIN_TOPIC_SAMPLE,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

export function percent(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

export type Direction = "up" | "down" | "flat";

/** Which way a rate moved, ignoring changes too small to mean anything. */
export function direction(
  current: number | null,
  previous: number | null,
  epsilon = 0.02,
): Direction {
  if (current === null || previous === null) return "flat";
  const delta = current - previous;
  if (Math.abs(delta) < epsilon) return "flat";
  return delta > 0 ? "up" : "down";
}
