import "server-only";

import { createClient } from "@/lib/supabase/server";

import { normalizeTime } from "./dates";

/**
 * Reads for subjects, topics and the timetable. All user-scoped: a parent sees
 * their family's rows, a child sees their own, and nobody else's row is ever
 * returned — that is RLS's job, not a `.eq()` we could forget.
 */

export type SubjectView = {
  id: string;
  childId: string;
  name: string;
  color: string;
  teacherName: string | null;
  sortOrder: number;
};

export type TopicView = {
  id: string;
  subjectId: string;
  name: string;
  parentTopicId: string | null;
};

export type SlotView = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export async function listSubjects(childId: string): Promise<SubjectView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subjects")
    .select("id, child_id, name, color, teacher_name, sort_order")
    .eq("child_id", childId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    childId: row.child_id,
    name: row.name,
    color: row.color,
    teacherName: row.teacher_name,
    sortOrder: row.sort_order,
  }));
}

/** Topics of every subject of one child, in one round trip. */
export async function listTopics(childId: string): Promise<TopicView[]> {
  const supabase = await createClient();
  const { data: subjectRows } = await supabase
    .from("subjects")
    .select("id")
    .eq("child_id", childId);

  const subjectIds = (subjectRows ?? []).map((row) => row.id);
  if (subjectIds.length === 0) return [];

  const { data } = await supabase
    .from("topics")
    .select("id, subject_id, name, parent_topic_id")
    .in("subject_id", subjectIds)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    subjectId: row.subject_id,
    name: row.name,
    parentTopicId: row.parent_topic_id,
  }));
}

/**
 * The timetable in force on `asOf`, ordered for the grid.
 *
 * The date filter is the whole point of the versioning: a row that was retired
 * last month is still in the table (so old lessons keep their `slot_id`) but
 * must not show up in this week's grid.
 */
export async function listSlotsActiveOn(
  childId: string,
  asOf: string,
): Promise<SlotView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_slots")
    .select(
      "id, subject_id, weekday, start_time, end_time, effective_from, effective_to, subjects (name, color)",
    )
    .eq("child_id", childId)
    .lte("effective_from", asOf)
    .or(`effective_to.is.null,effective_to.gte.${asOf}`)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  return (data ?? []).map((row) => {
    // PostgREST returns the embedded subject as an object for a to-one join.
    const subject = row.subjects as unknown as {
      name: string;
      color: string;
    } | null;

    return {
      id: row.id,
      subjectId: row.subject_id,
      subjectName: subject?.name ?? "",
      subjectColor: subject?.color ?? "#64748b",
      weekday: row.weekday,
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
    };
  });
}

/** How much history a subject would take with it if it were deleted. */
export type SubjectUsage = {
  lessons: number;
  assignments: number;
  slots: number;
};

export async function getSubjectUsage(
  subjectId: string,
): Promise<SubjectUsage> {
  const supabase = await createClient();

  const [lessons, assignments, slots] = await Promise.all([
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", subjectId),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", subjectId),
    supabase
      .from("schedule_slots")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", subjectId),
  ]);

  return {
    lessons: lessons.count ?? 0,
    assignments: assignments.count ?? 0,
    slots: slots.count ?? 0,
  };
}
