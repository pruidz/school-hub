/**
 * The shapes and the sorting rules behind C1 and C6 (SPEC 4a), with no
 * database and no React in them.
 *
 * Pure module — the queries build these values, the components only render
 * them, and the interesting decisions ("which section does this belong to",
 * "what colour is this cell") are testable on their own.
 */

import type { AssignmentStatus } from "@/lib/assignment-status";

/* -------------------------------------------------------------------------- */
/*  assignments                                                                */
/* -------------------------------------------------------------------------- */

/** One piece of homework, reduced to what the child's home screen shows. */
export type HomeAssignment = {
  id: string;
  title: string;
  status: AssignmentStatus;
  dueDate: string | null;
  sourceRef: string | null;
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string;
  /** The lesson it was GIVEN in — which is the cell it belongs to in the grid. */
  lessonId: string | null;
  reviewComment: string | null;
  redoCount: number;
};

/** Statuses that still ask something of the child. */
export const OPEN_STATUSES: readonly AssignmentStatus[] = [
  "assigned",
  "in_progress",
  "redo",
];

export function isOpen(status: AssignmentStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * Which section of the dashboard this piece of homework belongs to.
 *
 * Every open item lands in exactly one section. `redo` always goes to
 * „გადასაკეთებელი", even when it is also past its date: the parent's comment is
 * the thing the child has to read before doing anything, and showing the same
 * item twice — once as red, once as returned — is how a seven-year-old loses
 * track of how much work is actually left. An overdue returned item still says
 * so on the row.
 */
export type HomeSection = "overdue" | "tomorrow" | "prepare" | "returned";

export function sectionOf(
  item: HomeAssignment,
  today: string,
  tomorrow: string,
): HomeSection | null {
  if (!isOpen(item.status)) return null;
  if (item.status === "redo") return "returned";
  if (item.dueDate && item.dueDate < today) return "overdue";
  // `<= tomorrow`, not `=== tomorrow`: something still open and due TODAY has
  // not gone late yet, but it is not "to prepare" either — it belongs with the
  // work in front of the child, at the top of that section.
  if (item.dueDate && item.dueDate <= tomorrow) return "tomorrow";
  return "prepare";
}

/**
 * „ხვალისთვის" is ordered by TOMORROW's timetable, not by title or by when the
 * homework was written down: the child packs their bag in lesson order. A
 * subject with no lesson that day (a one-off project, a subject dropped from
 * the timetable) sorts last rather than disappearing.
 *
 * The bucket also holds anything still open and due TODAY — not late yet, but
 * plainly not something to leave until tomorrow — so the date comes first in
 * the comparison and those rows sit at the top of the section, labelled
 * „დღეს" by `formatDueLabel`.
 */
export function byLessonOrder(
  order: Map<string, number>,
): (a: HomeAssignment, b: HomeAssignment) => number {
  const rank = (item: HomeAssignment) =>
    (item.subjectId ? order.get(item.subjectId) : undefined) ??
    Number.MAX_SAFE_INTEGER;

  return (a, b) => {
    if (a.dueDate !== b.dueDate) return byDueDate(a, b);
    const delta = rank(a) - rank(b);
    if (delta !== 0) return delta;
    return a.title.localeCompare(b.title, "ka");
  };
}

/** „მოსამზადებელი" and „გადაცილებული": the nearest date first, undated last. */
export function byDueDate(a: HomeAssignment, b: HomeAssignment): number {
  if (a.dueDate === b.dueDate) return a.title.localeCompare(b.title, "ka");
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

/* -------------------------------------------------------------------------- */
/*  lessons still to be written up                                             */
/* -------------------------------------------------------------------------- */

/**
 * A lesson counts as dealt with once the child has answered the only question
 * the screen asks about it: was homework given? Either answer counts — a
 * recorded assignment, or the „დავალება არ მოგვცეს" mark. The topic field is
 * deliberately NOT part of this: „რა გავიარეთ" is a nice-to-have, and blocking
 * the green line on it would mean the section never collapses.
 */
export function needsRecording(lesson: {
  noHomework: boolean;
  assignmentCount: number;
}): boolean {
  return !lesson.noHomework && lesson.assignmentCount === 0;
}

/* -------------------------------------------------------------------------- */
/*  week grid cells (C6)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The colour scale of SPEC 4a. The state belongs to the cell where the
 * homework was GIVEN, so „მწვანე" on Tuesday's maths means "the homework from
 * Tuesday's maths lesson came back approved" — not "Tuesday is done".
 *
 *   empty     ნაცრისფერი — nothing recorded here yet
 *   none      თეთრი/ნიშნით — „დავალება არ მოგვცეს"
 *   todo      ყვითელი — there is homework to do
 *   submitted ლურჯი — handed in, waiting for the parent
 *   approved  მწვანე — the parent approved it
 *   overdue   წითელი — past its date, or sent back to be redone
 */
export type CellState =
  | "empty"
  | "none"
  | "todo"
  | "submitted"
  | "approved"
  | "overdue";

/**
 * Worst-first: one cell can hold several pieces of homework, and the child has
 * to see the one that still needs them. `redo` is grouped with overdue rather
 * than with "to do" — both mean "this is the thing that is wrong right now",
 * and the grid is read at a glance, so a returned task must not look the same
 * as one that was simply never started.
 */
export function cellState(
  items: Pick<HomeAssignment, "status" | "dueDate">[],
  today: string,
  options: { noHomework: boolean },
): CellState {
  if (items.length === 0) {
    if (options.noHomework) return "none";
    return "empty";
  }

  let best: CellState = "approved";
  const rank: Record<CellState, number> = {
    overdue: 0,
    todo: 1,
    submitted: 2,
    approved: 3,
    none: 4,
    empty: 5,
  };

  for (const item of items) {
    const state: CellState =
      item.status === "approved"
        ? "approved"
        : item.status === "submitted"
          ? "submitted"
          : item.status === "redo" ||
              (item.dueDate !== null && item.dueDate < today)
            ? "overdue"
            : "todo";

    if (rank[state] < rank[best]) best = state;
  }

  return best;
}
