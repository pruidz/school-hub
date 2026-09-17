"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka, t } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";
import type { ServerClient } from "@/lib/supabase/server";
import { guardOwnChild, guardParentWrite } from "@/features/children/guards";

import { isIsoDate, isValidTime, normalizeTime, timeToMinutes, todayIso } from "./dates";
import { closeBefore, mutationStrategy, slotsConflict } from "./versions";

/**
 * Timetable editing.
 *
 * Everything is expressed as a change that takes effect on one date, never as
 * an in-place rewrite of what was taught last month:
 *
 *   • the editor shows the timetable in force on `asOf` (today by default);
 *   • a change never applies earlier than today, so viewing a past week and
 *     pressing "save" opens a new version instead of falsifying history;
 *   • a row that was already in force before that date is closed
 *     (`effective_to = changeDate - 1`) and a replacement row is opened;
 *   • a row that only starts on/after that date is edited in place, because
 *     nothing that already happened depends on it.
 *
 * "New timetable from <date>" does the same thing to the whole week at once, so
 * a parent can rebuild the schedule from scratch mid-year without losing the
 * old one.
 */

const uuid = z.uuid();

const isoDate = z.string().refine(isIsoDate, { message: ka.validation.dateInvalid });

const time = z
  .string()
  .transform(normalizeTime)
  .refine(isValidTime, { message: ka.validation.timeInvalid });

const createSlotSchema = z.object({
  childId: uuid,
  subjectId: uuid,
  weekday: z.coerce
    .number()
    .int()
    .min(1, { message: ka.validation.weekdayInvalid })
    .max(7, { message: ka.validation.weekdayInvalid }),
  startTime: time,
  endTime: time,
  asOf: isoDate,
});

const updateSlotSchema = z.object({
  slotId: uuid,
  subjectId: uuid,
  weekday: z.coerce
    .number()
    .int()
    .min(1, { message: ka.validation.weekdayInvalid })
    .max(7, { message: ka.validation.weekdayInvalid }),
  startTime: time,
  endTime: time,
  asOf: isoDate,
});

const deleteSlotSchema = z.object({ slotId: uuid, asOf: isoDate });

const newVersionSchema = z.object({
  childId: uuid,
  asOf: isoDate,
  from: isoDate,
});

function revalidateSchedule() {
  revalidatePath("/parent/schedule");
  revalidatePath("/kid/today");
}

/**
 * The date a change is allowed to take effect from: never earlier than today,
 * so a parent browsing last month cannot rewrite it by accident.
 */
function changeDateFor(asOf: string): string {
  const today = todayIso();
  return asOf > today ? asOf : today;
}

/* -------------------------------------------------------------------------- */
/*  overlap detection                                                         */
/* -------------------------------------------------------------------------- */

