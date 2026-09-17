"use client";

/**
 * Create / edit form for an assignment.
 *
 * The selects are controlled so subject -> topic and child -> subject/lesson
 * stay consistent; the values reach the Server Action through hidden inputs,
 * which keeps "no selection" as an empty string rather than a sentinel value
 * the action would have to know about.
 */

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createAssignmentAction,
  updateAssignmentAction,
  type AssignmentFormState,
} from "@/features/assignments/actions";
import type { AssignmentEditorData } from "@/features/assignments/queries";
import { formatShortDate } from "@/features/assignments/dates";
import { ka } from "@/lib/i18n/ka";

const NONE = "__none__";

function fromSentinel(value: string): string {
  return value === NONE ? "" : value;
}

export function AssignmentForm({
  data,
  defaultChildId,
}: {
  data: AssignmentEditorData;
  defaultChildId?: string | null;
}) {
  const { assignment, children, subjects, topics, lessons } = data;
  const editing = Boolean(assignment);

  const [state, formAction, pending] = useActionState<
    AssignmentFormState,
    FormData
  >(editing ? updateAssignmentAction : createAssignmentAction, null);

  const [childId, setChildId] = React.useState(
    assignment?.child_id ?? defaultChildId ?? children[0]?.id ?? "",
  );
  const [subjectId, setSubjectId] = React.useState(
    assignment?.subject_id ?? NONE,
  );
  const [topicId, setTopicId] = React.useState(assignment?.topic_id ?? NONE);
  const [lessonId, setLessonId] = React.useState(assignment?.lesson_id ?? NONE);
  const [priority, setPriority] = React.useState(
    String(assignment?.priority ?? 2),
  );

  const childSubjects = subjects.filter(
    (subject) => subject.childId === childId,
  );
  const subjectTopics = topics.filter(
    (topic) => subjectId !== NONE && topic.subjectId === subjectId,
  );
  const childLessons = lessons.filter((lesson) => lesson.childId === childId);

  // Dropping a child changes which subjects/lessons are legal; the server
  // re-checks anyway, but the form should not offer an impossible pair.
  const onChildChange = (value: string) => {
    setChildId(value);
    setSubjectId(NONE);
    setTopicId(NONE);
    setLessonId(NONE);
  };

  const onSubjectChange = (value: string) => {
    setSubjectId(value);
    setTopicId(NONE);
  };

  return (
    <form action={formAction} className="grid max-w-2xl gap-4" noValidate>
      {assignment ? (
        <input type="hidden" name="assignmentId" value={assignment.id} />
      ) : null}
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="subjectId" value={fromSentinel(subjectId)} />
      <input type="hidden" name="topicId" value={fromSentinel(topicId)} />
      <input type="hidden" name="lessonId" value={fromSentinel(lessonId)} />
      <input type="hidden" name="priority" value={priority} />

      {state?.message ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="assignment-child">{ka.assignments.fieldChild}</Label>
        <Select
          value={childId}
          onValueChange={onChildChange}
          disabled={editing}
        >
          <SelectTrigger id="assignment-child">
            <SelectValue placeholder={ka.parent.selectChild} />
          </SelectTrigger>
          <SelectContent>
            {children.map((child) => (
              <SelectItem key={child.id} value={child.id}>
                {child.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assignment-title">{ka.assignments.fieldTitle}</Label>
        <Input
          id="assignment-title"
          name="title"
          required
          maxLength={200}
          defaultValue={assignment?.title ?? ""}
          placeholder={ka.assignments.fieldTitlePlaceholder}
          aria-invalid={state?.fields?.title ? true : undefined}
        />
        {state?.fields?.title ? (
          <p className="text-xs font-medium text-destructive">
            {state.fields.title}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assignment-source">
          {ka.assignments.fieldSourceRef}
        </Label>
        <Input
          id="assignment-source"
          name="sourceRef"
          maxLength={300}
          defaultValue={assignment?.source_ref ?? ""}
          placeholder={ka.assignments.fieldSourceRefPlaceholder}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="assignment-description">
          {ka.assignments.fieldDescription}
        </Label>
        <Textarea
          id="assignment-description"
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={assignment?.description ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="assignment-subject">
            {ka.assignments.fieldSubject}
          </Label>
          <Select value={subjectId} onValueChange={onSubjectChange}>
            <SelectTrigger id="assignment-subject">
              <SelectValue placeholder={ka.assignments.noSubject} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{ka.assignments.noSubject}</SelectItem>
              {childSubjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assignment-topic">{ka.assignments.fieldTopic}</Label>
          <Select
            value={topicId}
            onValueChange={setTopicId}
            disabled={subjectTopics.length === 0}
          >
            <SelectTrigger id="assignment-topic">
              <SelectValue placeholder={ka.assignments.noTopic} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{ka.assignments.noTopic}</SelectItem>
              {subjectTopics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assignment-due-date">
            {ka.assignments.fieldDueDate}
          </Label>
          <Input
            id="assignment-due-date"
            name="dueDate"
            type="date"
            defaultValue={assignment?.due_date ?? ""}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assignment-due-time">
            {ka.assignments.fieldDueTime}
          </Label>
          <Input
            id="assignment-due-time"
            name="dueTime"
            type="time"
            defaultValue={assignment?.due_time?.slice(0, 5) ?? ""}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assignment-priority">
            {ka.assignments.fieldPriority}
          </Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="assignment-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{ka.assignments.priority1}</SelectItem>
              <SelectItem value="2">{ka.assignments.priority2}</SelectItem>
              <SelectItem value="3">{ka.assignments.priority3}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="assignment-lesson">
            {ka.assignments.fieldLesson}
          </Label>
          <Select
            value={lessonId}
            onValueChange={setLessonId}
            disabled={childLessons.length === 0}
          >
            <SelectTrigger id="assignment-lesson">
              <SelectValue placeholder={ka.assignments.noLesson} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{ka.assignments.noLesson}</SelectItem>
              {childLessons.map((lesson) => (
                <SelectItem key={lesson.id} value={lesson.id}>
                  {formatShortDate(lesson.date)}
                  {lesson.topic ? ` — ${lesson.topic}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={pending || !childId}
        className="justify-self-start"
      >
        {pending
          ? editing
            ? ka.assignments.saving
            : ka.assignments.creating
          : editing
            ? ka.assignments.saveChanges
            : ka.assignments.create}
      </Button>
    </form>
  );
}
