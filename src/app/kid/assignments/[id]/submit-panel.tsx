"use client";

/**
 * The child's side of the status machine: rate the work, say how long it took
 * and what was hard, then hand it in.
 *
 * There is no „დაწყება" button any more. Opening the page is what moves
 * `assigned -> in_progress` (see `auto-start.tsx`), so the only thing left for
 * the child to declare here is that they have finished.
 *
 * Submitting with no solution evidence — a photo OR a recording, because oral
 * homework has no photo to take — is blocked here with a plain explanation,
 * and again in `submitAssignmentAction`, because the button is not a guard.
 *
 * `ui_mode = "simple"` means bigger controls and only the required fields.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitAssignmentAction } from "@/features/assignments/actions";
import type { AssignmentStatus } from "@/lib/assignment-status";
import type { ChildUiMode } from "@/lib/db.types";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

const RATING_LABELS = [
  ka.kid.rating1,
  ka.kid.rating2,
  ka.kid.rating3,
  ka.kid.rating4,
  ka.kid.rating5,
];

export function SubmitPanel({
  assignmentId,
  status,
  uiMode,
  solutionCount,
  initialRating,
  initialMinutes,
  initialNote,
}: {
  assignmentId: string;
  status: AssignmentStatus;
  uiMode: ChildUiMode;
  solutionCount: number;
  initialRating: number | null;
  initialMinutes: number | null;
  initialNote: string | null;
}) {
  const router = useRouter();
  const simple = uiMode === "simple";

  const [rating, setRating] = React.useState<number | null>(initialRating);
  const [minutes, setMinutes] = React.useState(
    initialMinutes === null ? "" : String(initialMinutes),
  );
  const [note, setNote] = React.useState(initialNote ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit = status !== "submitted" && status !== "approved";
  /** Photos and recordings both count: `solutionCount` is every solution row. */
  const missingEvidence = solutionCount === 0;

  const submit = async () => {
    if (missingEvidence) {
      setError(ka.kid.needSolutionEvidence);
      return;
    }

    setBusy(true);
    setError(null);

    const parsedMinutes = minutes.trim() === "" ? null : Number(minutes);

    const result = await submitAssignmentAction({
      assignmentId,
      selfRating: rating,
      difficultyNote: note.trim() || null,
      minutesSpent:
        parsedMinutes !== null && Number.isFinite(parsedMinutes)
          ? Math.round(parsedMinutes)
          : null,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(ka.assignments.submittedOk);
    router.refresh();
  };

  if (!canSubmit) return null;

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4">
      <fieldset className="grid gap-2">
        <legend className={cn("mb-1 font-medium", simple && "text-lg")}>
          {ka.kid.howWasIt}
        </legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rating === value}
              aria-label={RATING_LABELS[value - 1]}
              onClick={() => setRating(rating === value ? null : value)}
              className={cn(
                "grid flex-1 place-items-center rounded-xl border text-lg font-semibold transition-colors",
                simple ? "h-16 text-2xl" : "h-12",
                rating === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        {rating ? (
          <p className="text-sm text-muted-foreground">
            {RATING_LABELS[rating - 1]}
          </p>
        ) : null}
      </fieldset>

      {!simple ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="minutes-spent">{ka.kid.timeSpent}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="minutes-spent"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="h-11 w-28"
              />
              <span className="text-sm text-muted-foreground">
                {ka.assignments.minutesUnit}
              </span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="difficulty-note">{ka.kid.whatWasHard}</Label>
            <Textarea
              id="difficulty-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={ka.kid.whatWasHardPlaceholder}
              rows={3}
              maxLength={2000}
            />
          </div>
        </>
      ) : null}

      {missingEvidence ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          {ka.kid.needSolutionEvidence}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="h-14 text-base"
        disabled={busy || missingEvidence}
        onClick={() => void submit()}
      >
        {busy ? (
          <Loader2 className="animate-spin" />
        ) : missingEvidence ? (
          <Check />
        ) : (
          <Send />
        )}
        {ka.kid.submitWork}
      </Button>
    </section>
  );
}