type Candidate = {
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

/**
 * Refuse a slot that would sit on top of another one on the same weekday while
 * both are in force. Two rows for the same weekday and time are legal as long
 * as their date ranges do not meet — that is exactly what a timetable change
 * looks like.
 */
async function findConflict(
  supabase: ServerClient,
  childId: string,
  candidate: Candidate,
  ignoreSlotIds: string[],
): Promise<{ subject: string; from: string; to: string } | null> {
  const { data } = await supabase
    .from("schedule_slots")
    .select(
      "id, weekday, start_time, end_time, effective_from, effective_to, subjects (name)",
    )
    .eq("child_id", childId)
    .eq("weekday", candidate.weekday);

  for (const row of data ?? []) {
    if (ignoreSlotIds.includes(row.id)) continue;

    const other = {
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
    };

    if (!slotsConflict(candidate, other)) continue;

    const subject = row.subjects as unknown as { name: string } | null;
    return {
      subject: subject?.name ?? ka.lessons.subjectUnknown,
      from: other.startTime,
      to: other.endTime,
    };
  }

  return null;
}

function overlapMessage(conflict: {
  subject: string;
  from: string;
  to: string;
}): string {
  return t("schedule.overlap", conflict);
}

/**
 * The end of the version the editor is looking at.
 *
 * Versions are created wholesale, so every row in force on a given day shares
 * one `effective_to`. A new row must inherit it, otherwise it would leak past
 * the end of its own version and collide with the next one.
 */
async function resolveWindowEnd(
  supabase: ServerClient,
  childId: string,
  on: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("schedule_slots")
    .select("effective_to")
    .eq("child_id", childId)
    .lte("effective_from", on)
    .or(`effective_to.is.null,effective_to.gte.${on}`);

  const rows = data ?? [];
  if (rows.length === 0) return null;
  if (rows.some((row) => row.effective_to === null)) return null;

  return rows.reduce<string | null>((earliest, row) => {
    const value = row.effective_to as string;
    return earliest === null || value < earliest ? value : earliest;
  }, null);
}

/** Ownership for a slot id from the browser, through the user-scoped client. */
async function findOwnSlot(supabase: ServerClient, slotId: string) {
  const { data } = await supabase
    .from("schedule_slots")
    .select(
      "id, child_id, subject_id, weekday, start_time, end_time, effective_from, effective_to",
    )
    .eq("id", slotId)
    .maybeSingle();

  return data ?? null;
}

async function subjectBelongsToChild(
  supabase: ServerClient,
  subjectId: string,
  childId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("child_id", childId)
    .maybeSingle();

  return Boolean(data);
}

/* -------------------------------------------------------------------------- */
/*  create                                                                    */
/* -------------------------------------------------------------------------- */

export async function createScheduleSlot(
  input: unknown,
): Promise<ActionResult<{ id: string; effectiveFrom: string }>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = createSlotSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? ka.errors.generic);

  const { childId, subjectId, weekday, startTime, endTime, asOf } = parsed.data;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return fail(ka.schedule.timeOrder);
  }

  const owned = await guardOwnChild(childId);
  if (!owned.ok) return owned.failure;

  const supabase = await createClient();
  if (!(await subjectBelongsToChild(supabase, subjectId, childId))) {
    return fail(ka.errors.notFound);
  }

  const effectiveFrom = changeDateFor(asOf);
  const effectiveTo = await resolveWindowEnd(supabase, childId, effectiveFrom);

  const candidate: Candidate = {
    weekday,
    startTime,
    endTime,
    effectiveFrom,
    effectiveTo,
  };

  const conflict = await findConflict(supabase, childId, candidate, []);
  if (conflict) return fail(overlapMessage(conflict));

  const { data, error } = await supabase
    .from("schedule_slots")
    .insert({
      child_id: childId,
      subject_id: subjectId,
      weekday,
      start_time: startTime,
      end_time: endTime,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createScheduleSlot failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateSchedule();
  return ok({ id: data.id, effectiveFrom });
}

/* -------------------------------------------------------------------------- */
/*  update                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateScheduleSlot(
  input: unknown,
): Promise<ActionResult<{ id: string; split: boolean }>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = updateSlotSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? ka.errors.generic);

  const { slotId, subjectId, weekday, startTime, endTime, asOf } = parsed.data;
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return fail(ka.schedule.timeOrder);
  }

  const supabase = await createClient();
  const slot = await findOwnSlot(supabase, slotId);
  if (!slot) return fail(ka.errors.notFound);

  const owned = await guardOwnChild(slot.child_id);
  if (!owned.ok) return owned.failure;

  if (!(await subjectBelongsToChild(supabase, subjectId, slot.child_id))) {
    return fail(ka.errors.notFound);
  }

  const changeDate = changeDateFor(asOf);
  const range = {
    effectiveFrom: slot.effective_from,
    effectiveTo: slot.effective_to,
  };
  const strategy = mutationStrategy(range, changeDate);

  if (strategy === "inPlace") {
    const candidate: Candidate = { weekday, startTime, endTime, ...range };
    const conflict = await findConflict(supabase, slot.child_id, candidate, [
      slot.id,
    ]);
    if (conflict) return fail(overlapMessage(conflict));

    const { error } = await supabase
      .from("schedule_slots")
      .update({
        subject_id: subjectId,
        weekday,
        start_time: startTime,
        end_time: endTime,
      })
      .eq("id", slot.id);

    if (error) {
      console.error("updateScheduleSlot (in place) failed", error.code);
      return fail(ka.errors.generic);
    }

    revalidateSchedule();
    return ok({ id: slot.id, split: false });
  }

  // The row was already in force before `changeDate`: keep it as history and
  // open a replacement that starts today / on the viewed future date.
  const candidate: Candidate = {
    weekday,
    startTime,
    endTime,
    effectiveFrom: changeDate,
    effectiveTo: slot.effective_to,
  };

  const conflict = await findConflict(supabase, slot.child_id, candidate, [
    slot.id,
  ]);
  if (conflict) return fail(overlapMessage(conflict));

  const { error: closeError } = await supabase
    .from("schedule_slots")
    .update({ effective_to: closeBefore(changeDate) })
    .eq("id", slot.id);

  if (closeError) {
    console.error("updateScheduleSlot (close) failed", closeError.code);
    return fail(ka.errors.generic);
  }

  const { data, error } = await supabase
    .from("schedule_slots")
    .insert({
      child_id: slot.child_id,
      subject_id: subjectId,
      weekday,
      start_time: startTime,
      end_time: endTime,
      effective_from: changeDate,
      effective_to: slot.effective_to,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Put the old row back rather than leaving the child with a gap.
    await supabase
      .from("schedule_slots")
      .update({ effective_to: slot.effective_to })
      .eq("id", slot.id);
    console.error("updateScheduleSlot (open) failed", error?.code);
    return fail(ka.errors.generic);
  }

  revalidateSchedule();
  return ok({ id: data.id, split: true });
}

/* -------------------------------------------------------------------------- */
/*  delete                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Remove a slot from the timetable. If it was already in force it is retired
 * (`effective_to`), not deleted, so lessons that were generated from it keep
 * pointing at a real row.
 */
export async function deleteScheduleSlot(
  input: unknown,
): Promise<ActionResult<{ retired: boolean }>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = deleteSlotSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const supabase = await createClient();
  const slot = await findOwnSlot(supabase, parsed.data.slotId);
  if (!slot) return fail(ka.errors.notFound);

  const owned = await guardOwnChild(slot.child_id);
  if (!owned.ok) return owned.failure;

  const changeDate = changeDateFor(parsed.data.asOf);
  const strategy = mutationStrategy(
    { effectiveFrom: slot.effective_from, effectiveTo: slot.effective_to },
    changeDate,
  );

  if (strategy === "inPlace") {
    const { error } = await supabase
      .from("schedule_slots")
      .delete()
      .eq("id", slot.id);

    if (error) {
      console.error("deleteScheduleSlot failed", error.code);
      return fail(ka.errors.generic);
    }

    revalidateSchedule();
    return ok({ retired: false });
  }

  const { error } = await supabase
    .from("schedule_slots")
    .update({ effective_to: closeBefore(changeDate) })
    .eq("id", slot.id);

  if (error) {
    console.error("deleteScheduleSlot (retire) failed", error.code);
    return fail(ka.errors.generic);
  }

  revalidateSchedule();
  return ok({ retired: true });
}

