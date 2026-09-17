/**
 * Date and time helpers shared by the schedule, lessons and kid screens.
 *
 * Everything in the database is a bare `date` (`yyyy-MM-dd`) or a bare `time`
 * (`HH:mm[:ss]`) — no time zone attached. So this module works on those strings
 * and only turns them into a `Date` for formatting.
 *
 * "Today" is deliberately resolved in the family's own time zone rather than
 * the server's: Vercel runs in UTC, and after 20:00 Tbilisi time a UTC "today"
 * is already tomorrow, which would let a child open a future day.
 *
 * Pure module — safe to import from client and server components.
 */

import { format, parse } from "date-fns";
import { ka as kaLocale } from "date-fns/locale";

/** Georgian school calendar; the whole app is single-tenant on this zone. */
export const APP_TIME_ZONE = "Asia/Tbilisi";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/* -------------------------------------------------------------------------- */
/*  dates                                                                     */
/* -------------------------------------------------------------------------- */

/** `yyyy-MM-dd` for "now" in the app's time zone. */
export function todayIso(now: Date = new Date()): string {
  // `en-CA` formats as yyyy-MM-dd, which is exactly the Postgres `date` literal.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The calendar day a `timestamptz` falls on, in the family's time zone. */
export function isoDateOf(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return todayIso(date);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value) && !Number.isNaN(
    Date.parse(`${value}T00:00:00Z`),
  );
}

/**
 * `yyyy-MM-dd` -> a `Date` at local noon. Noon (not midnight) keeps the
 * calendar day stable no matter which way the runtime's offset leans.
 */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** ISO 8601 weekday of a `yyyy-MM-dd` date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const day = parseIsoDate(iso).getDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** Monday of the ISO week containing `iso`. */
export function startOfIsoWeek(iso: string): string {
  return addDaysIso(iso, -(isoWeekday(iso) - 1));
}

/** Bare `date` strings sort lexicographically, so plain comparison is correct. */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function isAfter(a: string, b: string): boolean {
  return a > b;
}

/** "17 სექტემბერი, ოთხშაბათი" */
export function formatDateLong(iso: string): string {
  return format(parseIsoDate(iso), "d MMMM, EEEE", { locale: kaLocale });
}

/** "17 სექ" */
export function formatDateShort(iso: string): string {
  return format(parseIsoDate(iso), "d MMM", { locale: kaLocale });
}

/** "17.09.2026" */
export function formatDateNumeric(iso: string): string {
  return format(parseIsoDate(iso), "dd.MM.yyyy");
}

/** "17.09.2026, 18:40" — for `timestamptz` values such as invite expiry. */
export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd.MM.yyyy, HH:mm", { locale: kaLocale });
}

/* -------------------------------------------------------------------------- */
/*  times                                                                     */
/* -------------------------------------------------------------------------- */

/** Postgres hands back `08:30:00`; the UI everywhere shows `08:30`. */
export function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = normalizeTime(value).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  return `${String(hours).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Parses `HH:mm` for date-fns consumers that need a real `Date`. */
export function parseTime(value: string): Date {
  return parse(normalizeTime(value), "HH:mm", new Date());
}
