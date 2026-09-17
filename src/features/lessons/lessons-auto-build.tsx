"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ka } from "@/lib/i18n/ka";

import { materialiseDayLessons } from "./actions";

/**
 * Turns the day's timetable into `lessons` rows the first time the child opens
 * that day.
 *
 * A Server Component cannot write during a render, so the materialisation is
 * triggered from the client — once, and only when the page already knows there
 * are slots without a lesson. The action itself is idempotent and refuses
 * future dates, so a double render or a stale tab cannot duplicate anything.
 */
export function LessonsAutoBuild({
  childId,
  date,
  missing,
}: {
  childId: string;
  date: string;
  missing: number;
}) {
  const router = useRouter();
  const requested = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (missing <= 0) return;

    const key = `${childId}:${date}`;
    if (requested.current === key) return;
    requested.current = key;

    let cancelled = false;
    void materialiseDayLessons({ childId, date }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.created > 0) router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [childId, date, missing, router]);

  if (missing <= 0) return null;

  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" />
      {ka.common.loading}
    </p>
  );
}
