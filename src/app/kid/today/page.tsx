import type { Metadata } from "next";

import { requireChild } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { isIsoDate, todayIso } from "@/features/schedule/dates";
import { KidDashboard } from "@/features/kid-home/dashboard";
import { getKidHome } from "@/features/kid-home/queries";
import { ViewToggle } from "@/features/kid-home/view-toggle";

import { DayNav } from "./day-nav";

export const metadata: Metadata = { title: ka.kid.todayTitle };

/**
 * C1 — the child's home screen (SPEC 4a).
 *
 * One read (`getKidHome`) feeds the whole page, so the screen the child opens
 * twenty times a day costs eight Supabase round trips in two waves rather than
 * one per section. `<KidDashboard>` decides what dominates; see its comment.
 *
 * `?d=` may only ever point at today or the past; a hand-typed future date is
 * clamped back to today rather than 404-ing, because a kid landing on an error
 * page from a stale home-screen shortcut is worse than a silent correction.
 */
export default async function KidTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const child = await requireChild();

  const { d } = await searchParams;
  const today = todayIso();
  const requested = typeof d === "string" && isIsoDate(d) ? d : today;
  const date = requested > today ? today : requested;

  const home = await getKidHome(child.childId, date, today);

  return (
    <div className="grid gap-4">
      <ViewToggle current="day" />
      <DayNav date={date} />
      <KidDashboard home={home} childId={child.childId} />
    </div>
  );
}
