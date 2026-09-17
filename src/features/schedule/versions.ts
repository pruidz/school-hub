/**
 * Timetable versioning.
 *
 * `schedule_slots` carries `effective_from` / `effective_to`, so the table is a
 * history, not a single current state. A slot is part of the timetable in force
 * on day D when `effective_from <= D <= coalesce(effective_to, ∞)`.
 *
 * The editor therefore always works "as of" one date (today by default) and
 * never rewrites a row that was already in force before that date — it closes
 * the old row and opens a new one. The rules live here, away from React and
 * away from Supabase, so they can be reasoned about (and later tested) on their
 * own.
 *
 * Pure module.
 */

import { addDaysIso, timeToMinutes } from "./dates";

export type EffectiveRange = {
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type TimeSpan = { startTime: string; endTime: string };

/** Is this row part of the timetable in force on `iso`? */
export function isActiveOn(range: EffectiveRange, iso: string): boolean {
  if (range.effectiveFrom > iso) return false;
  if (range.effectiveTo !== null && range.effectiveTo < iso) return false;
  return true;
}

/** Do two half-open date ranges share at least one day? */
export function rangesOverlap(a: EffectiveRange, b: EffectiveRange): boolean {
  const aEnd = a.effectiveTo;
  const bEnd = b.effectiveTo;
  if (aEnd !== null && aEnd < b.effectiveFrom) return false;
  if (bEnd !== null && bEnd < a.effectiveFrom) return false;
  return true;
}

/**
 * Do two lessons collide in the day? Touching is allowed: a lesson that ends at
 * 09:45 does not conflict with one that starts at 09:45.
 */
export function timesOverlap(a: TimeSpan, b: TimeSpan): boolean {
  return (
    timeToMinutes(a.startTime) < timeToMinutes(b.endTime) &&
    timeToMinutes(b.startTime) < timeToMinutes(a.endTime)
  );
}

/** Two slots on the same weekday clash when their dates AND times overlap. */
export function slotsConflict(
  a: EffectiveRange & TimeSpan,
  b: EffectiveRange & TimeSpan,
): boolean {
  return rangesOverlap(a, b) && timesOverlap(a, b);
}

/**
 * How an edit or a delete has to be applied, given the date the editor is
 * showing.
 *
 *  - `inPlace`  — the row only ever applied from `asOf` onwards, so changing it
 *                 rewrites nothing that already happened.
 *  - `split`    — the row was already in force before `asOf`. Close it the day
 *                 before and open a replacement, so past weeks keep describing
 *                 the timetable that was actually taught.
 */
export function mutationStrategy(
  range: EffectiveRange,
  asOf: string,
): "inPlace" | "split" {
  return range.effectiveFrom >= asOf ? "inPlace" : "split";
}

/** The day a superseded row should stop applying when a change starts on `asOf`. */
export function closeBefore(asOf: string): string {
  return addDaysIso(asOf, -1);
}
