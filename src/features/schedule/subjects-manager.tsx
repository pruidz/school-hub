"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ActionFailure } from "@/lib/auth/result";
import { ka, t } from "@/lib/i18n/ka";
import {
  ColorDot,
  ColorField,
  DEFAULT_SUBJECT_COLOR,
  FormError,
  SubmitButton,
  TextField,
} from "@/features/children/form-ui";

import type { SubjectUsage } from "./queries";
import type { SubjectView, TopicView } from "./queries";
import {
  createSubject,
  createTopic,
  deleteSubject,
  deleteTopic,
  describeSubjectUsage,
  moveSubject,
  updateSubject,
  updateTopic,
} from "./subject-actions";

/**
 * P6 — subjects and their topics for one child.
 *
 * Topics are a tree in the schema; the UI deliberately exposes exactly one
 * level of nesting (a topic and its sub-topics) because anything deeper is
 * unusable on a phone and the server action refuses it anyway.
 */
export function SubjectsManager({
  childId,
  subjects,
  topics,
}: {
  childId: string;
  subjects: SubjectView[];
  topics: TopicView[];
}) {
  if (subjects.length === 0) {
    return (
      <Card>
        <CardHeader className="gap-2">
          <p className="font-medium">{ka.subjects.empty}</p>
          <p className="text-sm text-muted-foreground">
            {ka.subjects.emptyHint}
          </p>
        </CardHeader>
        <CardContent>
          <SubjectFormDialog childId={childId} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {subjects.map((subject, index) => (
        <SubjectRow
          key={subject.id}
          childId={childId}
          subject={subject}
          topics={topics.filter((topic) => topic.subjectId === subject.id)}
          isFirst={index === 0}
          isLast={index === subjects.length - 1}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  one subject                                                               */
/* -------------------------------------------------------------------------- */

function SubjectRow({
  childId,
  subject,
  topics,
  isFirst,
  isLast,
}: {
  childId: string;
  subject: SubjectView;
  topics: TopicView[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [expanded, setExpanded] = React.useState(false);

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveSubject({ subjectId: subject.id, direction });
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <ColorDot color={subject.color} className="size-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{subject.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {subject.teacherName ?? ka.subjects.teacherNone}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={pending || isFirst}
            onClick={() => move("up")}
            aria-label={ka.subjects.moveUp}
            title={ka.subjects.moveUp}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={pending || isLast}
            onClick={() => move("down")}
            aria-label={ka.subjects.moveDown}
            title={ka.subjects.moveDown}
          >
            <ChevronDown />
          </Button>

          <SubjectFormDialog
            childId={childId}
            subject={subject}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={ka.subjects.edit}
                title={ka.subjects.edit}
              >
                <Pencil />
              </Button>
            }
          />

          <DeleteSubjectButton subject={subject} />

          <Button variant="outline" onClick={() => setExpanded((v) => !v)}>
            {ka.subjects.topicsTitle} · {topics.length}
          </Button>
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="grid gap-3">
          <Separator />
          <TopicList subject={subject} topics={topics} />
        </CardContent>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  create / edit subject                                                     */
/* -------------------------------------------------------------------------- */

export function SubjectFormDialog({
  childId,
  subject,
  trigger,
}: {
  childId: string;
  subject?: SubjectView;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction] = useActionState<ActionFailure | null, FormData>(
    async (_previous, formData) => {
      const payload = {
        name: String(formData.get("name") ?? ""),
        color: String(formData.get("color") ?? DEFAULT_SUBJECT_COLOR),
        teacherName: String(formData.get("teacherName") ?? ""),
      };

      const result = subject
        ? await updateSubject({ ...payload, subjectId: subject.id })
        : await createSubject({ ...payload, childId });

      if (!result.ok) return result;

      toast.success(subject ? ka.subjects.updated : ka.subjects.created);
      setOpen(false);
      return null;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            {ka.subjects.add}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {subject ? ka.subjects.edit : ka.subjects.add}
          </DialogTitle>
          <DialogDescription>{ka.subjects.subtitle}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4" noValidate>
          <FormError message={state?.message} />

          <TextField
            name="name"
            label={ka.subjects.name}
            defaultValue={subject?.name ?? ""}
            autoComplete="off"
            required
          />
          <TextField
            name="teacherName"
            label={ka.subjects.teacher}
            defaultValue={subject?.teacherName ?? ""}
            autoComplete="off"
            hint={ka.common.optional}
          />
          <ColorField
            name="color"
            label={ka.subjects.color}
            defaultValue={subject?.color ?? DEFAULT_SUBJECT_COLOR}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {ka.common.cancel}
            </Button>
            <SubmitButton>
              {subject ? ka.common.save : ka.common.create}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  delete subject                                                            */
/* -------------------------------------------------------------------------- */

function DeleteSubjectButton({ subject }: { subject: SubjectView }) {
  const [open, setOpen] = React.useState(false);
  const [usage, setUsage] = React.useState<SubjectUsage | null>(null);
  const [pending, startTransition] = React.useTransition();

  // The warning has to be honest about what disappears, so the counts are
  // fetched when the dialog is opened rather than guessed in the copy.
  function openDialog() {
    setUsage(null);
    setOpen(true);
    startTransition(async () => {
      const result = await describeSubjectUsage(subject.id);
      if (result.ok) setUsage(result.data);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSubject(subject.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(ka.subjects.deleted);
      setOpen(false);
    });
  }

  const hasUsage =
    usage !== null &&
    usage.lessons + usage.assignments + usage.slots > 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive"
        onClick={openDialog}
        aria-label={ka.common.delete}
        title={ka.common.delete}
      >
        <Trash2 />
      </Button>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("subjects.deleteConfirmTitle", { name: subject.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {ka.subjects.deleteConfirmBody}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="text-sm text-destructive">
          {usage === null
            ? ka.subjects.usageChecking
            : hasUsage
              ? t("subjects.deleteUsageWarning", {
                  lessons: usage.lessons,
                  assignments: usage.assignments,
                  slots: usage.slots,
                })
              : ""}
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={remove} disabled={pending}>
            {ka.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  topics                                                                    */
/* -------------------------------------------------------------------------- */

function TopicList({
  subject,
  topics,
}: {
  subject: SubjectView;
  topics: TopicView[];
}) {
  const roots = topics.filter((topic) => topic.parentTopicId === null);
  const childrenOf = (id: string) =>
    topics.filter((topic) => topic.parentTopicId === id);

  return (
    <div className="grid gap-2">
      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {ka.subjects.topicsEmpty}
        </p>
      ) : (
        <ul className="grid gap-1">
          {roots.map((topic) => (
            <li key={topic.id}>
              <TopicRow topic={topic} />
              {childrenOf(topic.id).length > 0 ? (
                <ul className="ms-6 grid gap-1 border-s ps-3">
                  {childrenOf(topic.id).map((child) => (
                    <li key={child.id}>
                      <TopicRow topic={child} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <TopicFormDialog subject={subject} parents={roots} />
    </div>
  );
}

function TopicRow({ topic }: { topic: TopicView }) {
  const [pending, startTransition] = React.useTransition();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(topic.name);
  const [confirm, setConfirm] = React.useState(false);

  function save() {
    startTransition(async () => {
      const result = await updateTopic({ topicId: topic.id, name });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(ka.subjects.topicUpdated);
      setEditing(false);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTopic(topic.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(ka.subjects.topicDeleted);
      setConfirm(false);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <>
          <Input
            aria-label={ka.subjects.topicName}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8"
          />
          <Button size="sm" onClick={save} disabled={pending}>
            {ka.common.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {ka.common.cancel}
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-sm">{topic.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label={ka.common.edit}
          >
            <Pencil />
          </Button>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              onClick={() => setConfirm(true)}
              aria-label={ka.common.delete}
            >
              <Trash2 />
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("subjects.topicDeleteConfirmTitle", { name: topic.name })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {ka.subjects.topicDeleteConfirmBody}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={remove} disabled={pending}>
                  {ka.common.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

function TopicFormDialog({
  subject,
  parents,
}: {
  subject: SubjectView;
  parents: TopicView[];
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [parentId, setParentId] = React.useState<string>("none");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTopic({
        subjectId: subject.id,
        name,
        parentTopicId: parentId === "none" ? null : parentId,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(ka.subjects.topicCreated);
      setName("");
      setParentId("none");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="justify-self-start">
          <Plus />
          {ka.subjects.topicAdd}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{ka.subjects.topicAdd}</DialogTitle>
          <DialogDescription>{subject.name}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <FormError message={error} />

          <TextField
            name="name"
            label={ka.subjects.topicName}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />

          {parents.length > 0 ? (
            <div className="grid gap-1.5">
              <Label>{ka.subjects.topicParent}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {ka.subjects.topicParentNone}
                  </SelectItem>
                  {parents.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {ka.common.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || name.trim().length < 2}>
            {pending ? ka.common.saving : ka.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
