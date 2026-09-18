import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireChild } from "@/lib/auth/session";
import { ka, t } from "@/lib/i18n/ka";
import {
  addDaysIso,
  formatDateShort,
  isIsoDate,
  startOfIsoWeek,
  todayIso,
} from "@/features/schedule/dates";
import { getKidWeek } from "@/features/kid-home/queries";
import { ViewToggle } from "@/features/kid-home/view-toggle";
import { WeekGrid } from "@/features/kid-home/week-grid";

export const metadata: Metadata = { title: ka.kid.weekTitle };

/**
 * C6 — the week grid (SPEC 4a).
 *
 * Unlike „დღეს", this view may look forward: the timetable is a plan as well
 * as a record, and "what do I have on Friday" is half the reason the child
 * opens it. Six Supabase round trips, one wave plus the assignments of the
 * week's lessons.
 */
export default async function KidWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const child = await requireChild();

  const { w } = await searchParams;
  const today = todayIso();
  const anchor = typeof w === "string" && isIsoDate(w) ? w : today;

  const week = await getKidWeek(child.childId, anchor, today);

  const previous = addDaysIso(week.weekStart, -7);
  const next = addDaysIso(week.weekStart, 7);
  const isCurrent = week.weekStart === startOfIsoWeek(today);

  return (
    <div className="grid gap-4">
      <ViewToggle current="week" />

      <div className="flex items-center justify-between gap-2">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={ka.kid.weekPrev}
        >
          <Link href={`/kid/week?w=${previous}`}>
            <ChevronLeft className="size-6" />
          </Link>
        </Button>

        <div className="text-center">
          <p className="font-semibold">
            {t("kid.weekRange", {
              from: formatDateShort(week.weekStart),
              to: formatDateShort(week.weekEnd),
            })}
          </p>
          {isCurrent ? (
            <p className="text-xs text-muted-foreground">{ka.kid.weekThis}</p>
          ) : (
            <Link
              href="/kid/week"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {ka.kid.weekThis}
            </Link>
          )}
        </div>

        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={ka.kid.weekNext}
        >
          <Link href={`/kid/week?w=${next}`}>
            <ChevronRight className="size-6" />
          </Link>
        </Button>
      </div>

      <WeekGrid week={week} childId={child.childId} />
    </div>
  );
}
