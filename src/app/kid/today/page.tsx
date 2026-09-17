import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireChild } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { getKidProfile } from "@/features/children/queries";
import { isIsoDate, todayIso } from "@/features/schedule/dates";
import { DayLessons } from "@/features/lessons/day-lessons";
import { KidDayAssignments } from "@/features/assignments";

import { DayNav } from "./day-nav";

export const metadata: Metadata = { title: ka.kid.todayTitle };

/**
 * C1 / C2 — the child's main screen: today's lessons, what was covered in each
 * of them, a photo of the book page, and the day's homework underneath.
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

  const profile = await getKidProfile(child.childId);
  if (!profile) notFound();

  return (
    <div className="grid gap-5">
      <DayNav date={date} />

      <DayLessons
        childId={child.childId}
        date={date}
        uiMode={profile.uiMode}
      />

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{ka.kid.assignmentsHeading}</h2>
        {/* Owned by A4 — see the contract in CLAUDE.md. */}
        <KidDayAssignments childId={child.childId} date={date} />
      </section>
    </div>
  );
}
