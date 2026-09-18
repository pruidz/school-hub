import "server-only";

import { AlertTriangle, Check } from "lucide-react";

import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { isoWeekday } from "@/features/schedule/dates";
import { listSlotsActiveOn } from "@/features/schedule/queries";
import { listDayLessons, missingSlots } from "@/features/lessons/queries";
import type { DayLesson } from "@/features/lessons/queries";

import {
  LessonReviewCard,
  MissingLessonCard,
  isLessonFilled,
  lessonRecordState,
  type LessonRecordState,
} from "./lesson-review-card";

/**
 * The parent's read-only mirror of `/kid/today` for one day.
 *
 * Two reads, both reused rather than reinvented:
 *   `listDayLessons`     — the same rows the child edits, with photos and the
 *                          `no_homework` flag already resolved (A3's helper)
 *   `listSlotsActiveOn`  — the timetable in force that day
 *
 * The second one is what makes "nothing entered" honest. A day the child never
 * opened has no `lessons` rows at all, so reading only the lessons table would
 * show an empty, reassuring column. Diffing the timetable against it — with
 * A3's own `missingSlots()` so the "covered by a hand-made lesson" rule stays
 * in one place — turns that silence into a card per missed lesson.
 */

type DayEntry =
  | {
      kind: "lesson";
      key: string;
      time: string | null;
      lesson: DayLesson;
      state: LessonRecordState;
    }
  | {
      kind: "slot";
      key: string;
      time: string | null;
      subjectName: string;
      subjectColor: string;
      startTime: string;
      endTime: string;
    };

export async function ChildDay({
  childId,
  date,
}: {
  childId: string;
  date: string;
}) {
  const [lessons, slots] = await Promise.all([
    listDayLessons(childId, date),
    listSlotsActiveOn(childId, date),
  ]);

  const weekday = isoWeekday(date);
  const daySlots = slots.filter((slot) => slot.weekday === weekday);

  const uncovered = missingSlots(
    daySlots.map((slot) => ({ id: slot.id, subject_id: slot.subjectId })),
    lessons.map((lesson) => ({
      slot_id: lesson.slotId,
      subject_id: lesson.subjectId,
    })),
  );
  const uncoveredIds = new Set(uncovered.map((slot) => slot.id));

  const entries: DayEntry[] = [
    ...lessons.map<DayEntry>((lesson) => ({
      kind: "lesson",
      key: lesson.id,
      time: lesson.startTime,
      lesson,
      state: lessonRecordState(lesson),
    })),
    ...daySlots
      .filter((slot) => uncoveredIds.has(slot.id))
      .map<DayEntry>((slot) => ({
        kind: "slot",
        key: `slot:${slot.id}`,
        time: slot.startTime,
        subjectName: slot.subjectName,
        subjectColor: slot.subjectColor,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
  ].sort(byClockThenInsertion);

  const total = entries.length;
  const filled = entries.filter(
    (entry) => entry.kind === "lesson" && isLessonFilled(entry.state),
  ).length;
  const missing = total - filled;

  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">
          {ka.children.dayLessonsHeading}
        </h2>
        {total > 0 ? (
          <span
            className={cn(
              "text-sm tabular-nums",
              missing > 0
                ? "font-medium text-amber-700 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {t("children.dayFilledCount", { done: filled, total })}
          </span>
        ) : null}
      </header>

      {total === 0 ? (
        <EmptyDay />
      ) : (
        <>
          <DaySummary filled={filled} missing={missing} />
          {entries.map((entry) =>
            entry.kind === "lesson" ? (
              <LessonReviewCard
                key={entry.key}
                lesson={entry.lesson}
                state={entry.state}
              />
            ) : (
              <MissingLessonCard
                key={entry.key}
                subjectName={entry.subjectName}
                subjectColor={entry.subjectColor}
                startTime={entry.startTime}
                endTime={entry.endTime}
              />
            ),
          )}
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The quiet per-day line. "Nothing at all" gets its own loud variant: that is
 * the single fact a remote parent is scanning for, and a `0/5` counter alone is
 * too easy to miss on a phone.
 */
function DaySummary({ filled, missing }: { filled: number; missing: number }) {
  if (missing === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
        <Check aria-hidden className="size-4 shrink-0" />
        {ka.children.dayAllFilled}
      </p>
    );
  }

  if (filled === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border-2 border-amber-500/70 bg-amber-50/70 p-3 text-amber-800 dark:border-amber-500/50 dark:bg-amber-950/25 dark:text-amber-300">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="grid gap-0.5">
          <p className="font-semibold">{ka.children.dayNothingRecorded}</p>
          <p className="text-sm opacity-90">
            {ka.children.dayNothingRecordedHint}
          </p>
        </div>
      </div>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      {t("children.dayMissingCount", { count: missing })}
    </p>
  );
}

function EmptyDay() {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <p className="font-medium">{ka.children.dayNoLessons}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {ka.children.dayNoLessonsHint}
      </p>
    </div>
  );
}

/** Timetabled entries in clock order; hand-made lessons keep the tail. */
function byClockThenInsertion(a: DayEntry, b: DayEntry): number {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return 0;
}
