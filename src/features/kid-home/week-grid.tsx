"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CircleSlash, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/features/schedule/dates";
import { weekdayLong, weekdayShort } from "@/features/schedule/weekdays";
import { KidQuickAdd } from "@/features/assignments/kid-quick-add";

import type { CellState } from "./model";
import type { KidWeek, WeekCell } from "./queries";

/**
 * C6 — the week as a plan and as a map of what is done (SPEC 4a).
 *
 * SHAPE. Seven days of six periods is 42 cells; as a literal table at 375px
 * that is a 45-pixel column, which fits neither „მათემატიკა" nor a thumb. So
 * the week is laid out DAY-MAJOR: one row per weekday, the day pinned to the
 * start, its lessons flowing across the row as chips in clock order and
 * wrapping. At 375px that is two chips a line (≈150px each, a comfortable
 * target); from about 640px a whole day fits on one line and the thing reads
 * as the familiar grid — same DOM, no breakpoint-specific markup.
 *
 * COLOUR. Two channels at once, because the grid answers two questions. The
 * stripe at the start of a chip is the SUBJECT colour ("where is maths?"); the
 * fill is the STATE of the homework given in that lesson ("where is the
 * hole?"). See `cellState` for the scale.
 *
 * TAPPING. Every cell is tappable. What opens depends on what the cell can
 * honestly offer: a lesson that has happened opens the quick-add with subject
 * and lesson already filled in, a past day the child never opened offers to
 * open that day (its lesson rows are created there), and a future lesson says
 * so instead of pretending homework can be recorded before it is given.
 */
