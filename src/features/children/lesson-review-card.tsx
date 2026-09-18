import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CircleSlash,
  ImageOff,
  PencilOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { PhotoGallery } from "@/features/attachments";
import type { DayLesson } from "@/features/lessons/queries";

/**
 * One lesson on the parent's "დღეს" tab — read-only.
 *
 * This is deliberately *not* `<LessonCard readOnly>`: that component is the
 * child's editor with its inputs disabled, and a row of greyed-out form fields
 * answers none of the questions a supervising parent has. What the parent needs
 * is the state of the record, in three kinds:
 *
 *   recorded    — "რა გავიარეთ" is filled in, or there is a book photo
 *   no_homework — the child pressed "დავალება არ მოგვცეს" and nothing else
 *   blank       — nothing at all
 *
 * `blank` is the one the screen exists for, so it is rendered as a positive
 * statement (amber, dashed, icon, one line of explanation) instead of an empty
 * card the eye slides over.
 */

export type LessonRecordState = "recorded" | "no_homework" | "blank";

export function lessonRecordState(lesson: DayLesson): LessonRecordState {
  const hasTopic = (lesson.topic ?? "").trim().length > 0;
  const hasNotes = (lesson.notes ?? "").trim().length > 0;
  if (hasTopic || hasNotes || lesson.photos.length > 0) return "recorded";
  if (lesson.noHomework) return "no_homework";
  return "blank";
}

/** True when the child has told us something about this lesson. */
export function isLessonFilled(state: LessonRecordState): boolean {
  return state !== "blank";
}

const BLANK_CARD =
  "border-dashed border-2 border-amber-500/70 bg-amber-50/70 dark:border-amber-500/50 dark:bg-amber-950/25";
const BLANK_TEXT = "text-amber-700 dark:text-amber-400";

export function LessonReviewCard({
  lesson,
  state,
}: {
  lesson: DayLesson;
  state: LessonRecordState;
}) {
  const blank = state === "blank";

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4",
        blank ? BLANK_CARD : "border-s-4",
      )}
      style={blank ? undefined : { borderInlineStartColor: lesson.subjectColor }}
    >
      <LessonHeader
        subjectName={lesson.subjectName}
        subjectColor={lesson.subjectColor}
        startTime={lesson.startTime}
        endTime={lesson.endTime}
        showDot={blank}
        badge={<StateBadge state={state} noHomework={lesson.noHomework} />}
      />

      {blank ? (
        <p className={cn("mt-3 flex items-start gap-2 text-sm font-medium", BLANK_TEXT)}>
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {ka.children.lessonBlank}
            <span className="block text-xs font-normal opacity-80">
              {ka.children.lessonBlankHint}
            </span>
          </span>
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {lesson.topic?.trim() ? (
            <p className="text-sm leading-relaxed">{lesson.topic}</p>
          ) : null}

          {lesson.notes?.trim() ? (
            <div className="rounded-lg bg-muted/60 p-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                {ka.children.lessonNotes}
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-line">{lesson.notes}</p>
            </div>
          ) : null}

          {lesson.photos.length > 0 ? (
            <PhotoGallery
              attachments={lesson.photos}
              gridClassName="grid-cols-3 sm:grid-cols-4"
            />
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff aria-hidden className="size-3.5" />
              {ka.children.lessonNoPhoto}
            </p>
          )}
        </div>
      )}

      {lesson.assignmentCount > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("children.lessonAssignmentCount", {
            count: lesson.assignmentCount,
          })}
        </p>
      ) : null}
    </article>
  );
}

/**
 * A timetable slot with no `lessons` row behind it at all — the child never got
 * as far as opening the day. Visually the same alarm as `blank`, with its own
 * wording so the parent can tell "left empty" from "never started".
 */
export function MissingLessonCard({
  subjectName,
  subjectColor,
  startTime,
  endTime,
}: {
  subjectName: string;
  subjectColor: string;
  startTime: string | null;
  endTime: string | null;
}) {
  return (
    <article className={cn("rounded-xl border bg-card p-4", BLANK_CARD)}>
      <LessonHeader
        subjectName={subjectName || null}
        subjectColor={subjectColor}
        startTime={startTime}
        endTime={endTime}
        showDot
        badge={
          <Badge
            variant="outline"
            className={cn("ms-auto gap-1 border-amber-500/60", BLANK_TEXT)}
          >
            <PencilOff aria-hidden className="size-3" />
            {ka.children.lessonNotOpened}
          </Badge>
        }
      />
      <p className={cn("mt-3 flex items-start gap-2 text-sm font-medium", BLANK_TEXT)}>
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{ka.children.lessonNotOpenedHint}</span>
      </p>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function LessonHeader({
  subjectName,
  subjectColor,
  startTime,
  endTime,
  showDot,
  badge,
}: {
  subjectName: string | null;
  subjectColor: string;
  startTime: string | null;
  endTime: string | null;
  /** The dashed cards drop the coloured edge, so the subject keeps a dot. */
  showDot: boolean;
  badge: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {showDot ? (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: subjectColor }}
        />
      ) : null}
      <h3 className="font-medium">
        {subjectName ?? ka.lessons.subjectUnknown}
      </h3>
      {startTime && endTime ? (
        <span className="text-sm text-muted-foreground">
          {t("lessons.timeRange", { from: startTime, to: endTime })}
        </span>
      ) : null}
      {badge}
    </header>
  );
}

function StateBadge({
  state,
  noHomework,
}: {
  state: LessonRecordState;
  noHomework: boolean;
}) {
  if (state === "blank") {
    return (
      <Badge
        variant="outline"
        className={cn("ms-auto gap-1 border-amber-500/60", BLANK_TEXT)}
      >
        <AlertTriangle aria-hidden className="size-3" />
        {ka.children.lessonBlank}
      </Badge>
    );
  }

  if (state === "no_homework") {
    return (
      <Badge variant="secondary" className="ms-auto gap-1">
        <CircleSlash aria-hidden className="size-3" />
        {ka.children.lessonNoHomework}
      </Badge>
    );
  }

  return (
    <span className="ms-auto flex flex-wrap items-center gap-1.5">
      {noHomework ? (
        <Badge variant="secondary" className="gap-1">
          <CircleSlash aria-hidden className="size-3" />
          {ka.children.lessonNoHomework}
        </Badge>
      ) : null}
      <Badge variant="outline" className="gap-1 border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
        <Check aria-hidden className="size-3" />
        {ka.children.lessonRecorded}
      </Badge>
    </span>
  );
}
