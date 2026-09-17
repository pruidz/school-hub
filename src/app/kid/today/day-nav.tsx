"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka } from "@/lib/i18n/ka";
import { addDaysIso, formatDateLong, todayIso } from "@/features/schedule/dates";

/**
 * Yesterday / today. Forward is disabled on today — a child records what has
 * already happened, and a future day has nothing to record.
 */
export function DayNav({ date }: { date: string }) {
  const today = todayIso();
  const previous = addDaysIso(date, -1);
  const next = addDaysIso(date, 1);
  const canGoForward = next <= today;

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={ka.kid.dayPrev}
      >
        <Link href={`/kid/today?d=${previous}`}>
          <ChevronLeft className="size-6" />
        </Link>
      </Button>

      <div className="text-center">
        <p className="text-lg font-semibold">
          {date === today ? ka.common.today : formatDateLong(date)}
        </p>
        {date === today ? (
          <p className="text-xs text-muted-foreground">
            {formatDateLong(date)}
          </p>
        ) : date === addDaysIso(today, -1) ? (
          <p className="text-xs text-muted-foreground">{ka.common.yesterday}</p>
        ) : null}
      </div>

      {canGoForward ? (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={ka.kid.dayToday}
        >
          <Link href={`/kid/today?d=${next}`}>
            <ChevronRight className="size-6" />
          </Link>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          disabled
          aria-label={ka.kid.noFuture}
          title={ka.kid.noFuture}
        >
          <ChevronRight className="size-6" />
        </Button>
      )}
    </div>
  );
}
