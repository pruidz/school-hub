import { ka } from "@/lib/i18n/ka";

/**
 * ISO 8601 weekday numbers, the same convention `schedule_slots.weekday` and
 * `extract(isodow)` use: 1 = Monday … 7 = Sunday.
 *
 * The labels are looked up from an explicit record rather than by building the
 * key as a string, so a missing translation is a type error instead of a
 * key leaking onto the screen.
 */

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const LONG: Record<Weekday, string> = {
  1: ka.weekday.long1,
  2: ka.weekday.long2,
  3: ka.weekday.long3,
  4: ka.weekday.long4,
  5: ka.weekday.long5,
  6: ka.weekday.long6,
  7: ka.weekday.long7,
};

const SHORT: Record<Weekday, string> = {
  1: ka.weekday.short1,
  2: ka.weekday.short2,
  3: ka.weekday.short3,
  4: ka.weekday.short4,
  5: ka.weekday.short5,
  6: ka.weekday.short6,
  7: ka.weekday.short7,
};

export function isWeekday(value: number): value is Weekday {
  return value >= 1 && value <= 7 && Number.isInteger(value);
}

export function weekdayLong(value: number): string {
  return isWeekday(value) ? LONG[value] : "";
}

export function weekdayShort(value: number): string {
  return isWeekday(value) ? SHORT[value] : "";
}
