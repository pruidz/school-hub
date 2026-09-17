import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Pencil, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatDueLabel,
} from "@/features/assignments/dates";
import { getReviewBundle } from "@/features/assignments/queries";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { MessageThread } from "@/features/messages/message-thread";
import { ka, t } from "@/lib/i18n/ka";

import { EvidencePanes } from "./evidence-panes";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: ka.review.title };

/**
 * P3 — the review screen. Split evidence, the child's own read on the work,
 * the history of what was asked for before, the actions, and the thread.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const bundle = await getReviewBundle(assignmentId);
  if (!bundle) notFound();

  const {
    assignment,
    child,
    subject,
    topicName,
    taskAttachments,
    solutionAttachments,
    previousComments,
    queueNextId,
    queueRemaining,
  } = bundle;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="grid min-w-0 gap-4">
        <header className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className="inline-flex items-center gap-1.5 font-medium"
              style={{ color: child.color }}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: child.color }}
              />
              {child.name}
            </span>
            {subject ? (
              <span className="text-muted-foreground">{subject.name}</span>
            ) : null}
            {topicName ? (
              <span className="text-muted-foreground">· {topicName}</span>
            ) : null}
            <AssignmentStatusBadge status={assignment.status} />
            {assignment.redo_count > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t("assignments.redoCount", { count: assignment.redo_count })}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {assignment.title}
            </h1>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/parent/assignments/${assignment.id}/edit`}>
                <Pencil />
                {ka.common.edit}
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {assignment.source_ref ? (
              <span>{assignment.source_ref}</span>
            ) : null}
            <span>{formatDueLabel(assignment.due_date)}</span>
            {assignment.submitted_at ? (
              <span>
                {t("assignments.submittedAt", {
                  date: formatDateTime(assignment.submitted_at),
                })}
              </span>
            ) : null}
            {assignment.reviewed_at ? (
              <span>
                {t("assignments.reviewedAt", {
                  date: formatDateTime(assignment.reviewed_at),
                })}
              </span>
            ) : null}
          </div>

          {assignment.description ? (
            <p className="text-sm whitespace-pre-wrap">
              {assignment.description}
            </p>
          ) : null}
        </header>

        <EvidencePanes
          taskAttachments={taskAttachments}
          solutionAttachments={solutionAttachments}
        />

        <section className="grid gap-3 rounded-xl border bg-card p-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {ka.review.childFeedback}
          </h2>

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {ka.assignments.selfRating}
              </dt>
              <dd className="flex items-center gap-1 text-sm font-medium">
                {assignment.self_rating ? (
                  <>
                    <Star className="size-4 fill-amber-400 text-amber-500" />
                    {assignment.self_rating} / 5
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {ka.review.noSelfRating}
                  </span>
                )}
              </dd>
            </div>

            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {ka.assignments.minutesSpent}
              </dt>
              <dd className="flex items-center gap-1 text-sm font-medium">
                {assignment.minutes_spent !== null ? (
                  <>
                    <Clock className="size-4 text-muted-foreground" />
                    {assignment.minutes_spent} {ka.assignments.minutesUnit}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {ka.review.noMinutes}
                  </span>
                )}
              </dd>
            </div>

            <div className="grid gap-0.5 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">
                {ka.assignments.difficultyNote}
              </dt>
              <dd className="text-sm whitespace-pre-wrap">
                {assignment.difficulty_note ?? (
                  <span className="text-muted-foreground">
                    {ka.review.noDifficultyNote}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {assignment.redo_count > 0 || previousComments.length > 0 ? (
          <section className="grid gap-2 rounded-xl border bg-card p-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {ka.review.previousComments}
            </h2>
            {previousComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ka.review.noPreviousComments}
              </p>
            ) : (
              <ul className="grid gap-2">
                {previousComments.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border-l-2 border-destructive/50 bg-muted/40 px-3 py-2"
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {entry.comment}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {entry.actorName ? `${entry.actorName} · ` : ""}
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-4">
        <ReviewActions
          assignmentId={assignment.id}
          status={assignment.status}
          queueNextId={queueNextId}
          queueRemaining={queueRemaining}
        />

        <section className="grid gap-2 rounded-xl border bg-card p-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {ka.messages.title}
          </h2>
          <MessageThread
            assignmentId={assignment.id}
            childId={child.id}
            className="max-h-[28rem]"
          />
        </section>
      </aside>
    </div>
  );
}
