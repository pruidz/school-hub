/**
 * Date formatting for assignments. Every visible date goes through here so the
 * Georgian locale is never forgotten at a call site.
 *
 * `due_date` is a Postgres `date` and arrives as `YYYY-MM-DD`. Parsing it with
 * `new Date(...)` would read it as UTC midnight and shift the day backwards in
 * a positive-offset timezone (Tbilisi is UTC+4), so it is always parsed as a
 * LOCAL calendar day instead.
 */

import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  parseISO,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ka as kaLocale } from "date-fns/locale";

import { ka } from "@/lib/i18n/ka";

/** `2026-09-17` -> local Date at 00:00. Returns `null` for anything else. */
export function parseCalendarDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0,
    0,
  );
}

/** Local calendar day as `YYYY-MM-DD`, the shape Postgres `date` expects. */
export function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function todayString(): string {
  return toDateString(new Date());
}

/** Monday-based week containing `date`, as `[from, to]` date strings. */
export function weekBounds(date = new Date()): [string, string] {
  return [
    toDateString(startOfWeek(date, { weekStartsOn: 1 })),
    toDateString(endOfWeek(date, { weekStartsOn: 1 })),
  ];
}

/** "17 სექ" — compact, for cards and list rows. */
export function formatShortDate(value: string | null): string {
  const date = parseCalendarDate(value);
  if (!date) return ka.assignments.noDue;
  return format(date, "d MMM", { locale: kaLocale });
}

/** "17 სექტემბერი, 2026" */
export function formatLongDate(value: string | null): string {
  const date = parseCalendarDate(value);
  if (!date) return ka.assignments.noDue;
  return format(date, "d MMMM yyyy", { locale: kaLocale });
}

/** Timestamps (`submitted_at`, `created_at`) rendered with the time of day. */
export function formatDateTime(value: string | null): string {
  if (!value) return ka.common.notSet;
  return format(parseISO(value), "d MMM, HH:mm", { locale: kaLocale });
}

export function formatTimeOnly(value: string | null): string {
  if (!value) return "";
  // `time` columns arrive as `HH:MM:SS`.
  return value.slice(0, 5);
}

/** "2 საათის წინ" — how long a submission has been waiting. */
export function formatWaitedFor(value: string | null): string {
  if (!value) return "";
  return formatDistanceToNowStrict(parseISO(value), {
    locale: kaLocale,
    addSuffix: false,
  });
}

export type DueState = "none" | "overdue" | "today" | "tomorrow" | "later";

export function dueState(dueDate: string | null, now = new Date()): DueState {
  const date = parseCalendarDate(dueDate);
  if (!date) return "none";
  const delta = differenceInCalendarDays(date, now);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  return "later";
}

/** Georgian label for a due date, collapsing today/tomorrow to a word. */
export function formatDueLabel(dueDate: string | null): string {
  switch (dueState(dueDate)) {
    case "none":
      return ka.assignments.noDue;
    case "today":
      return ka.assignments.dueToday;
    case "tomorrow":
      return ka.assignments.dueTomorrow;
    default:
      return formatShortDate(dueDate);
  }
}
