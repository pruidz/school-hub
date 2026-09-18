import "server-only";

/**
 * Reads for the child's home screen (SPEC 4a — C1 and C6).
 *
 * This is the most-opened screen in the app, so the round trips are counted:
 * `getKidHome` is two waves (six calls, then three that need the day's lesson
 * ids or the child's subject ids) and `getKidWeek` is five plus one.
 * Everything runs on the
 * user-scoped client, so RLS is the access control and these functions only
 * add shape — no `service_role`, and no `.eq("child_id", …)` standing in for a
 * policy.
 *
 * The queries deliberately live here rather than in `features/assignments`:
 * that slice belongs to another agent, and the home screen reads assignments
 * in a shape nothing else needs.
 */

import type { AssignmentStatus, ChildUiMode } from "@/lib/db.types";
import { createClient } from "@/lib/supabase/server";
import { nextSchoolDay } from "@/features/assignments/queries";
import {
  addDaysIso,
  isoWeekday,
  normalizeTime,
  startOfIsoWeek,
} from "@/features/schedule/dates";
import { isActiveOn } from "@/features/schedule/versions";
import { readNoHomework } from "@/features/lessons/no-homework";
import type { DayLesson } from "@/features/lessons/queries";
import type { Attachment } from "@/lib/db.types";

import type { DueSlot } from "./due-dates";
import { DUE_SEARCH_DAYS, resolveDueDate } from "./due-dates";
import {
  byDueDate,
  byLessonOrder,
  cellState,
  needsRecording,
  sectionOf,
  type CellState,
  type HomeAssignment,
} from "./model";

/* -------------------------------------------------------------------------- */
/*  shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The same lesson `<LessonCard>` already renders, plus the one thing SPEC 4a
 * adds: the due date homework recorded here should start with.
 */
export type HomeLesson = DayLesson & {
  /** The next lesson of THIS subject — not merely the next school day. */
  defaultDueDate: string;
};

export type KidHome = {
  date: string;
  today: string;
  tomorrow: string;
  uiMode: ChildUiMode;
  lessons: HomeLesson[];
  /** Timetabled lessons of the day with no row yet — drives materialisation. */
  pendingLessons: number;
  /** Lessons the child has neither recorded homework for nor marked as free. */
  toRecord: HomeLesson[];
  overdue: HomeAssignment[];
  tomorrowItems: HomeAssignment[];
  prepare: HomeAssignment[];
  returned: HomeAssignment[];
  /** Topic names per subject, offered as autocomplete on the lesson card. */
  topicsBySubject: Map<string, string[]>;
};

export type WeekCell = {
  /** Stable key: there may be no lesson and no assignment behind a cell. */
  key: string;
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  /** Null until the day arrives and the lesson row is materialised. */
  lessonId: string | null;
  topic: string | null;
  state: CellState;
  items: HomeAssignment[];
  /** What the quick-add should pre-fill as the due date from this cell. */
  defaultDueDate: string;
  /** A future cell cannot be written up yet — the lesson has not happened. */
  recordable: boolean;
};

export type WeekDay = {
  date: string;
  weekday: number;
  isToday: boolean;
  cells: WeekCell[];
};

export type KidWeek = {
  weekStart: string;
  weekEnd: string;
  today: string;
  uiMode: ChildUiMode;
  days: WeekDay[];
};

/* -------------------------------------------------------------------------- */
/*  row mapping                                                                */
/* -------------------------------------------------------------------------- */

type SubjectRow = { id: string; name: string; color: string };

type AssignmentRow = {
  id: string;
  title: string;
  status: AssignmentStatus;
  due_date: string | null;
  source_ref: string | null;
  subject_id: string | null;
  lesson_id: string | null;
  review_comment: string | null;
  redo_count: number;
};

function toHomeAssignment(
  row: AssignmentRow,
  subjects: Map<string, SubjectRow>,
): HomeAssignment {
  const subject = row.subject_id ? subjects.get(row.subject_id) : undefined;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    sourceRef: row.source_ref,
    subjectId: row.subject_id,
    subjectName: subject?.name ?? null,
    subjectColor: subject?.color ?? "#64748b",
    lessonId: row.lesson_id,
    reviewComment: row.review_comment,
    redoCount: row.redo_count,
  };
}

const ASSIGNMENT_COLUMNS =
  "id, title, status, due_date, source_ref, subject_id, lesson_id, review_comment, redo_count";

