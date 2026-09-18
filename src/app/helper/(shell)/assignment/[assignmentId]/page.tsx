import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AssignmentStatusBadge } from "@/features/assignments/status-badge";
import { formatLongDate } from "@/features/assignments/dates";
import { PhotoGallery } from "@/features/attachments/photo-gallery";
import { getHelperAssignment } from "@/features/helpers/queries";
import {
  HelperComposer,
  HelperReviewActions,
} from "@/features/helpers/review-panel";
import { HelperThread } from "@/features/helpers/thread";
import { requireHelper } from "@/lib/auth/helper";
import { ka, t } from "@/lib/i18n/ka";

export const metadata: Metadata = { title: ka.review.title };

/**
 * One assignment, as a helper sees it.
 *
 * Not `/parent/review/[assignmentId]`: that screen is built on
 * `getReviewBundle()` and A4's review actions, both of which resolve ownership
 * through `public.children` — a table migration 0010 keeps closed to helpers.
 * It also offers "edit assignment" and a photo uploader, neither of which a
 * helper may use.
 */
export default async function HelperAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const helper = await requireHelper();
  const { assignmentId } = await params;

  const assignment = await getHelperAssignment(assignmentId);
  // `null` is "not yours" and "does not exist" alike. Both are a 404 here; a
  // helper must not be able to probe for ids outside their grant.
  if (!assignment) notFound();

  return (
    <div className="grid gap-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/helper" className="hover:underline">
          {ka.helpers.backToChildren}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span>{assignment.childName}</span>
      </nav>

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment.title}
          </h1>
          <AssignmentStatusBadge status={assignment.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            assignment.subjectName,
            assignment.sourceRef,
            t("assignments.due", { date: formatLongDate(assignment.dueDate) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {assignment.description ? (
          <p className="whitespace-pre-wrap text-sm">{assignment.description}</p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ka.assignments.taskPhotos}</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoGallery
              attachments={assignment.taskPhotos}
              emptyLabel={ka.review.noTaskPhotos}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ka.assignments.solutionPhotos}</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoGallery
              attachments={assignment.solutionPhotos}
              emptyLabel={ka.review.noSolutionPhotos}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ka.review.childFeedback}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            {ka.assignments.selfRating}:{" "}
            {assignment.selfRating
              ? `${assignment.selfRating}/5`
              : ka.review.noSelfRating}
          </p>
          <p>
            {ka.assignments.minutesSpent}:{" "}
            {assignment.minutesSpent
              ? `${assignment.minutesSpent} ${ka.assignments.minutesUnit}`
              : ka.review.noMinutes}
          </p>
          <p>
            {ka.assignments.difficultyNote}:{" "}
            {assignment.difficultyNote || ka.review.noDifficultyNote}
          </p>
          {assignment.redoCount > 0 ? (
            <p className="text-muted-foreground">
              {t("assignments.redoCount", { count: assignment.redoCount })}
            </p>
          ) : null}
          {assignment.reviewComment ? (
            <p className="text-muted-foreground">
              {ka.review.previousComments}: {assignment.reviewComment}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.review.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <HelperReviewActions
            assignmentId={assignment.id}
            canReview={helper.scope.canReview}
            isSubmitted={assignment.status === "submitted"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ka.messages.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <HelperThread assignmentId={assignment.id} />
          <Separator />
          <HelperComposer
            assignmentId={assignment.id}
            canComment={helper.scope.canComment}
          />
        </CardContent>
      </Card>

      <div>
        <Button asChild variant="ghost">
          <Link href="/helper">{ka.common.back}</Link>
        </Button>
      </div>
    </div>
  );
}
