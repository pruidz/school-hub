import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Headphones, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime, formatDueLabel } from "@/features/assignments/dates";
import { getReviewBundle } from "@/features/assignments/queries";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { getSignedUrls } from "@/features/attachments/signed-urls";
import { PhotoGallery } from "@/features/attachments/photo-gallery";
import { MessageThread } from "@/features/messages/message-thread";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { AttemptTimeline, hasRecordings } from "./attempt-timeline";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: ka.review.title };

/**
 * P3 — the review screen, v2 (SPEC 4b).
 *
 * One vertical chronology instead of the old left/right split. The task sits at
 * the top as a strip of thumbnails, then one block per attempt, then the
 * verdict. The thread is beside it on a desktop and under it on a phone, so a
 * whole piece of homework — what was set, every round of it, what was said
 * about each round, and the conversation — is one page.
 *
 * Every signed URL for every photo and recording on the page is minted here, in
 * ONE call, and handed down. The galleries therefore fetch nothing: a
 * three-attempt assignment costs the same number of round trips as an empty
 * one.
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
    attempts,
    queueNextId,
    queueRemaining,
    author,
  } = bundle;

  const urls = await getSignedUrls([
    ...taskAttachments.map((file) => file.storage_path),
    ...attempts.flatMap((attempt) =>
      attempt.attachments.map((file) => file.storage_path),
    ),
  ]);

  const listen = hasRecordings(attempts);

  // Only pin the verdict to the bottom of a phone screen when there is a
  // verdict to give. On work that is still being done, ReviewActions is a note
  // saying so, and a permanent tray holding a note would cost a fifth of the
  // screen for nothing.
  const actionable =
    assignment.status === "submitted" || assignment.status === "approved";

  return (
    <div
      className={cn(
        "grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:pb-0",
        actionable && "pb-52",
      )}
    >
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
            {assignment.source_ref ? <span>{assignment.source_ref}</span> : null}
            {/* Quiet, in the same meta line as the dates — knowing the child
                wrote this down at school changes how the parent reads the
                title, but it is not a status. */}
            {author ? (
              <span>
                {author === "child"
                  ? ka.assignments.createdByChild
                  : ka.assignments.createdByParent}
              </span>
            ) : null}
            <span>{formatDueLabel(assignment.due_date)}</span>
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

        {/* Says "this one has to be listened to" before the parent has scrolled
            anywhere, so a recitation is never ticked off unheard. */}
        {listen ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
            <Headphones className="size-3.5 shrink-0" />
            {ka.review.listenHint}
          </p>
        ) : null}

        {/* The task itself: small tiles, because it is context, not the thing
            being judged. Tapping one opens the same full-screen zoom. */}
        <section className="grid gap-2 rounded-xl border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {ka.review.taskTitle}
            </h2>
            {taskAttachments.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {ka.review.taskHint}
              </span>
            ) : null}
          </div>
          <PhotoGallery
            attachments={taskAttachments}
            zoom
            initialUrls={urls}
            gridClassName="grid-cols-4 sm:grid-cols-6 lg:grid-cols-8"
            emptyLabel={ka.review.noTaskPhotos}
          />
        </section>

        <AttemptTimeline attempts={attempts} urls={urls} />
      </div>

      {/* `contents` on a phone so the two halves of this column can be placed
          independently: the verdict is pinned to the bottom of the screen and
          the thread simply follows the timeline. On a desktop the aside becomes
          a real sticky column again and both sit inside it. */}
      <aside className="contents xl:sticky xl:top-4 xl:grid xl:gap-4">
        {/* SPEC 4b: ✓ / ↻ reachable without hunting. A parent reviewing from
            bed should never have to scroll past three attempts to act, so on a
            phone this is a tray at the bottom of the viewport rather than a
            card at the bottom of the page. One mount, so the keyboard
            shortcuts are still bound exactly once. */}
        <div
          className={cn(
            actionable &&
              "fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur xl:static xl:max-h-none xl:overflow-visible xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none",
          )}
        >
          <ReviewActions
            assignmentId={assignment.id}
            status={assignment.status}
            queueNextId={queueNextId}
            queueRemaining={queueRemaining}
            className={
              actionable
                ? "border-0 bg-transparent p-0 xl:border xl:bg-card xl:p-3"
                : undefined
            }
          />
        </div>

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
