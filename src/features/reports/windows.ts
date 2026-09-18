/**
 * The time windows the report is computed over.
 *
 * Pure module — no DB, no React, no `server-only` — so the page, the
 * drill-down list and the client-side window switcher can all share it.
 *
 * Two rules decide everything here:
 *
 *  1. "Today" is Asia/Tbilisi, taken from `@/features/schedule/dates`. A report
 *     that silently rolled over at 20:00 local time would show a parent an
 *     empty "today" while the child is still working.
 *  2. A window never extends past today. Homework that is not due yet has not
 *     been missed, and counting it as unfinished would drag completion down
 *     every Monday and back up every Friday for no real reason.
 *
 * The previous period is always the same number of days immediately before the
 * window, not "last calendar week". Comparing three elapsed days of this week
 * against a full previous week is the classic way to invent a trend that is not
 * there.
 */

import {
  addDaysIso,
  isIsoDate,
  parseIsoDate,
  startOfIsoWeek,
  todayIso,
} from "@/features/schedule/dates";

export type WindowKey = "week" | "4weeks" | "term";

export const WINDOW_KEYS: readonly WindowKey[] = ["week", "4weeks", "term"];

export type DateRange = { from: string; to: string };

export type TrendWeek = DateRange & {
  /** 1-based position in the trend, oldest first. Handy as a React key. */
  index: number;
};

export type ResolvedWindow = {
  key: WindowKey;
  current: DateRange;
  previous: DateRange;
  /** The eight ISO weeks the trend strip covers, oldest first. */
  trend: TrendWeek[];
  /**
   * Earliest day anything on the page needs. One assignment query covers the
   * window, the comparison period and the whole trend strip.
   */
  fetchFrom: string;
  today: string;
};

/** How many ISO weeks the trend strip shows. */
export const TREND_WEEKS = 8;

export function isWindowKey(value: unknown): value is WindowKey {
  return (
    typeof value === "string" && (WINDOW_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Four weeks is the default rather than the current week: one school week is
 * rarely five assignments, and every rate on the page would sit under the
 * small-sample floor on a Tuesday.
 */
export const DEFAULT_WINDOW: WindowKey = "4weeks";

export function daysBetween(from: string, to: string): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Inclusive length of a range in days. */
export function rangeLength(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}

export function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

export function isWithin(day: string, range: DateRange): boolean {
  return day >= range.from && day <= range.to;
}

/**
 * Georgian school terms, approximated by calendar month.
 *
 * The schema has nowhere to record real term dates, so this is a convention,
 * not data: autumn runs September–December, spring January–June, and over the
 * summer holiday the report keeps showing the spring term that just ended
 * rather than an empty range.
 */
export function termBounds(today: string): DateRange {
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  if (month >= 9) return { from: `${year}-09-01`, to: `${year}-12-31` };
  return { from: `${year}-01-01`, to: `${year}-06-30` };
}

function currentRange(key: WindowKey, today: string): DateRange {
  switch (key) {
    case "week":
      return { from: startOfIsoWeek(today), to: today };
    case "4weeks":
      // Four ISO weeks including the current, partial one.
      return { from: addDaysIso(startOfIsoWeek(today), -7 * 3), to: today };
    case "term": {
      const term = termBounds(today);
      return { from: term.from, to: minIso(term.to, today) };
    }
  }
}

/** The same number of days, immediately before the window. */
export function previousRange(current: DateRange): DateRange {
  const span = rangeLength(current);
  return {
    from: addDaysIso(current.from, -span),
    to: addDaysIso(current.from, -1),
  };
}

export function trendWeeks(today: string, count = TREND_WEEKS): TrendWeek[] {
  const thisMonday = startOfIsoWeek(today);
  return Array.from({ length: count }, (_, i) => {
    const from = addDaysIso(thisMonday, -7 * (count - 1 - i));
    return { index: i, from, to: minIso(addDaysIso(from, 6), today) };
  });
}

export function resolveWindow(
  key: WindowKey = DEFAULT_WINDOW,
  now?: string,
): ResolvedWindow {
  const today = now && isIsoDate(now) ? now : todayIso();
  const current = currentRange(key, today);
  const previous = previousRange(current);
  const trend = trendWeeks(today);

  return {
    key,
    current,
    previous,
    trend,
    fetchFrom: minIso(previous.from, trend[0].from),
    today,
  };
}
