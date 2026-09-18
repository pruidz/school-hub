/**
 * "Hand it in by the next maths lesson" — SPEC 4a, ვადის ავტომატური გამოთვლა.
 *
 * The child never picks a date. Homework recorded against a lesson is due at
 * the NEXT occurrence of that same subject in the timetable, which is how
 * school actually works. This module is the rule, on its own, with no database
 * and no React in it, so it can be reasoned about and tested directly.
 *
 * Everything here works on bare `yyyy-MM-dd` strings and ISO weekday numbers,
 * exactly as `schedule_slots` stores them. There is no `Date` arithmetic across
 * a time zone boundary anywhere in the rule: the calling code resolves "today"
 * with `todayIso()` (Asia/Tbilisi) and from there it is pure calendar maths, so
 * a server running in UTC computes the same due date as a phone in Tbilisi.
 *
 * Pure module — safe to import from client and server components.
 */

import { addDaysIso, isoWeekday } from "@/features/schedule/dates";
import { isActiveOn } from "@/features/schedule/versions";

/** A timetable slot reduced to what the rule needs. */
export type DueSlot = {
  subjectId: string;
  /** ISO 8601 weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** `HH:mm`, used only to order several slots of the same subject on one day. */
  startTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

/**
 * How far ahead to look for the next lesson of the subject.
 *
 * Seven days would answer the ordinary case (a subject taught once a week lands
 * exactly seven days out), but a slot can be retired mid-week by
 * `effective_to` and replaced by one starting later, so the window is four
 * weeks. Beyond that the timetable no longer says anything useful and the
 * caller's fallback is the honest answer.
 */
export const DUE_SEARCH_DAYS = 28;

/**
 * The next day after `givenOn` on which `subjectId` is taught, or `null`.
 *
 * The scan deliberately starts at `givenOn + 1`. A second slot for the same
 * subject LATER THE SAME DAY does not count (SPEC 4a): homework given in the
 * first of two maths lessons is not due an hour later, it is due at the next
 * maths lesson on a following day.
 */
export function nextSubjectLessonDate(
  slots: DueSlot[],
  subjectId: string,
  givenOn: string,
  searchDays: number = DUE_SEARCH_DAYS,
): string | null {
  const mine = slots.filter((slot) => slot.subjectId === subjectId);
  if (mine.length === 0) return null;

  for (let step = 1; step <= searchDays; step += 1) {
    const candidate = addDaysIso(givenOn, step);
    const weekday = isoWeekday(candidate);

    const taught = mine.some(
      (slot) =>
        slot.weekday === weekday &&
        // The versioning is the whole point: a slot retired last month is
        // still in the table (old lessons keep their `slot_id`) but must not
        // set a due date in the future.
        isActiveOn(
          { effectiveFrom: slot.effectiveFrom, effectiveTo: slot.effectiveTo },
          candidate,
        ),
    );

    if (taught) return candidate;
  }

  return null;
}

/**
 * The due date to pre-fill for homework given on `givenOn` in `subjectId`.
 *
 * `fallback` is the child's next school day (`nextSchoolDay`, which the caller
 * computes once per request). It is used when the subject is unknown — the
 * general "+" button, where no lesson and no subject is in play — or when the
 * timetable holds no future lesson of that subject at all.
 *
 * The result is only ever a DEFAULT. The date field stays editable; this just
 * makes it start correct.
 */
export function resolveDueDate({
  slots,
  subjectId,
  givenOn,
  fallback,
}: {
  slots: DueSlot[];
  subjectId: string | null;
  givenOn: string;
  fallback: string;
}): string {
  if (!subjectId) return fallback;
  return nextSubjectLessonDate(slots, subjectId, givenOn) ?? fallback;
}
