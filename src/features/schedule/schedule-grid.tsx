"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ka, t } from "@/lib/i18n/ka";
import { ColorDot, FormError } from "@/features/children/form-ui";

import { formatDateShort } from "./dates";
import type { SlotView, SubjectView } from "./queries";
import {
  createScheduleSlot,
  deleteScheduleSlot,
  updateScheduleSlot,
} from "./slot-actions";
import { WEEKDAYS, weekdayLong, weekdayShort } from "./weekdays";

/**
 * P5 — the weekly timetable editor.
 *
 * Rows are the distinct time bands that actually exist in this version of the
 * timetable (schools do not run on a uniform 45-minute clock, and inventing
 * empty hours would make the grid unreadable). Clicking an empty cell opens the
 * editor pre-filled with that band and weekday; clicking a slot edits it.
 */

type DraftTarget =
  | { mode: "create"; weekday: number; startTime: string; endTime: string }
  | { mode: "edit"; slot: SlotView };

export function ScheduleGrid({
  childId,
  asOf,
  slots,
  subjects,
  isPast,
}: {
  childId: string;
  asOf: string;
  slots: SlotView[];
  subjects: SubjectView[];
  isPast: boolean;
}) {
  const [draft, setDraft] = React.useState<DraftTarget | null>(null);

  const bands = React.useMemo(() => buildBands(slots), [slots]);
  const byCell = React.useMemo(() => {
    const map = new Map<string, SlotView>();
    for (const slot of slots) {
      map.set(cellKey(slot.weekday, slot.startTime, slot.endTime), slot);
    }
    return map;
  }, [slots]);

  return (
    <>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th
                scope="col"
                className="w-28 border-b border-e p-2 text-start font-medium"
              >
                {ka.schedule.timeHeader}
              </th>
              {WEEKDAYS.map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  className="border-b border-e p-2 text-start font-medium last:border-e-0"
                >
                  <span className="hidden lg:inline">
                    {weekdayLong(weekday)}
                  </span>
                  <span className="lg:hidden">{weekdayShort(weekday)}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {bands.map((band) => (
              <tr key={`${band.startTime}-${band.endTime}`}>
                <th
                  scope="row"
                  className="border-b border-e p-2 text-start align-top font-normal whitespace-nowrap text-muted-foreground"
                >
                  {t("lessons.timeRange", {
                    from: band.startTime,
                    to: band.endTime,
                  })}
                </th>

                {WEEKDAYS.map((weekday) => {
                  const slot = byCell.get(
                    cellKey(weekday, band.startTime, band.endTime),
                  );

                  return (
                    <td
                      key={weekday}
                      className="border-b border-e p-1 align-top last:border-e-0"
                    >
                      {slot ? (
                        <SlotButton
                          slot={slot}
                          onClick={() => setDraft({ mode: "edit", slot })}
                        />
                      ) : (
                        <EmptyCellButton
                          label={t("schedule.addAt", {
                            weekday: weekdayLong(weekday),
                          })}
                          onClick={() =>
                            setDraft({
                              mode: "create",
                              weekday,
                              startTime: band.startTime,
                              endTime: band.endTime,
                            })
                          }
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Always one free row at the bottom for a brand-new time band. */}
            <tr>
              <th
                scope="row"
                className="border-e p-2 text-start align-top font-normal text-muted-foreground"
              >
                {ka.common.add}
              </th>
              {WEEKDAYS.map((weekday) => (
                <td key={weekday} className="border-e p-1 last:border-e-0">
                  <EmptyCellButton
                    label={t("schedule.addAt", {
                      weekday: weekdayLong(weekday),
                    })}
                    onClick={() =>
                      setDraft({
                        mode: "create",
                        weekday,
                        startTime: "",
                        endTime: "",
                      })
                    }
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <SlotDialog
        key={draftKey(draft)}
        childId={childId}
        asOf={asOf}
        subjects={subjects}
        draft={draft}
        isPast={isPast}
        onClose={() => setDraft(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  cells                                                                     */
/* -------------------------------------------------------------------------- */

function SlotButton({
  slot,
  onClick,
}: {
  slot: SlotView;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border-s-4 bg-card p-2 text-start transition hover:bg-accent"
      style={{ borderInlineStartColor: slot.subjectColor }}
    >
      <span className="block truncate font-medium">{slot.subjectName}</span>
      <span className="block text-xs text-muted-foreground">
        {t("lessons.timeRange", { from: slot.startTime, to: slot.endTime })}
      </span>
    </button>
  );
}

function EmptyCellButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-full min-h-12 w-full items-center justify-center rounded-md text-muted-foreground/50 transition hover:bg-accent hover:text-foreground"
    >
      <Plus className="size-4" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  editor                                                                    */
/* -------------------------------------------------------------------------- */

function SlotDialog({
  childId,
  asOf,
  subjects,
  draft,
  isPast,
  onClose,
}: {
  childId: string;
  asOf: string;
  subjects: SubjectView[];
  draft: DraftTarget | null;
  isPast: boolean;
  onClose: () => void;
}) {
  const editing = draft?.mode === "edit" ? draft.slot : null;

  const [subjectId, setSubjectId] = React.useState(
    editing?.subjectId ?? subjects[0]?.id ?? "",
  );
  const [weekday, setWeekday] = React.useState(
    draft?.mode === "edit" ? draft.slot.weekday : (draft?.weekday ?? 1),
  );
  const [startTime, setStartTime] = React.useState(
    draft?.mode === "edit" ? draft.slot.startTime : (draft?.startTime ?? ""),
  );
  const [endTime, setEndTime] = React.useState(
    draft?.mode === "edit" ? draft.slot.endTime : (draft?.endTime ?? ""),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = editing
        ? await updateScheduleSlot({
            slotId: editing.id,
            subjectId,
            weekday,
            startTime,
            endTime,
            asOf,
          })
        : await createScheduleSlot({
            childId,
            subjectId,
            weekday,
            startTime,
            endTime,
            asOf,
          });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      toast.success(
        editing ? ka.schedule.slotUpdated : ka.schedule.slotCreated,
      );
      onClose();
    });
  }

  function remove() {
    if (!editing) return;
    startTransition(async () => {
      const result = await deleteScheduleSlot({ slotId: editing.id, asOf });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(ka.schedule.slotDeleted);
      setConfirmDelete(false);
      onClose();
    });
  }

  return (
    <>
      <Dialog
        open={draft !== null && !confirmDelete}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? ka.schedule.editSlot : ka.schedule.addSlot}
            </DialogTitle>
            <DialogDescription>
              {isPast
                ? ka.schedule.pastNotice
                : editing
                  ? t("schedule.effectiveFrom", {
                      from: formatDateShort(editing.effectiveFrom),
                    })
                  : ka.schedule.subtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <FormError message={error} />

            <div className="grid gap-1.5">
              <Label>{ka.schedule.subject}</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={ka.schedule.subject} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={subject.color} />
                        {subject.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>{ka.schedule.weekdayHeader}</Label>
              <Select
                value={String(weekday)}
                onValueChange={(value) => setWeekday(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {weekdayLong(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="slot-start">{ka.schedule.startTime}</Label>
                <Input
                  id="slot-start"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="slot-end">{ka.schedule.endTime}</Label>
                <Input
                  id="slot-end"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                {ka.common.delete}
              </Button>
            ) : (
              <span />
            )}

            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                {ka.common.cancel}
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={pending || !subjectId || !startTime || !endTime}
              >
                {pending ? ka.common.saving : ka.common.save}
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ka.schedule.deleteSlotConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ka.schedule.deleteSlotConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending}>
              {ka.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

type Band = { startTime: string; endTime: string };

function buildBands(slots: SlotView[]): Band[] {
  const seen = new Map<string, Band>();
  for (const slot of slots) {
    const key = `${slot.startTime}-${slot.endTime}`;
    if (!seen.has(key)) {
      seen.set(key, { startTime: slot.startTime, endTime: slot.endTime });
    }
  }

  return [...seen.values()].sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime),
  );
}

function cellKey(weekday: number, startTime: string, endTime: string): string {
  return `${weekday}|${startTime}-${endTime}`;
}

/** Remount the dialog whenever the target changes so its fields reset. */
function draftKey(draft: DraftTarget | null): string {
  if (!draft) return "none";
  if (draft.mode === "edit") return `edit:${draft.slot.id}`;
  return `create:${draft.weekday}:${draft.startTime}:${draft.endTime}`;
}