const SLOT_COLUMNS =
  "id, subject_id, weekday, start_time, end_time, effective_from, effective_to";

type SlotRow = {
  id: string;
  subject_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
};

function toDueSlot(row: SlotRow): DueSlot {
  return {
    subjectId: row.subject_id,
    weekday: row.weekday,
    startTime: normalizeTime(row.start_time),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

/* -------------------------------------------------------------------------- */
/*  C1 — the dashboard                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Everything the child's main screen shows, for one day.
 *
 * Wave 1 asks for the six things that depend on nothing: the child row, the
 * day's lessons, the timetable, every piece of homework that is not finished,
 * the subjects, and the next school day (the fallback for the due-date rule).
 * Wave 2 needs ids from the first: the book photos, the topic suggestions,
 * and the assignments attached to the day's lessons — that last one is
 * unfiltered by status on purpose, because a lesson whose homework has
 * already been APPROVED has plainly been written up and must not reappear in
 * „ჩასაწერი".
 */
export async function getKidHome(
  childId: string,
  date: string,
  today: string,
): Promise<KidHome> {
  const supabase = await createClient();

  const [childRow, lessonRows, slotRows, openRows, subjectRows, tomorrow] =
    await Promise.all([
      supabase
        .from("children")
        .select("id, ui_mode")
        .eq("id", childId)
        .maybeSingle(),
      supabase
        .from("lessons")
        // `select("*")` so `no_homework` is picked up through ./no-homework.
        .select("*, subjects (name, color), schedule_slots (start_time, end_time)")
        .eq("child_id", childId)
        .eq("date", date)
        .order("created_at", { ascending: true }),
      // Retired slots are dropped here; slots that have not STARTED yet are
      // deliberately kept, because the due-date rule looks forwards and a
      // timetable change that begins next Monday is exactly the thing it has
      // to honour. `isActiveOn` applies `effective_from` per candidate day.
      supabase
        .from("schedule_slots")
        .select(SLOT_COLUMNS)
        .eq("child_id", childId)
        .or(`effective_to.is.null,effective_to.gte.${date}`),
      supabase
        .from("assignments")
        .select(ASSIGNMENT_COLUMNS)
        .eq("child_id", childId)
        .neq("status", "approved")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(300),
      supabase
        .from("subjects")
        .select("id, name, color")
        .eq("child_id", childId)
        .order("sort_order", { ascending: true }),
      nextSchoolDay(childId, today),
    ]);

  const subjects = new Map<string, SubjectRow>(
    (subjectRows.data ?? []).map((row) => [row.id, row]),
  );

  const slots = (slotRows.data ?? []) as SlotRow[];
  const dueSlots = slots.map(toDueSlot);

  /* ---------------------------------------------------------- the lessons -- */

  const rawLessons = lessonRows.data ?? [];
  const lessonIds = rawLessons.map((row) => row.id);

  const subjectIds = [...subjects.keys()];

  const [photoRows, lessonAssignmentRows, topicRows] = await Promise.all([
    lessonIds.length > 0
      ? supabase
          .from("attachments")
          .select("*")
          .in("lesson_id", lessonIds)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Attachment[] }),
    lessonIds.length > 0
      ? supabase
          .from("assignments")
          .select("id, lesson_id")
          .in("lesson_id", lessonIds)
      : Promise.resolve({ data: [] as { id: string; lesson_id: string | null }[] }),
    subjectIds.length > 0
      ? supabase
          .from("topics")
          .select("id, name, subject_id")
          .in("subject_id", subjectIds)
          .order("name", { ascending: true })
      : Promise.resolve({
          data: [] as { id: string; name: string; subject_id: string }[],
        }),
  ]);

  const photosByLesson = new Map<string, Attachment[]>();
  for (const row of photoRows.data ?? []) {
    if (!row.lesson_id) continue;
    const list = photosByLesson.get(row.lesson_id);
    if (list) list.push(row);
    else photosByLesson.set(row.lesson_id, [row]);
  }

  const countByLesson = new Map<string, number>();
  for (const row of lessonAssignmentRows.data ?? []) {
    if (!row.lesson_id) continue;
    countByLesson.set(row.lesson_id, (countByLesson.get(row.lesson_id) ?? 0) + 1);
  }

  const lessons: HomeLesson[] = [];
  const seenSlots = new Set<string>();

  for (const row of rawLessons) {
    // Materialisation is read-then-insert, so a race can leave a duplicate
    // behind; collapse it rather than showing the same lesson twice.
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
      assignmentCount: countByLesson.get(row.id) ?? 0,
      photos: photosByLesson.get(row.id) ?? [],
      defaultDueDate: resolveDueDate({
        slots: dueSlots,
        subjectId: row.subject_id,
        givenOn: date,
        fallback: tomorrow,
      }),
    });
  }

  lessons.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return 0;
  });

  /* ------------------------------------------------------- the assignments -- */

  const items = (openRows.data ?? []).map((row) =>
    toHomeAssignment(row as AssignmentRow, subjects),
  );

  const overdue: HomeAssignment[] = [];
  const tomorrowItems: HomeAssignment[] = [];
  const prepare: HomeAssignment[] = [];
  const returned: HomeAssignment[] = [];

  for (const item of items) {
    switch (sectionOf(item, today, tomorrow)) {
      case "overdue":
        overdue.push(item);
        break;
      case "tomorrow":
        tomorrowItems.push(item);
        break;
      case "prepare":
        prepare.push(item);
        break;
      case "returned":
        returned.push(item);
        break;
      default:
        break;
    }
  }

  overdue.sort(byDueDate);
  prepare.sort(byDueDate);
  returned.sort(byDueDate);
  tomorrowItems.sort(byLessonOrder(subjectOrderOn(slots, tomorrow)));

  /* -------------------------------------------------------------- the rest -- */

  const topicsBySubject = new Map<string, string[]>();
  for (const row of topicRows.data ?? []) {
    const list = topicsBySubject.get(row.subject_id);
    if (list) list.push(row.name);
    else topicsBySubject.set(row.subject_id, [row.name]);
  }

  return {
    date,
    today,
    tomorrow,
    uiMode: childRow.data?.ui_mode ?? "full",
    lessons,
    pendingLessons: countPending(slots, rawLessons, date),
    toRecord: lessons.filter(needsRecording),
    overdue,
    tomorrowItems,
    prepare,
    returned,
    topicsBySubject,
  };
}

