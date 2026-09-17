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
  readOnly = false,
}: {
  lesson: DayLesson;
  ui: LessonUi;
  childId: string;
  /** Topic names of this lesson's subject, offered as autocomplete. */
  topicSuggestions: string[];
  readOnly?: boolean;
}) {
  const [topic, setTopic] = React.useState(lesson.topic ?? "");
  const [notes, setNotes] = React.useState(lesson.notes ?? "");
  const [noHomework, setNoHomework] = React.useState(lesson.noHomework);
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
          <div className="flex flex-wrap gap-2">
            <Button
              size={ui.controlSize}
              className={cn("flex-1", ui.actionClass)}
              disabled={!dirty || pending}
              onClick={save}
            >
              <Check />
              {ka.common.save}
            </Button>

            <Button
              size={ui.controlSize}
              variant={noHomework ? "default" : "outline"}
              className={cn("flex-1", ui.actionClass)}
              disabled={pending}
              onClick={toggleNoHomework}
              aria-pressed={noHomework}
            >
              <CircleSlash />
              {noHomework ? ka.lessons.noHomeworkOn : ka.lessons.noHomework}
            </Button>
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
