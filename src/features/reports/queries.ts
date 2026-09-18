import "server-only";

/**
 * Reads for P7, the per-child report.
 *
 * Shape of a page load — six statements at most, in three waves, and the count
 * does not grow with the amount of homework:
 *
 *   wave 1  children                     (which child, and is it ours)
 *   wave 2  assignments · subjects · lifetime count       (parallel)
 *   wave 3  topics (≤10 ids) · redo events (≤200 ids)     (parallel, both optional)
 *
 * The one real N+1 trap on this screen is `assignment_events`: it carries no
 * `child_id`, so the events have to be resolved through `assignments`. Rather
 * than a lookup per row, the assignment query has already told us exactly which
 * assignments ever came back, and that small id list is handed to a single
 * `in(...)` query.
 *
 * Why the aggregation happens in TypeScript and not in SQL: PostgREST can only
 * group and aggregate through a view or an RPC, and `supabase/**` belongs to
 * another agent on this task — no migration may be added here. What is pushed
 * down instead is all of the *selection*: one child, an explicit column list
 * (never `select *`), and a date range that covers the window, the comparison
 * period and the eight-week trend in a single statement. The rows that come
 * back are one child's homework for at most one term, which is hundreds, not
 * millions. The reduction itself lives in `./metrics`.
 */

import { listSubjects, type SubjectLite } from "@/features/assignments/queries";
import { resolveActiveChild, type ActiveChild } from "@/features/children/queries";
import { addDaysIso, isoDateOf } from "@/features/schedule/dates";
import { requireParent } from "@/lib/auth/session";
import type { AssignmentStatus } from "@/lib/db.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

import {
  bySubject,
  computeMetrics,
  rowsIn,
  weakTopics,
  weeklyTrend,
  type Metrics,
  type ReportRow,
  type SubjectMetrics,
  type TopicStat,
  type TrendPoint,
} from "./metrics";
import {
  resolveWindow,
  type DateRange,
  type ResolvedWindow,
  type WindowKey,
} from "./windows";

/** Hard ceiling on one child's rows for one term. Nothing realistic hits it. */
const MAX_ROWS = 2000;

/** How many returned assignments we are willing to name in one `in(...)`. */
const MAX_RETURN_IDS = 200;

const ASSIGNMENT_COLUMNS =
  "id, title, subject_id, topic_id, status, due_date, created_at, submitted_at, minutes_spent, self_rating, redo_count, review_comment";

type AssignmentRowShape = {
  id: string;
  title: string;
  subject_id: string | null;
  topic_id: string | null;
  status: AssignmentStatus;
  due_date: string | null;
  created_at: string;
  submitted_at: string | null;
  minutes_spent: number | null;
  self_rating: number | null;
  redo_count: number;
  review_comment: string | null;
};

function toReportRow(row: AssignmentRowShape): ReportRow {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    status: row.status,
    day: row.due_date ?? isoDateOf(row.created_at) ?? row.created_at.slice(0, 10),
    dueDate: row.due_date,
    submittedDay: row.submitted_at ? isoDateOf(row.submitted_at) : null,
    minutesSpent: row.minutes_spent,
    selfRating: row.self_rating,
    redoCount: row.redo_count,
    reviewComment: row.review_comment,
    returned: row.redo_count > 0 || row.status === "redo",
  };
}

/**
 * One statement for every assignment that falls inside `[from, to]`.
 *
 * Dated work is filtered on `due_date` directly. Undated work is filtered on
 * `created_at`, which is a `timestamptz` and therefore off by up to a day from
 * a Tbilisi calendar day — so the bounds are deliberately widened by a day on
 * each side and the exact day is settled in `toReportRow`/`rowsIn` afterwards.
 * Widening a filter is safe; hard-coding a UTC offset into a query is not.
 */
