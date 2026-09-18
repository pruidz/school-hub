"use client";

/**
 * Approve / return-for-redo, and the thread composer, for a helper.
 *
 * Rendered only when the helper actually holds the right — a disabled button
 * that explains why it is disabled is still a control the person cannot use,
 * and the whole point of the `/helper` area is not to show those. When the
 * right is missing the panel says so in one sentence instead.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ka } from "@/lib/i18n/ka";

import {
  helperApproveAction,
  helperRequestRedoAction,
  helperSendMessageAction,
} from "./review-actions";

export function HelperReviewActions({
  assignmentId,
  canReview,
  isSubmitted,
}: {
  assignmentId: string;
  canReview: boolean;
  isSubmitted: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState<"approve" | "redo" | null>(null);

  if (!canReview) {
    return (
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {ka.helpers.viewOnlyExplain}
      </p>
    );
  }

  if (!isSubmitted) {
    return (
      <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
        {ka.review.notSubmitted}
      </p>
    );
  }

  const run = async (kind: "approve" | "redo") => {
    setBusy(kind);
    const result =
      kind === "approve"
        ? await helperApproveAction({
            assignmentId,
            comment: comment.trim() || null,
          })
        : await helperRequestRedoAction({ assignmentId, comment });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(
      kind === "approve" ? ka.review.approvedOk : ka.review.sentBackOk,
    );
    setComment("");
    router.refresh();
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="helper-review-comment">
          {ka.review.redoCommentLabel}
        </Label>
        <Textarea
          id="helper-review-comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={ka.review.redoCommentPlaceholder}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("approve")}
        >
          {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />}
          {ka.review.approve}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null || comment.trim().length < 3}
          onClick={() => void run("redo")}
        >
          {busy === "redo" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {ka.review.requestRedo}
        </Button>
      </div>
    </div>
  );
}

export function HelperComposer({
  assignmentId,
  canComment,
}: {
  assignmentId: string;
  canComment: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!canComment) {
    return (
      <p className="text-xs text-muted-foreground">
        {ka.helpers.commentOffExplain}
      </p>
    );
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (body.trim().length === 0) return;

    setBusy(true);
    const result = await helperSendMessageAction({ assignmentId, body });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setBody("");
    router.refresh();
  };

  return (
    <form onSubmit={send} className="flex items-end gap-2">
      <Textarea
        rows={2}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={ka.messages.placeholder}
        aria-label={ka.messages.placeholder}
        className="min-h-0 flex-1 resize-none"
      />
      <Button type="submit" size="icon" disabled={busy || !body.trim()}>
        {busy ? <Loader2 className="animate-spin" /> : <Send />}
        <span className="sr-only">{ka.messages.send}</span>
      </Button>
    </form>
  );
}
