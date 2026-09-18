import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatDueLabel,
} from "@/features/assignments/dates";
import { getKidAssignmentDetail } from "@/features/assignments/queries";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { splitEvidence } from "@/features/attachments/audio";
import { AudioRecorder } from "@/features/attachments/audio-recorder";
import { EvidenceGallery } from "@/features/attachments/evidence-gallery";
import { PhotoGallery } from "@/features/attachments/photo-gallery";
import { PhotoUploader } from "@/features/attachments/photo-uploader";
import { MessageThread } from "@/features/messages/message-thread";
import { ka, t } from "@/lib/i18n/ka";

import { AutoStartAssignment } from "./auto-start";
import { SubmitPanel } from "./submit-panel";

export const metadata: Metadata = { title: ka.kid.assignmentsTitle };

/**
 * C3 — the child's assignment screen.
 *
 * When the work came back as `redo`, the parent's comment is the first thing
 * on the page, above the task itself. Nothing else competes with it.
 */
export default async function KidAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getKidAssignmentDetail(id);
  if (!detail) notFound();

  const {
    assignment,
    subject,
    topicName,
    taskAttachments,
    solutionAttachments,
    latestRedoComment,
    uiMode,
    childId,
  } = detail;

  const simple = uiMode === "simple";
  const locked =
    assignment.status === "submitted" || assignment.status === "approved";

  // The two uploaders keep separate budgets: six photos of a maths page and
  // three takes of a poem are different things to run out of.
  const { photos: solutionPhotos, recordings: solutionRecordings } =
    splitEvidence(solutionAttachments);

  return (
    <div className="grid gap-4 pb-8">
      {/* Renders nothing. Opening the page is what starts the work. */}
      <AutoStartAssignment
        assignmentId={assignment.id}
        status={assignment.status}
      />

      <Button asChild variant="ghost" size="sm" className="justify-self-start">
        <Link href="/kid/assignments">
          <ChevronLeft />
          {ka.common.back}
        </Link>
      </Button>

      {latestRedoComment ? (
        <section className="grid gap-2 rounded-xl border-2 border-destructive bg-destructive/10 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
            <AlertTriangle className="size-5" />
            {ka.kid.redoBannerTitle}
          </h2>
          <p className="text-base whitespace-pre-wrap">{latestRedoComment}</p>
          <p className="text-xs text-muted-foreground">
            {ka.kid.redoBannerHint}
          </p>
        </section>
      ) : null}

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {subject ? (
            <span
              className="inline-flex items-center gap-1.5 font-medium"
              style={{ color: subject.color }}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: subject.color }}
              />
              {subject.name}
            </span>
          ) : null}
          {topicName ? (
            <span className="text-muted-foreground">{topicName}</span>
          ) : null}
          <AssignmentStatusBadge status={assignment.status} />
        </div>

        <h1 className={simple ? "text-2xl font-bold" : "text-xl font-semibold"}>
          {assignment.title}
        </h1>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {assignment.source_ref ? <span>{assignment.source_ref}</span> : null}
          <span>{formatDueLabel(assignment.due_date)}</span>
          {assignment.redo_count > 0 ? (
            <span>
              {t("assignments.redoCount", { count: assignment.redo_count })}
            </span>
          ) : null}
        </div>

        {assignment.description ? (
          <p className="text-base whitespace-pre-wrap">
            {assignment.description}
          </p>
        ) : null}
      </header>

      <section className="grid gap-2 rounded-xl border bg-card p-3">
        <h2 className="font-medium">{ka.kid.taskFromParent}</h2>
        <PhotoGallery attachments={taskAttachments} zoom />
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-3">
        <h2 className="font-medium">{ka.kid.yourWork}</h2>
        {/* A scrapped first take of a recitation used to be stuck here the
            moment the page reloaded. `deletable` is only the affordance — the
            window (own evidence, not yet handed in) is decided by
            `deleteAttachmentAction` and by RLS, not by this prop. */}
        <EvidenceGallery
          attachments={solutionAttachments}
          zoom
          emptyLabel={ka.attachments.noEvidence}
          deletable={!locked}
        />

        {!locked ? (
          <>
            <PhotoUploader
              target={{
                kind: "assignment",
                assignmentId: assignment.id,
                childId,
                attachmentKind: "solution",
              }}
              existingCount={solutionPhotos.length}
              label={ka.attachments.addPhotos}
            />

            {/* Oral homework — a poem, a passage read aloud, pronunciation —
                has no page to photograph. Same section, not a separate screen:
                one piece of work, one place to hand it in. */}
            <div className="border-t pt-3">
              <AudioRecorder
                target={{
                  kind: "assignment",
                  assignmentId: assignment.id,
                  childId,
                  attachmentKind: "solution",
                }}
                existingCount={solutionRecordings.length}
                label={ka.kid.yourRecording}
              />
            </div>
          </>
        ) : null}
      </section>

      {assignment.status === "approved" ? (
        <section className="grid gap-1 rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-4 text-center">
          <CheckCircle2 className="justify-self-center size-7 text-emerald-600" />
          <p className="text-lg font-semibold">{ka.kid.approvedTitle}</p>
          <p className="text-sm text-muted-foreground">
            {ka.kid.approvedHint}
          </p>
          {assignment.review_comment ? (
            <p className="mt-1 text-sm whitespace-pre-wrap">
              {assignment.review_comment}
            </p>
          ) : null}
        </section>
      ) : null}

      {assignment.status === "submitted" ? (
        <section className="grid gap-1 rounded-xl border bg-card p-4 text-center">
          <Clock className="justify-self-center size-6 text-muted-foreground" />
          <p className="font-semibold">{ka.kid.submittedTitle}</p>
          <p className="text-sm text-muted-foreground">
            {ka.kid.submittedHint}
          </p>
          {assignment.submitted_at ? (
            <p className="text-xs text-muted-foreground">
              {t("assignments.submittedAt", {
                date: formatDateTime(assignment.submitted_at),
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      <SubmitPanel
        assignmentId={assignment.id}
        status={assignment.status}
        uiMode={uiMode}
        solutionCount={solutionAttachments.length}
        initialRating={assignment.self_rating}
        initialMinutes={assignment.minutes_spent}
        initialNote={assignment.difficulty_note}
      />

      <section id="chat" className="grid gap-2 rounded-xl border bg-card p-3">
        <h2 className="font-medium">{ka.messages.title}</h2>
        <MessageThread
          assignmentId={assignment.id}
          childId={childId}
          className="max-h-[26rem]"
        />
      </section>
    </div>
  );
}