export function WeekGrid({
  week,
  childId,
}: {
  week: KidWeek;
  childId: string;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);

  const cells = React.useMemo(() => {
    const map = new Map<string, WeekCell>();
    for (const day of week.days) {
      for (const cell of day.cells) map.set(cell.key, cell);
    }
    return map;
  }, [week]);

  const current = selected ? (cells.get(selected) ?? null) : null;
  const empty = week.days.every((day) => day.cells.length === 0);

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="font-medium">{ka.kid.weekEmpty}</p>
        <p className="text-sm text-muted-foreground">{ka.kid.weekEmptyHint}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        {week.days.map((day) => (
          <div
            key={day.date}
            className={cn(
              "flex items-stretch gap-2 rounded-lg p-1",
              day.isToday && "bg-primary/5 ring-1 ring-primary/30",
            )}
          >
            <div className="flex w-12 shrink-0 flex-col justify-center">
              <span
                className={cn(
                  "text-sm font-semibold",
                  day.isToday && "text-primary",
                )}
              >
                {weekdayShort(day.weekday)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDateShort(day.date)}
              </span>
              <span className="sr-only">{weekdayLong(day.weekday)}</span>
            </div>

            {day.cells.length === 0 ? (
              <p className="flex flex-1 items-center text-xs text-muted-foreground">
                {ka.kid.weekDayEmpty}
              </p>
            ) : (
              <div className="flex flex-1 flex-wrap gap-1">
                {day.cells.map((cell) => (
                  <Cell
                    key={cell.key}
                    cell={cell}
                    selected={cell.key === selected}
                    onSelect={() =>
                      setSelected((previous) =>
                        previous === cell.key ? null : cell.key,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {current ? (
        <CellPanel
          cell={current}
          childId={childId}
          uiMode={week.uiMode}
          onClose={() => setSelected(null)}
        />
      ) : (
        <Legend />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  one cell                                                                   */
/* -------------------------------------------------------------------------- */

const STATE_CLASS: Record<CellState, string> = {
  empty: "bg-muted text-muted-foreground",
  // „თეთრი/ნიშნით" — the card colour plus a dashed outline and the ⊘ mark, so
  // "we were given none" never reads as "nobody has filled this in".
  none: "bg-background text-muted-foreground border-dashed border-muted-foreground/40",
  todo: "bg-amber-400/25 text-amber-950 dark:text-amber-100",
  submitted: "bg-sky-400/25 text-sky-950 dark:text-sky-100",
  approved: "bg-emerald-500/25 text-emerald-950 dark:text-emerald-100",
  overdue: "bg-destructive/20 text-red-950 dark:text-red-100",
};

const STATE_LABEL: Record<CellState, string> = {
  empty: ka.kid.cellEmpty,
  none: ka.kid.cellNone,
  todo: ka.kid.cellTodo,
  submitted: ka.kid.cellSubmitted,
  approved: ka.kid.cellApproved,
  overdue: ka.kid.cellOverdue,
};

function Cell({
  cell,
  selected,
  onSelect,
}: {
  cell: WeekCell;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        // 44px minimum target, half the row at 375px, its natural width once
        // the row has space.
        "flex min-h-11 min-w-0 flex-[1_1_calc(50%-0.125rem)] items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-start transition-colors sm:flex-[0_1_auto] sm:min-w-28",
        STATE_CLASS[cell.state],
        selected && "ring-2 ring-primary ring-offset-1",
        !cell.recordable && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className="h-6 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: cell.subjectColor }}
      />
      <span className="grid min-w-0">
        <span className="truncate text-xs font-semibold">
          {cell.subjectName}
        </span>
        <span className="truncate text-[11px] opacity-80">
          {cell.startTime}
        </span>
      </span>
      {cell.state === "none" ? (
        <CircleSlash aria-hidden className="ms-auto size-3.5 shrink-0" />
      ) : null}
      <span className="sr-only">{STATE_LABEL[cell.state]}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  the panel under the grid                                                   */
/* -------------------------------------------------------------------------- */

function CellPanel({
  cell,
  childId,
  uiMode,
  onClose,
}: {
  cell: WeekCell;
  childId: string;
  uiMode: KidWeek["uiMode"];
  onClose: () => void;
}) {
  return (
    <section
      className="grid gap-3 rounded-xl border bg-card p-3"
      aria-label={cell.subjectName}
    >
      <header className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1 h-8 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: cell.subjectColor }}
        />
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate font-semibold">{cell.subjectName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateShort(cell.date)} ·{" "}
            {t("lessons.timeRange", {
              from: cell.startTime,
              to: cell.endTime,
            })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ms-auto"
          aria-label={ka.kid.cellClose}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      {cell.topic ? <p className="text-sm">{cell.topic}</p> : null}

      {cell.items.length > 0 ? (
        <ul className="grid gap-1.5">
          {cell.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/kid/assignments/${item.id}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {STATE_LABEL[
                    item.status === "approved"
                      ? "approved"
                      : item.status === "submitted"
                        ? "submitted"
                        : "todo"
                  ]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {cell.recordable ? (
        cell.lessonId ? (
          <KidQuickAdd
            childId={childId}
            lesson={{
              id: cell.lessonId,
              subjectId: cell.subjectId,
              subjectName: cell.subjectName,
            }}
            // SPEC 4a: the next lesson of this same subject, computed server-side.
            defaultDueDate={cell.defaultDueDate}
            uiMode={uiMode}
            size={uiMode === "simple" ? "lg" : "default"}
            className="w-full"
          />
        ) : (
          // No lesson row yet — the day was never opened. `/kid/today?d=` is
          // where the timetable is materialised, so send the child there
          // rather than inventing a second write path for the same rows.
          <Button asChild variant="secondary" className="w-full">
            <Link href={`/kid/today?d=${cell.date}`}>
              {ka.kid.cellOpenDay}
            </Link>
          </Button>
        )
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" />
          {ka.kid.cellNotYet}
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  legend                                                                     */
/* -------------------------------------------------------------------------- */

const LEGEND: CellState[] = [
  "empty",
  "none",
  "todo",
  "submitted",
  "approved",
  "overdue",
];

function Legend() {
  return (
    <div className="grid gap-1.5 rounded-xl border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {ka.kid.weekLegend}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
        {LEGEND.map((state) => (
          <li key={state} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className={cn(
                "size-3.5 rounded border",
                STATE_CLASS[state],
              )}
            />
            {STATE_LABEL[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}
