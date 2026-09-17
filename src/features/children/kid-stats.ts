import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  addDaysIso,
  isoDateOf,
  startOfIsoWeek,
  todayIso,
} from "@/features/schedule/dates";

/**
 * The two numbers `/kid/me` may show — and only when the parent turned
 * `children.show_own_stats` on.
 *
 * Both are derived from `assignments.submitted_at`, which the child can read
 * for their own rows. `grades` and `topic_mastery` are deliberately not used:
 * grades are invisible to a child at the RLS level, and mastery is a phase-2
 * feature.
 */
export type KidStats = {
  /** Assignments handed in since Monday. */
  weekSubmitted: number;
  /** Consecutive days, ending today or yesterday, with at least one hand-in. */
  streak: number;
};

/** How far back a streak is worth looking. */
const STREAK_WINDOW_DAYS = 120;

export async function getKidStats(childId: string): Promise<KidStats> {
  const today = todayIso();
  const weekStart = startOfIsoWeek(today);
  const windowStart = addDaysIso(today, -STREAK_WINDOW_DAYS);

  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select("submitted_at")
    .eq("child_id", childId)
    .not("submitted_at", "is", null)
    .gte("submitted_at", `${windowStart}T00:00:00Z`)
    .order("submitted_at", { ascending: false });

  const days = new Set<string>();
  let weekSubmitted = 0;

  for (const row of data ?? []) {
    if (!row.submitted_at) continue;
    const day = isoDateOf(row.submitted_at);
    if (!day) continue;

    days.add(day);
    if (day >= weekStart && day <= today) weekSubmitted += 1;
  }

  return { weekSubmitted, streak: countStreak(days, today) };
}

/**
 * A streak that is still alive today or was alive yesterday. Nothing handed in
 * today does not break it — the day is not over yet.
 */
export function countStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : addDaysIso(today, -1);
  let streak = 0;

  while (days.has(cursor)) {
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }

  return streak;
}
