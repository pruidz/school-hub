"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ka } from "@/lib/i18n/ka";
import { FormError } from "@/features/children/form-ui";

import { addDaysIso, todayIso } from "./dates";
import { startNewTimetableVersion } from "./slot-actions";

/**
 * "Which timetable am I looking at" plus the explicit fork action.
 *
 * The viewed date lives in the URL (`?from=`), so the grid stays a Server
 * Component and a reload or a shared link shows the same version.
 */
export function ScheduleToolbar({
  childId,
  asOf,
}: {
  childId: string;
  asOf: string;
}) {
  const router = useRouter();
  const today = todayIso();

  function goTo(date: string) {
    router.push(`/parent/schedule?from=${date}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="schedule-as-of">{ka.schedule.asOf}</Label>
        <Input
          id="schedule-as-of"
          type="date"
          value={asOf}
          className="w-44"
          onChange={(event) => {
            if (event.target.value) goTo(event.target.value);
          }}
        />
      </div>

      {asOf === today ? null : (
        <Button variant="outline" onClick={() => goTo(today)}>
          <CalendarDays />
          {ka.schedule.showToday}
        </Button>
      )}

      <NewVersionDialog childId={childId} asOf={asOf} onDone={goTo} />
    </div>
  );
}

function NewVersionDialog({
  childId,
  asOf,
  onDone,
}: {
  childId: string;
  asOf: string;
  onDone: (date: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(() => {
    const today = todayIso();
    return addDaysIso(asOf > today ? asOf : today, 1);
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await startNewTimetableVersion({ childId, asOf, from });
      if (!result.ok) {
        setError(result.message);
        return;
      }

      toast.success(
        result.data.copied === 0
          ? ka.schedule.newVersionEmpty
          : ka.schedule.newVersionCreated,
      );
      setOpen(false);
      onDone(result.data.from);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock />
          {ka.schedule.newVersion}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ka.schedule.newVersionTitle}</DialogTitle>
          <DialogDescription>
            {ka.schedule.newVersionExplain}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <FormError message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="new-version-from">
              {ka.schedule.newVersionFrom}
            </Label>
            <Input
              id="new-version-from"
              type="date"
              value={from}
              min={todayIso()}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {ka.common.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || !from}>
            {pending ? ka.common.saving : ka.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
