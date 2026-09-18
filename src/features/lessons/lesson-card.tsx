"use client";

import * as React from "react";
import { Check, CircleSlash } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ka, t } from "@/lib/i18n/ka";
import { PhotoGallery, PhotoUploader } from "@/features/attachments";
import { KidQuickAdd } from "@/features/assignments/kid-quick-add";

import { setLessonNoHomework, updateLesson } from "./actions";
import type { DayLesson } from "./queries";
import type { LessonUi } from "./ui-mode";

/**
 * C2 — one lesson on the child's day.
 *
 * Every visible difference between the simple and the full kid interface comes
 * from `ui` (see ./ui-mode.ts); there is no `mode === "simple"` test in here.
 */
export function LessonCard({
  lesson,
  ui,
  childId,
  topicSuggestions,
  defaultDueDate,
  readOnly = false,
}: {
  lesson: DayLesson;
  ui: LessonUi;
  childId: string;
  /** Topic names of this lesson's subject, offered as autocomplete. */
  topicSuggestions: string[];
  /** `yyyy-MM-dd` — the next school day, pre-filled into the quick-add form. */
  defaultDueDate: string;
  readOnly?: boolean;
}) {
  const [topic, setTopic] = React.useState(lesson.topic ?? "");
  const [notes, setNotes] = React.useState(lesson.notes ?? "");
  const [noHomework, setNoHomework] = React.useState(lesson.noHomework);
  const [addOpen, setAddOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // No prop->state sync effect here: `<DayLessons>` keys the card on the stored
  // values, so a card whose server data changed remounts with fresh state and
  // one the child is typing into is left alone.
  const dirty =
    topic !== (lesson.topic ?? "") || notes !== (lesson.notes ?? "");

  const listId = `topics-${lesson.id}`;

  function save() {
    startTransition(async () => {
      const result = await updateLesson({
        lessonId: lesson.id,
        topic,
        notes,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(ka.lessons.saved);
    });
  }

  function toggleNoHomework() {
    const next = !noHomework;
    setNoHomework(next); // optimistic: a one-tap button must feel instant
    startTransition(async () => {
      const result = await setLessonNoHomework({
        lessonId: lesson.id,
        value: next,
      });
      if (!result.ok) {
        setNoHomework(!next);
        toast.error(result.message);
        return;
      }
      toast.success(
        next ? ka.lessons.noHomeworkSaved : ka.lessons.noHomeworkCleared,
      );
    });
  }

  /**
   * Homework was just recorded for this lesson, so "we were given none" is now
   * false by construction. Clearing it silently is right: the child answered
   * the question a second time, with an action, and making them undo the old
   * answer first would be a tap spent on bookkeeping.
   */
  function clearNoHomework() {
    if (!noHomework) return;
    setNoHomework(false);
    startTransition(async () => {
      const result = await setLessonNoHomework({
        lessonId: lesson.id,
        value: false,
      });
      if (!result.ok) setNoHomework(true);
    });
  }

  return (
    <article
      className={cn("rounded-xl border-s-4 border bg-card", ui.cardPadding)}
      style={{ borderInlineStartColor: lesson.subjectColor }}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={ui.subjectTextClass}>
          {lesson.subjectName ?? ka.lessons.subjectUnknown}
        </h3>
        {lesson.startTime && lesson.endTime ? (
          <span className="text-sm text-muted-foreground">
            {t("lessons.timeRange", {
              from: lesson.startTime,
              to: lesson.endTime,
            })}
          </span>
        ) : null}
        {ui.showCounters && lesson.assignmentCount > 0 ? (
          <Badge variant="secondary" className="ms-auto">
            {t("assignments.count", { count: lesson.assignmentCount })}
          </Badge>
        ) : null}
      </header>

      <div className="mt-3 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`topic-${lesson.id}`}>
            {ka.lessons.whatWeCovered}
          </Label>
          <Input
            id={`topic-${lesson.id}`}
            value={topic}
            list={ui.showTopicSuggestions ? listId : undefined}
            placeholder={ka.lessons.topicPlaceholder}
            disabled={readOnly}
            className={ui.inputClass}
            onChange={(event) => setTopic(event.target.value)}
          />
          {ui.showTopicSuggestions && topicSuggestions.length > 0 ? (
            <datalist id={listId}>
              {topicSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}
        </div>

        {ui.showNotes ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`notes-${lesson.id}`}>{ka.lessons.notes}</Label>
            <Textarea
              id={`notes-${lesson.id}`}
              value={notes}
              rows={2}
              placeholder={ka.lessons.notesPlaceholder}
              disabled={readOnly}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        ) : null}

        {readOnly ? null : (
          <Button
            size={ui.controlSize}
            variant="secondary"
            className={cn("w-full", ui.actionClass)}
            disabled={!dirty || pending}
            onClick={save}
          >
            <Check />
            {ka.common.save}
          </Button>
        )}

        {/*
          „დავალება დამატება" and „დავალება არ მოგვცეს" are opposite answers to
          one question, so they are never two similar buttons side by side:
          the question is asked in words above them, the answer that produces
          work is a full-width primary with a camera, the answer that produces
          nothing is a small muted text button — and once "none" is recorded
          the pair collapses into a single confirmed state with an undo.
        */}
        {readOnly ? null : (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              {ka.lessons.homeworkQuestion}
            </p>

            {noHomework ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <CircleSlash className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {ka.lessons.noHomeworkOn}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto"
                  disabled={pending}
                  onClick={toggleNoHomework}
                >
                  {ka.lessons.noHomeworkUndo}
                </Button>
              </div>
            ) : (
              <>
                <KidQuickAdd
                  childId={childId}
                  lesson={{
                    id: lesson.id,
                    subjectId: lesson.subjectId,
                    subjectName: lesson.subjectName,
                  }}
                  defaultDueDate={defaultDueDate}
                  uiMode={ui.mode}
                  size={ui.controlSize}
                  className="w-full"
                  onCreated={clearNoHomework}
                  onOpenChange={setAddOpen}
                />

                {addOpen ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-self-center text-muted-foreground"
                    disabled={pending}
                    onClick={toggleNoHomework}
                    aria-pressed={noHomework}
                  >
                    <CircleSlash />
                    {ka.lessons.noHomework}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {lesson.photos.length > 0 ? (
          <PhotoGallery attachments={lesson.photos} />
        ) : null}

        {readOnly ? null : (
          <PhotoUploader
            target={{ kind: "lesson", lessonId: lesson.id, childId }}
            label={ka.lessons.photoLabel}
            existingCount={lesson.photos.length}
          />
        )}
      </div>
    </article>
  );
}
