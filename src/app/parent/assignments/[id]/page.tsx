import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Pencil, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatDueLabel,
} from "@/features/assignments/dates";
import { getReviewBundle } from "@/features/assignments/queries";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { EvidenceGallery } from "@/features/attachments/evidence-gallery";
import { PhotoGallery } from "@/features/attachments/photo-gallery";
import { PhotoUploader } from "@/features/attachments/photo-uploader";
import { MessageThread } from "@/features/messages/message-thread";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.assignments.title };

/**
 * One assignment, from the parent's side, in any status. `submitted` work is
 * better handled on `/parent/review/[id]`, which this page links to.
 */
export default async function ParentAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getReviewBundle(id);
  if (!bundle) notFound();

  const { assignment, child, subject, topicName, taskAttachments, solutionAttachments } =
    bundle;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="grid min-w-0 gap-4">
        <header className="grid gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="justify-self-start"
          >
            <Link href="/parent/assignments">
              <ChevronLeft />
              {ka.common.back}
            </Link>
          </Button>

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
          </div>

          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {assignment.title}
            </h1>
            <div className="flex gap-2">
              {assignment.status === "submitted" ? (
                <Button asChild size="sm">
                  <Link href={`/parent/review/${assignment.id}`}>
                    {ka.inbox.review}
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href={`/parent/assignments/${assignment.id}/edit`}>
                  <Pencil />
                  {ka.common.edit}
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {assignment.source_ref ? <span>{assignment.source_ref}</span> : null}
            <span>{formatDueLabel(assignment.due_date)}</span>
            {assignment.redo_count > 0 ? (
              <span>
                {t("assignments.redoCount", { count: assignment.redo_count })}
              </span>
            ) : null}
            {assignment.submitted_at ? (
              <span>
                {t("assignments.submittedAt", {
                  date: formatDateTime(assignment.submitted_at),
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

        <section className="grid gap-3 rounded-xl border bg-card p-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {ka.assignments.taskPhotos}
          </h2>
          <PhotoGallery attachments={taskAttachments} zoom />
          <PhotoUploader
            target={{
              kind: "assignment",
              assignmentId: assignment.id,
              childId: child.id,
              attachmentKind: "task_source",
            }}
            existingCount={taskAttachments.length}
            label={ka.attachments.addPhotos}
          />
        </section>

        <section className="grid gap-3 rounded-xl border bg-card p-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {ka.assignments.solutionEvidence}
          </h2>
          {/* Photos and recordings together — oral homework hands in audio. */}
          <EvidenceGallery
            attachments={solutionAttachments}
            zoom
            emptyLabel={ka.review.noSolutionEvidence}
          />
        </section>

        {assignment.self_rating || assignment.minutes_spent !== null ||
        assignment.difficulty_note ? (
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
              <div className="grid gap-0.5">
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
        ) : null}
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-4">
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