async function fetchRows(
  supabase: ServerClient,
  childId: string,
  range: DateRange,
): Promise<ReportRow[]> {
  const createdFrom = `${addDaysIso(range.from, -1)}T00:00:00Z`;
  const createdTo = `${addDaysIso(range.to, 2)}T00:00:00Z`;

  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("child_id", childId)
    .or(
      `and(due_date.gte.${range.from},due_date.lte.${range.to}),` +
        `and(due_date.is.null,created_at.gte.${createdFrom},created_at.lt.${createdTo})`,
    )
    .order("due_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  return ((data ?? []) as AssignmentRowShape[])
    .map(toReportRow)
    .filter((row) => row.day >= range.from && row.day <= range.to);
}

/**
 * The child this report is about.
 *
 * `resolveActiveChild` only ever returns children the RLS-scoped client can
 * see, so matching a query-string id against that list *is* the ownership
 * check: an id from another family simply does not match and the parent falls
 * back to their own first child instead of reading someone else's numbers.
 */
async function resolveChild(childIdParam: string | null) {
  await requireParent();
  return resolveActiveChild(childIdParam);
}

/* -------------------------------------------------------------------------- */
/*  the report                                                                 */
/* -------------------------------------------------------------------------- */

export type RecentReturn = {
  eventId: string;
  assignmentId: string;
  title: string;
  subjectName: string | null;
  subjectColor: string | null;
  /** Calendar day the assignment was sent back. */
  day: string;
  comment: string | null;
};

export type ReportData = {
  child: ActiveChild;
  children: ActiveChild[];
  window: ResolvedWindow;
  current: Metrics;
  previous: Metrics;
  subjects: SubjectLite[];
  subjectRows: SubjectMetrics[];
  weakByRedo: TopicStat[];
  weakByRating: TopicStat[];
  topicNames: Record<string, string>;
  trend: TrendPoint[];
  recentReturns: RecentReturn[];
  /** Has this child ever had a single assignment? Drives the empty state. */
  hasAnyAssignments: boolean;
};

export type ReportResult =
  | { kind: "no-children" }
  | { kind: "ok"; data: ReportData };

export async function getChildReport(params: {
  childId?: string | null;
  window?: WindowKey;
  unnamedSubjectLabel: string;
}): Promise<ReportResult> {
  const { active, all } = await resolveChild(params.childId ?? null);
  if (!active) return { kind: "no-children" };

  const supabase = await createClient();
  const win = resolveWindow(params.window);

  const [rows, subjects, lifetime] = await Promise.all([
    fetchRows(supabase, active.id, { from: win.fetchFrom, to: win.today }),
    listSubjects(supabase, [active.id]),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("child_id", active.id),
  ]);

  const currentRows = rowsIn(rows, win.current);
  const previousRows = rowsIn(rows, win.previous);

  const weak = weakTopics(currentRows);
  const topicIds = Array.from(
    new Set([
      ...weak.byRedo.map((topic) => topic.topicId),
      ...weak.byRating.map((topic) => topic.topicId),
    ]),
  );

  // Only assignments that actually came back can have a `redo` event, and that
  // is already known from the rows above — so the event lookup is one query
  // over a short id list instead of one query per row.
  const returnedIds = rows
    .filter((row) => row.returned)
    .slice(0, MAX_RETURN_IDS)
    .map((row) => row.id);

  const [topicRows, events] = await Promise.all([
    topicIds.length > 0
      ? supabase.from("topics").select("id, name").in("id", topicIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    returnedIds.length > 0
      ? supabase
          .from("assignment_events")
          .select("id, assignment_id, comment, created_at")
          .in("assignment_id", returnedIds)
          .eq("to_status", "redo")
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({
          data: [] as {
            id: string;
            assignment_id: string;
            comment: string | null;
            created_at: string;
          }[],
        }),
  ]);

  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const recentReturns: RecentReturn[] = (events.data ?? []).flatMap((event) => {
    const row = rowById.get(event.assignment_id);
    if (!row) return [];
    const subject = row.subjectId ? subjectById.get(row.subjectId) : undefined;
    return [
      {
        eventId: event.id,
        assignmentId: row.id,
        title: row.title,
        subjectName: subject?.name ?? null,
        subjectColor: subject?.color ?? null,
        day: isoDateOf(event.created_at) ?? event.created_at.slice(0, 10),
        // The trigger copies the parent's note onto the event; fall back to the
        // assignment's own field for rows written before that landed.
        comment: event.comment ?? row.reviewComment,
      },
    ];
  });

  return {
    kind: "ok",
    data: {
      child: active,
      children: all,
      window: win,
      current: computeMetrics(currentRows),
      previous: computeMetrics(previousRows),
      subjects,
      subjectRows: bySubject(currentRows, subjects, params.unnamedSubjectLabel),
      weakByRedo: weak.byRedo,
      weakByRating: weak.byRating,
      topicNames: Object.fromEntries(
        (topicRows.data ?? []).map((topic) => [topic.id, topic.name]),
      ),
      trend: weeklyTrend(rows, win.trend),
      recentReturns,
      hasAnyAssignments: (lifetime.count ?? 0) > 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  drill-down                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Which slice of a window a number on the report stood for. Every headline and
 * every table cell links to one of these, so a parent can always see the rows
 * behind a percentage rather than being asked to trust it.
 */
export type ReportMetricFilter =
  | "all"
  | "approved"
  | "returned"
  | "late"
  | "open"
  | "timed"
  | "rated";

export const REPORT_METRIC_FILTERS: readonly ReportMetricFilter[] = [
  "all",
  "approved",
  "returned",
  "late",
  "open",
  "timed",
  "rated",
];

export function isReportMetricFilter(
  value: unknown,
): value is ReportMetricFilter {
  return (
    typeof value === "string" &&
    (REPORT_METRIC_FILTERS as readonly string[]).includes(value)
  );
}

function matchesMetric(row: ReportRow, metric: ReportMetricFilter): boolean {
  switch (metric) {
    case "all":
      return true;
    case "approved":
      return row.status === "approved";
    case "returned":
      return row.returned;
    case "late":
      return (
        row.status === "approved" &&
        row.dueDate !== null &&
        row.submittedDay !== null &&
        row.submittedDay > row.dueDate
      );
    case "open":
      return row.status !== "approved";
    case "timed":
      return typeof row.minutesSpent === "number";
    case "rated":
      return typeof row.selfRating === "number";
  }
}

export type ReportListResult =
  | { kind: "no-children" }
  | {
      kind: "ok";
      child: ActiveChild;
      range: DateRange;
      rows: ReportRow[];
      subjects: SubjectLite[];
      subjectName: string | null;
      topicName: string | null;
    };

export async function getReportAssignments(params: {
  childId?: string | null;
  range: DateRange;
  metric: ReportMetricFilter;
  subjectId?: string | null;
  topicId?: string | null;
}): Promise<ReportListResult> {
  const { active } = await resolveChild(params.childId ?? null);
  if (!active) return { kind: "no-children" };

  const supabase = await createClient();

  const [rows, subjects] = await Promise.all([
    fetchRows(supabase, active.id, params.range),
    listSubjects(supabase, [active.id]),
  ]);

  // A subject id from the query string is only honoured once it is known to
  // belong to this child.
  const subject =
    params.subjectId !== undefined && params.subjectId !== null
      ? (subjects.find((candidate) => candidate.id === params.subjectId) ?? null)
      : null;
  const subjectFilterApplied = params.subjectId !== undefined && params.subjectId !== null;

  const filtered = rows
    .filter((row) => matchesMetric(row, params.metric))
    .filter((row) =>
      subjectFilterApplied
        ? params.subjectId === "none"
          ? row.subjectId === null
          : row.subjectId === subject?.id
        : true,
    )
    .filter((row) => (params.topicId ? row.topicId === params.topicId : true));

  let topicName: string | null = null;
  if (params.topicId) {
    const { data } = await supabase
      .from("topics")
      .select("id, name")
      .eq("id", params.topicId)
      .maybeSingle();
    topicName = data?.name ?? null;
  }

  return {
    kind: "ok",
    child: active,
    range: params.range,
    rows: filtered,
    subjects,
    subjectName:
      params.subjectId === "none" ? null : (subject?.name ?? null),
    topicName,
  };
}
