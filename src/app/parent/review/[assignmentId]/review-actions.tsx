"use client";

/**
 * ✓ / ↻ and the queue.
 *
 * Target: about 30 seconds per assignment. That means no dialogs in the happy
 * path, keyboard shortcuts for a parent working through a stack, and an
 * automatic jump to the next submission after acting.
 *
 *   A — approve      R — return for redo (focuses the comment)
 *   N — next in queue
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveAssignmentAction,
  reopenAssignmentAction,
  requestRedoAction,
} from "@/features/assignments/actions";
import type { AssignmentStatus } from "@/lib/assignment-status";
import { ka, t } from "@/lib/i18n/ka";

export function ReviewActions({
  assignmentId,
  status,
  queueNextId,
  queueRemaining,
}: {
  assignmentId: string;
  status: AssignmentStatus;
  queueNextId: string | null;
  queueRemaining: number;
}) {
  const router = useRouter();
  const [comment, setComment] = React.useState("");
  const [redoOpen, setRedoOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "approve" | "redo">(null);
  const [error, setError] = React.useState<string | null>(null);

  const commentRef = React.useRef<HTMLTextAreaElement>(null);

  const reviewable = status === "submitted";
  const reopenable = status === "approved";

  const goNext = React.useCallback(() => {
    router.push(queueNextId ? `/parent/review/${queueNextId}` : "/parent/inbox");
  }, [queueNextId, router]);

  const approve = React.useCallback(async () => {
    if (!reviewable || busy) return;
    setBusy("approve");
    setError(null);

    const result = await approveAssignmentAction({ assignmentId });
    setBusy(null);

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(ka.review.approvedOk);
    goNext();
  }, [assignmentId, busy, goNext, reviewable]);

  const sendBack = React.useCallback(async () => {
    if (!reviewable || busy) return;

    const trimmed = comment.trim();
    if (trimmed.length < 3) {
      setRedoOpen(true);
      setError(ka.validation.commentRequired);
      commentRef.current?.focus();
      return;
    }

    setBusy("redo");
    setError(null);

    const result = await requestRedoAction({
      assignmentId,
      comment: trimmed,
    });
    setBusy(null);

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(ka.review.sentBackOk);
    goNext();
  }, [assignmentId, busy, comment, goNext, reviewable]);

  const reopen = async (to: "redo" | "in_progress") => {
    const trimmed = comment.trim();
    if (to === "redo" && trimmed.length < 3) {
      setRedoOpen(true);
      setError(ka.validation.commentRequired);
      commentRef.current?.focus();
      return;
    }

    setBusy(to === "redo" ? "redo" : "approve");
    setError(null);

    const result = await reopenAssignmentAction({
      assignmentId,
      to,
      comment: trimmed || null,
    });
    setBusy(null);

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }
    toast.success(ka.review.reopenedOk);
    router.refresh();
  };

  /* ------------------------------------------------------- keyboard ------ */

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        void approve();
      } else if (key === "r") {
        event.preventDefault();
        setRedoOpen(true);
        // Let the textarea mount before moving focus into it.
        requestAnimationFrame(() => commentRef.current?.focus());
      } else if (key === "n") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [approve, goNext]);

  /* --------------------------------------------------------- render ------ */

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-3">
      {!reviewable && !reopenable ? (
        <p className="text-sm text-muted-foreground">
          {ka.review.notSubmitted}
        </p>
      ) : null}

      {redoOpen || !reviewable ? (
        <div className="grid gap-1.5">
          <label
            htmlFor="redo-comment"
            className="text-sm font-medium"
          >
            {ka.review.redoCommentLabel}
          </label>
          <Textarea
            id="redo-comment"
            ref={commentRef}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={ka.review.redoCommentPlaceholder}
            rows={3}
            aria-invalid={error ? true : undefined}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {reviewable ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="lg"
            className="h-11"
            disabled={busy !== null}
            onClick={() => void approve()}
          >
            {busy === "approve" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Check />
            )}
            {ka.review.approve}
          </Button>

          <Button
            type="button"
            size="lg"
            variant="destructive"
            className="h-11"
            disabled={busy !== null}
            onClick={() => {
              if (!redoOpen) {
                setRedoOpen(true);
                requestAnimationFrame(() => commentRef.current?.focus());
                return;
              }
              void sendBack();
            }}
          >
            {busy === "redo" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RotateCcw />
            )}
            {ka.review.requestRedo}
          </Button>
        </div>
      ) : null}

      {reopenable ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void reopen("in_progress")}
          >
            {ka.review.reopenToProgress}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => void reopen("redo")}
          >
            {ka.review.reopenToRedo}
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/parent/inbox")}
        >
          <ChevronLeft />
          {ka.review.backToInbox}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={queueRemaining === 0}
        >
          {queueRemaining === 0
            ? ka.review.queueEmpty
            : `${ka.review.nextInQueue} · ${t("review.queueRemaining", { count: queueRemaining })}`}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {ka.review.shortcuts}: {ka.review.shortcutApprove} ·{" "}
        {ka.review.shortcutRedo} · {ka.review.shortcutNext}
      </p>
    </section>
  );
}
