import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AssignmentStatus } from "@/lib/assignment-status";
import { addDaysIso, isoWeekday, todayIso } from "@/features/schedule/dates";
import { readNoHomework } from "@/features/lessons/no-homework";

/** Still on the child's plate. Mirrors `OPEN_STATUSES` in the A4 queries. */
const OPEN_STATUSES = new Set<AssignmentStatus>([
  "assigned",
  "in_progress",
  "redo",
]);

/**
 * The "ისტორია" tab: one row per calendar day for the last month.
 *
 * Four queries for the whole window, never one per day. `schedule_slots` is
 * read as a range overlap rather than through `listSlotsActiveOn` (which
 * resolves a single point in time) because the timetable is versioned: a slot
 * retired ten days ago still counts towards the days before it was retired, and
 * asking thirty times would be thirty round trips.
 */

export const HISTORY_DAYS = 30;

export type HistoryDay = {
  date: string;
  /** Timetabled lessons in force that day. */
  scheduled: number;
  /** `lessons` rows that exist for the day, timetabled or hand-made. */
  lessons: number;
  /** Of those, the ones the child actually filled in. */
  recorded: number;
  assignments: number;
  /** Assignments due that day that are neither approved nor submitted. */
  open: number;
};

type SlotRow = {
  weekday: number;
  effective_from: string;
  effective_to: string | null;
};

export async function getChildHistory(
  childId: string,
  days: number = HISTORY_DAYS,
  today: string = todayIso(),
): Promise<HistoryDay[]> {
  const from = addDaysIso(today, -(days - 1));
  const supabase = await createClient();

  const [lessonRes, assignmentRes, slotRes] = await Promise.all([
    // `select("*")` so `no_homework` comes along even on a database where the
    // column has not been migrated yet — see features/lessons/no-homework.ts.
    supabase
      .from("lessons")
      .select("*")
      .eq("child_id", childId)
      .gte("date", from)
      .lte("date", today),
    supabase
      .from("assignments")
      .select("id, due_date, status")
      .eq("child_id", childId)
      .gte("due_date", from)
      .lte("due_date", today),
    supabase
      .from("schedule_slots")
      .select("weekday, effective_from, effective_to")
      .eq("child_id", childId)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${from}`),
  ]);

  const lessonRows = lessonRes.data ?? [];

  // A book photo with no typed topic is still a record, so the "did they write
  // it down" test has to agree with the day tab's.
  const lessonIds = lessonRows.map((row) => row.id);
  const withPhotos = new Set<string>();
  if (lessonIds.length > 0) {
    const { data } = await supabase
      .from("attachments")
      .select("lesson_id")
      .in("lesson_id", lessonIds);
    for (const row of data ?? []) {
      if (row.lesson_id) withPhotos.add(row.lesson_id);
    }
  }

  const slots = (slotRes.data ?? []) as SlotRow[];
  const assignments = assignmentRes.data ?? [];

  const out: HistoryDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = addDaysIso(today, -index);
    const weekday = isoWeekday(date);

    const dayLessons = lessonRows.filter((row) => row.date === date);
    const dayAssignments = assignments.filter((row) => row.due_date === date);

    out.push({
      date,
      scheduled: slots.filter(
        (slot) =>
          slot.weekday === weekday &&
          slot.effective_from <= date &&
          (slot.effective_to === null || slot.effective_to >= date),
      ).length,
      lessons: dayLessons.length,
      recorded: dayLessons.filter(
        (row) =>
          (row.topic ?? "").trim().length > 0 ||
          (row.notes ?? "").trim().length > 0 ||
          withPhotos.has(row.id) ||
          readNoHomework(row),
      ).length,
      assignments: dayAssignments.length,
      open: dayAssignments.filter((row) => OPEN_STATUSES.has(row.status))
        .length,
    });
  }

  return out;
}
