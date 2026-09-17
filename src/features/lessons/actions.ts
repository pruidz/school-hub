"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";
import { findOwnChild } from "@/features/children/guards";
import { isIsoDate, isoWeekday, todayIso } from "@/features/schedule/dates";

import { isMissingColumnError, noHomeworkPatch } from "./no-homework";
import { missingSlots } from "./queries";

/**
 * Lesson actions. Unlike the rest of the A3 slice these are used by BOTH
 * roles: the child fills the lesson in on `/kid/today`, the parent can correct
 * it. RLS already expresses that (`lessons_select/insert/update_own` for the
 * child, `lessons_parent_all` for the parent), so the guard below simply asks
 * the user-scoped client whether the caller can see the child at all —
 * `children_select_self` answers yes for the child themself, and
 * `children_parent_all` for their parent.
 */

const uuid = z.uuid();
const isoDate = z.string().refine(isIsoDate, { message: ka.validation.dateInvalid });

const materialiseSchema = z.object({ childId: uuid, date: isoDate });

const updateLessonSchema = z.object({
  lessonId: uuid,
  topic: z
    .string()
    .max(200, { message: ka.validation.tooLong })
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
  notes: z
    .string()
    .max(2000, { message: ka.validation.tooLong })
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
});

const noHomeworkSchema = z.object({ lessonId: uuid, value: z.boolean() });

function revalidateDay() {
  revalidatePath("/kid/today");
  revalidatePath("/parent");
}

/** May the caller act for this child? RLS decides, not us. */
async function actorForChild(
  childId: string,
): Promise<{ ok: true; actorId: string } | { ok: false; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: ka.errors.unauthorized };

  const child = await findOwnChild(childId);
  if (!child) return { ok: false, message: ka.errors.notFound };

  return { ok: true, actorId: user.id };
}

/* -------------------------------------------------------------------------- */
/*  materialisation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Create the day's `lessons` rows from the timetable in force on that date.
 *
 * Idempotent: it inserts only the slots that have no lesson yet, so calling it
 * on every page load is harmless. It never runs for a future date — the child
 * records what happened, and nothing has happened tomorrow yet.
 *
 * Caveat worth knowing: there is no unique index on
 * `lessons (child_id, slot_id, date)`, so two simultaneous first loads could
 * each insert the same row. The read path collapses duplicates by `slot_id`;
 * the real fix is a unique index and is flagged for A1.
 */
export async function materialiseDayLessons(
  input: unknown,
): Promise<ActionResult<{ created: number }>> {
  const parsed = materialiseSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const { childId, date } = parsed.data;
  if (date > todayIso()) return fail(ka.errors.futureDate);

  const actor = await actorForChild(childId);
  if (!actor.ok) return fail(actor.message);

  const supabase = await createClient();
  const weekday = isoWeekday(date);

  const [{ data: slots }, { data: existing }] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("id, subject_id")
      .eq("child_id", childId)
      .eq("weekday", weekday)
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`),
    supabase
      .from("lessons")
      .select("id, slot_id, subject_id")
      .eq("child_id", childId)
      .eq("date", date),
  ]);

  const missing = missingSlots(slots ?? [], existing ?? []);
  if (missing.length === 0) return ok({ created: 0 });

  const { error } = await supabase.from("lessons").insert(
    missing.map((slot) => ({
      child_id: childId,
      subject_id: slot.subject_id,
      date,
      slot_id: slot.id,
      created_by: actor.actorId,
    })),
  );

  if (error) {
    console.error("materialiseDayLessons failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateDay();
  return ok({ created: missing.length });
}

/* -------------------------------------------------------------------------- */
/*  editing                                                                   */
/* -------------------------------------------------------------------------- */

async function loadOwnLesson(lessonId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("id, child_id, date")
    .eq("id", lessonId)
    .maybeSingle();

  return data ?? null;
}

/** "რა გავიარეთ" + the optional note. */
export async function updateLesson(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = updateLessonSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? ka.errors.generic);
  }

  const lesson = await loadOwnLesson(parsed.data.lessonId);
  if (!lesson) return fail(ka.errors.notFound);

  const actor = await actorForChild(lesson.child_id);
  if (!actor.ok) return fail(actor.message);

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({ topic: parsed.data.topic, notes: parsed.data.notes })
    .eq("id", parsed.data.lessonId);

  if (error) {
    console.error("updateLesson failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateDay();
  return ok(null);
}

/**
 * "დავალება არ მოგვცეს".
 *
 * Writes `lessons.no_homework`, which does not exist in the database yet — see
 * `./no-homework.ts` for the migration this needs. Until it is applied the
 * write fails with 42703 and the child gets a plain Georgian explanation
 * instead of a stack trace.
 */
export async function setLessonNoHomework(
  input: unknown,
): Promise<ActionResult<{ value: boolean }>> {
  const parsed = noHomeworkSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const lesson = await loadOwnLesson(parsed.data.lessonId);
  if (!lesson) return fail(ka.errors.notFound);

  const actor = await actorForChild(lesson.child_id);
  if (!actor.ok) return fail(actor.message);

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update(noHomeworkPatch(parsed.data.value))
    .eq("id", parsed.data.lessonId);

  if (error) {
    if (isMissingColumnError(error)) {
      return fail(ka.lessons.noHomeworkUnavailable);
    }
    console.error("setLessonNoHomework failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateDay();
  return ok({ value: parsed.data.value });
}
