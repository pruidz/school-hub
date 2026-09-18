import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";
import { addDaysIso, formatDateLong, todayIso } from "@/features/schedule/dates";

/**
 * Date strip for the parent's "დღეს" tab.
 *
 * Unlike the child's `DayNav` the parent may walk back as far as they like, but
 * forward still stops at today: there is nothing to supervise about a day that
 * has not happened. No client state — every arrow is a link, so the whole tab
 * stays a Server Component.
 */
export function ChildDayNav({
  childId,
  date,
}: {
  childId: string;
  date: string;
}) {
  const today = todayIso();
  const base = `/parent/children/${childId}`;
  const previous = addDaysIso(date, -1);
  const next = addDaysIso(date, 1);
  const canGoForward = next <= today;

  return (
    <div className="flex items-center justify-between gap-2">
      <Button asChild variant="outline" size="icon" aria-label={ka.children.dayPrev}>
        <Link href={`${base}?d=${previous}`}>
          <ChevronLeft />
        </Link>
      </Button>

      <div className="min-w-0 text-center">
        <p className="truncate font-semibold">
          {date === today ? ka.common.today : formatDateLong(date)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {date === today
            ? formatDateLong(date)
            : date === addDaysIso(today, -1)
              ? ka.common.yesterday
              : null}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {date === today ? null : (
          <Button asChild variant="ghost" size="sm">
            <Link href={base}>
              <CalendarDays />
              {ka.children.dayToday}
            </Link>
          </Button>
        )}

        {canGoForward ? (
          <Button
            asChild
            variant="outline"
            size="icon"
            aria-label={ka.children.dayNext}
          >
            <Link href={`${base}?d=${next}`}>
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            disabled
            aria-label={ka.children.dayNoFuture}
            title={ka.children.dayNoFuture}
          >
            <ChevronRight />
          </Button>
        )}
      </div>
    </div>
  );
}