/* -------------------------------------------------------------------------- */
/*  new version                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fork the whole timetable: close every row in force on `from` the day before,
 * and re-open a copy that starts on `from`. The parent then edits the copy, so
 * the weeks before the change keep describing what was actually taught.
 */
export async function startNewTimetableVersion(
  input: unknown,
): Promise<ActionResult<{ from: string; copied: number }>> {
  const guard = await guardParentWrite();
  if (!guard.ok) return guard.failure;

  const parsed = newVersionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? ka.errors.generic);

  const { childId, asOf, from } = parsed.data;
  if (from < todayIso() || from < asOf) {
    return fail(ka.schedule.newVersionTooEarly);
  }

  const owned = await guardOwnChild(childId);
  if (!owned.ok) return owned.failure;

  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_slots")
    .select("id, subject_id, weekday, start_time, end_time, effective_from, effective_to")
    .eq("child_id", childId)
    .lte("effective_from", from)
    .or(`effective_to.is.null,effective_to.gte.${from}`);

  // Rows that already start on `from` are part of the new version already.
  const toFork = (data ?? []).filter((row) => row.effective_from < from);
  if (toFork.length === 0) {
    return ok({ from, copied: 0 });
  }

  const closeAt = closeBefore(from);
  const { error: closeError } = await supabase
    .from("schedule_slots")
    .update({ effective_to: closeAt })
    .in(
      "id",
      toFork.map((row) => row.id),
    );

  if (closeError) {
    console.error("startNewTimetableVersion (close) failed", closeError.code);
    return fail(ka.errors.generic);
  }

  const { error: insertError } = await supabase.from("schedule_slots").insert(
    toFork.map((row) => ({
      child_id: childId,
      subject_id: row.subject_id,
      weekday: row.weekday,
      start_time: row.start_time,
      end_time: row.end_time,
      effective_from: from,
      effective_to: row.effective_to,
    })),
  );

  if (insertError) {
    // Roll the close back so the family is not left without a timetable.
    await Promise.all(
      toFork.map((row) =>
        supabase
          .from("schedule_slots")
          .update({ effective_to: row.effective_to })
          .eq("id", row.id),
      ),
    );
    console.error("startNewTimetableVersion (copy) failed", insertError.code);
    return fail(ka.errors.generic);
  }

  revalidateSchedule();
  return ok({ from, copied: toFork.length });
}
