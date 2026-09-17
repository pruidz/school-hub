import "server-only";

import type { Attachment } from "@/lib/db.types";
import { createClient } from "@/lib/supabase/server";
import { normalizeTime } from "@/features/schedule/dates";

import { readNoHomework } from "./no-homework";

/**
 * Reads for the "what did we cover today" record. User-scoped throughout: a
 * child sees their own lessons (`lessons_select_own`), a parent sees the
 * family's (`lessons_parent_all`).
 */

export type DayLesson = {
  id: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string;
  topic: string | null;
  notes: string | null;
  slotId: string | null;
  startTime: string | null;
  endTime: string | null;
  noHomework: boolean;
  assignmentCount: number;
  /** Photos of the book page, rendered with A4's `PhotoGallery`. */
  photos: Attachment[];
};

export async function listDayLessons(
  childId: string,
  date: string,
): Promise<DayLesson[]> {
  const supabase = await createClient();

  // `select("*")` rather than a column list so `no_homework` is picked up the
  // moment the migration adds it — see ./no-homework.ts.
  const { data } = await supabase
    .from("lessons")
    .select(
      "*, subjects (name, color), schedule_slots (start_time, end_time)",
    )
    .eq("child_id", childId)
    .eq("date", date)
    .order("created_at", { ascending: true });

  const rows = data ?? [];

  const lessonIds = rows.map((row) => row.id);
  const [counts, photos] = await Promise.all([
    countAssignmentsByLesson(lessonIds),
    listLessonPhotos(lessonIds),
  ]);

  const lessons: DayLesson[] = [];
  const seenSlots = new Set<string>();

  for (const row of rows) {
    // Materialisation is read-then-insert (there is no unique index on
    // child+slot+date yet), so two simultaneous first loads can leave a
    // duplicate behind. Collapse it here instead of showing the child the same
    // lesson twice.
    if (row.slot_id) {
      if (seenSlots.has(row.slot_id)) continue;
      seenSlots.add(row.slot_id);
    }

    const subject = row.subjects as unknown as {
      name: string;
      color: string;
    } | null;
    const slot = row.schedule_slots as unknown as {
      start_time: string;
      end_time: string;
    } | null;

    lessons.push({
      id: row.id,
      subjectId: row.subject_id,
      subjectName: subject?.name ?? null,
      subjectColor: subject?.color ?? "#64748b",
      topic: row.topic,
      notes: row.notes,
      slotId: row.slot_id,
      startTime: slot ? normalizeTime(slot.start_time) : null,
      endTime: slot ? normalizeTime(slot.end_time) : null,
      noHomework: readNoHomework(row),
      assignmentCount: counts.get(row.id) ?? 0,
      photos: photos.get(row.id) ?? [],
    });
  }

  // Timetabled lessons first, in clock order; anything added by hand (no slot)
  // keeps its insertion order at the end of the day.
  return lessons.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return 0;
  });
}

async function listLessonPhotos(
  lessonIds: string[],
): Promise<Map<string, Attachment[]>> {
  const byLesson = new Map<string, Attachment[]>();
  if (lessonIds.length === 0) return byLesson;

  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("*")
    .in("lesson_id", lessonIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  for (const row of data ?? []) {
    if (!row.lesson_id) continue;
    const list = byLesson.get(row.lesson_id);
    if (list) list.push(row);
    else byLesson.set(row.lesson_id, [row]);
  }

  return byLesson;
}

async function countAssignmentsByLesson(
  lessonIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (lessonIds.length === 0) return counts;

  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select("lesson_id")
    .in("lesson_id", lessonIds);

  for (const row of data ?? []) {
    if (!row.lesson_id) continue;
    counts.set(row.lesson_id, (counts.get(row.lesson_id) ?? 0) + 1);
  }

  return counts;
}

/**
 * How many timetabled lessons of that day have no row yet. The kid screen uses
 * it to decide whether to run the materialisation action on arrival.
 */
export async function countPendingLessons(
  childId: string,
  date: string,
  weekday: number,
): Promise<number> {
  const supabase = await createClient();

  const [{ data: slots }, { data: lessons }] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("id, subject_id")
      .eq("child_id", childId)
      .eq("weekday", weekday)
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`),
    supabase
      .from("lessons")
      .select("slot_id, subject_id")
      .eq("child_id", childId)
      .eq("date", date),
  ]);

  return missingSlots(slots ?? [], lessons ?? []).length;
}

/**
 * Which timetable slots of the day are not represented by a lesson yet.
 *
 * A slot counts as covered either by a lesson pointing at it (`slot_id`) or by
 * a hand-made lesson for the same subject on that date — otherwise a child who
 * already wrote up their maths lesson would get a second, empty maths card.
 */
export function missingSlots<
  S extends { id: string; subject_id: string },
  L extends { slot_id: string | null; subject_id: string | null },
>(slots: S[], lessons: L[]): S[] {
  const coveredSlotIds = new Set(
    lessons.map((lesson) => lesson.slot_id).filter(Boolean) as string[],
  );
  const manualSubjectIds = new Set(
    lessons
      .filter((lesson) => lesson.slot_id === null)
      .map((lesson) => lesson.subject_id)
      .filter(Boolean) as string[],
  );

  return slots.filter(
    (slot) =>
      !coveredSlotIds.has(slot.id) && !manualSubjectIds.has(slot.subject_id),
  );
}