/**
 * The order the subjects are taught in on `date` — what „ხვალისთვის" sorts by.
 * Only the FIRST slot of a subject counts, so a subject taught twice that day
 * sits where the child first meets it.
 */
function subjectOrderOn(slots: SlotRow[], date: string): Map<string, number> {
  const weekday = isoWeekday(date);

  const active = slots
    .filter(
      (slot) =>
        slot.weekday === weekday &&
        isActiveOn(
          {
            effectiveFrom: slot.effective_from,
            effectiveTo: slot.effective_to,
          },
          date,
        ),
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const order = new Map<string, number>();
  active.forEach((slot, index) => {
    if (!order.has(slot.subject_id)) order.set(slot.subject_id, index);
  });
  return order;
}

/**
 * How many of the day's timetabled lessons have no row yet. Mirrors
 * `missingSlots` in features/lessons, computed from data already in hand so
 * the dashboard does not pay for two more queries.
 */
function countPending(
  slots: SlotRow[],
  lessons: { slot_id: string | null; subject_id: string | null }[],
  date: string,
): number {
  const weekday = isoWeekday(date);
  const covered = new Set(
    lessons.map((lesson) => lesson.slot_id).filter(Boolean) as string[],
  );
  const manualSubjects = new Set(
    lessons
      .filter((lesson) => lesson.slot_id === null)
      .map((lesson) => lesson.subject_id)
      .filter(Boolean) as string[],
  );

  return slots.filter(
    (slot) =>
      slot.weekday === weekday &&
      isActiveOn(
        { effectiveFrom: slot.effective_from, effectiveTo: slot.effective_to },
        date,
      ) &&
      !covered.has(slot.id) &&
      !manualSubjects.has(slot.subject_id),
  ).length;
}

/* -------------------------------------------------------------------------- */
/*  C6 — the week grid                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The whole week as cells: one per timetabled lesson, carrying the state of
 * the homework that was GIVEN in it.
 *
 * Five calls in one wave, then the homework of the week's lessons once their
 * ids are known. That last query is deliberately NOT filtered by status —
 * „მწვანე" means "approved", so finished work is exactly what the grid has to
 * show — and it is bounded by `lesson_id`, because a cell holds the homework
 * that was GIVEN in it, whatever its due date turned out to be.
 */
export async function getKidWeek(
  childId: string,
  anyDayOfWeek: string,
  today: string,
): Promise<KidWeek> {
  const supabase = await createClient();

  const weekStart = startOfIsoWeek(anyDayOfWeek);
  const weekEnd = addDaysIso(weekStart, 6);

  const [childRow, slotRows, lessonRows, subjectRows, fallbackDue] =
    await Promise.all([
      supabase
        .from("children")
        .select("id, ui_mode")
        .eq("id", childId)
        .maybeSingle(),
      // Wide enough for both jobs: the cells of this week, and the due-date
      // rule looking up to `DUE_SEARCH_DAYS` past its last day.
      supabase
        .from("schedule_slots")
        .select(SLOT_COLUMNS)
        .eq("child_id", childId)
        .lte("effective_from", addDaysIso(weekEnd, DUE_SEARCH_DAYS))
        .or(`effective_to.is.null,effective_to.gte.${weekStart}`),
      supabase
        .from("lessons")
        // `select("*")` so `no_homework` is read through ./no-homework rather
        // than failing the whole query on a database without migration 0006.
        .select("*")
        .eq("child_id", childId)
        .gte("date", weekStart)
        .lte("date", weekEnd),
      supabase
        .from("subjects")
        .select("id, name, color")
        .eq("child_id", childId)
        .order("sort_order", { ascending: true }),
      nextSchoolDay(childId, today),
    ]);

  const subjects = new Map<string, SubjectRow>(
    (subjectRows.data ?? []).map((row) => [row.id, row]),
  );
  const slots = (slotRows.data ?? []) as SlotRow[];
  const dueSlots = slots.map(toDueSlot);
  const lessons = lessonRows.data ?? [];

  const assignmentRows =
    lessons.length === 0
      ? []
      : ((
          await supabase
            .from("assignments")
            .select(ASSIGNMENT_COLUMNS)
            .eq("child_id", childId)
            .in(
              "lesson_id",
              lessons.map((lesson) => lesson.id),
            )
        ).data ?? []);

  const byLesson = new Map<string, HomeAssignment[]>();
  for (const row of assignmentRows) {
    const item = toHomeAssignment(row as AssignmentRow, subjects);
    if (!item.lessonId) continue;
    const list = byLesson.get(item.lessonId);
    if (list) list.push(item);
    else byLesson.set(item.lessonId, [item]);
  }

  const lessonBySlotDate = new Map<string, (typeof lessons)[number]>();
  const lessonBySubjectDate = new Map<string, (typeof lessons)[number]>();
  for (const lesson of lessons) {
    if (lesson.slot_id) {
      lessonBySlotDate.set(`${lesson.slot_id}:${lesson.date}`, lesson);
    } else if (lesson.subject_id) {
      lessonBySubjectDate.set(`${lesson.subject_id}:${lesson.date}`, lesson);
    }
  }

  const days: WeekDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const date = addDaysIso(weekStart, index);
    const weekday = isoWeekday(date);

    const daySlots = slots
      .filter(
        (slot) =>
          slot.weekday === weekday &&
          isActiveOn(
            {
              effectiveFrom: slot.effective_from,
              effectiveTo: slot.effective_to,
            },
            date,
          ),
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    const cells: WeekCell[] = daySlots.map((slot) => {
      const lesson =
        lessonBySlotDate.get(`${slot.id}:${date}`) ??
        lessonBySubjectDate.get(`${slot.subject_id}:${date}`) ??
        null;
      const items = lesson ? (byLesson.get(lesson.id) ?? []) : [];
      const subject = subjects.get(slot.subject_id);

      return {
        key: `${date}:${slot.id}`,
        date,
        weekday,
        startTime: normalizeTime(slot.start_time),
        endTime: normalizeTime(slot.end_time),
        subjectId: slot.subject_id,
        subjectName: subject?.name ?? "",
        subjectColor: subject?.color ?? "#64748b",
        lessonId: lesson?.id ?? null,
        topic: lesson?.topic ?? null,
        state: cellState(items, today, {
          noHomework: lesson ? readNoHomework(lesson) : false,
        }),
        items,
        defaultDueDate: resolveDueDate({
          slots: dueSlots,
          subjectId: slot.subject_id,
          givenOn: date,
          fallback: fallbackDue,
        }),
        // A lesson that has not happened yet cannot have produced homework,
        // and `materialiseDayLessons` refuses future dates, so there would be
        // nothing to attach the row to either.
        recordable: date <= today,
      };
    });

    days.push({ date, weekday, isToday: date === today, cells });
  }

  return {
    weekStart,
    weekEnd,
    today,
    uiMode: childRow.data?.ui_mode ?? "full",
    days,
  };
}
