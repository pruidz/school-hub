"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

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
import type { ChildUiMode } from "@/lib/db.types";
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";
import { PhotoUploader } from "@/features/attachments";

import { createAssignmentAsChildAction } from "./actions";

/**
 * C2 — "დავალება დამატება": the child records the homework they were given and
 * photographs the book page (SPEC 3.1).
 *
 * The tap budget is the design constraint (SPEC section 6, point ი — longer
 * than about 30 seconds and the screen has failed):
 *
 *   tap 1  „დავალება დამატება"   the panel opens, already filled in from the
 *                                lesson: subject, lesson, and a due date on the
 *                                next school day
 *   tap 2  „კამერა"              the OS camera opens IMMEDIATELY — the click on
 *                                the hidden file input is synchronous inside
 *                                the gesture, nothing is awaited first
 *   shutter                      the assignment row is created while the child
 *                                is still in the camera app, and the photo is
 *                                handed to `PhotoUploader` through
 *                                `initialFiles`
 *
 * So: two taps in the app, then the camera. Typing is never on the path — the
 * title, the source reference and the due date all have usable defaults, and
 * the title the child leaves blank is derived server-side from the subject and
 * the date.
 *
 * Why the row is created at shutter and not at tap 1: a child who opens the
 * panel and changes their mind must not leave an empty assignment behind, and
 * a child has no DELETE on `assignments` (0004) to clean one up. Why not later
 * than shutter: the storage path is `{child_id}/{assignment_id}/{uuid}.webp`,
 * so the row has to exist before the upload starts.
 *
 * Why the descriptive fields are collected BEFORE the insert rather than
 * edited after it: the 0007 column lock makes `title`, `source_ref` and
 * `due_date` immutable for a child once the row exists. Create-time is the only
 * time they are theirs to set.
 */

const NONE = "__none__";

export type KidQuickAddProps = {
  childId: string;
  /** Present on a lesson card; absent on the general "+" list button. */
  lesson?: { id: string; subjectId: string | null; subjectName: string | null };
  /** Subject picker, used only when there is no lesson to infer it from. */
  subjects?: { id: string; name: string }[];
  /** `yyyy-MM-dd` — the next school day, computed server-side. */
  defaultDueDate: string;
  uiMode: ChildUiMode;
  /** `lg` matches the oversized lesson-card controls in `simple` mode. */
  size?: "default" | "lg";
  className?: string;
  /** Fired once the row exists — the lesson card uses it to clear "no homework". */
  onCreated?: (assignmentId: string) => void;
  /**
   * The panel replaces the trigger in place, so the host needs to know when it
   * is showing — the lesson card hides „დავალება არ მოგვცეს" while it is, so
   * the two opposite answers are never offered at the same time.
   */
  onOpenChange?: (open: boolean) => void;
};

export function KidQuickAdd({
  childId,
  lesson,
  subjects = [],
  defaultDueDate,
  uiMode,
  size = "default",
  className,
  onCreated,
  onOpenChange,
}: KidQuickAddProps) {
  const router = useRouter();

  // `simple` is a seven-year-old: the camera and the due date, nothing else.
  const detailed = uiMode !== "simple";

  const [open, setOpenState] = React.useState(false);
  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const [title, setTitle] = React.useState("");
  const [sourceRef, setSourceRef] = React.useState("");
  const [dueDate, setDueDate] = React.useState(defaultDueDate);
  const [subjectId, setSubjectId] = React.useState<string>(
    lesson?.subjectId ?? NONE,
  );

  const [assignmentId, setAssignmentId] = React.useState<string | null>(null);
  const [handover, setHandover] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  const fieldId = React.useId();

  const create = React.useCallback(
    async (files: File[]) => {
      if (busy) return;
      setBusy(true);
      setError(null);

      const result = await createAssignmentAsChildAction({
        title: title.trim() || null,
        description: null,
        sourceRef: sourceRef.trim() || null,
        dueDate: dueDate || null,
        subjectId: lesson ? null : subjectId === NONE ? null : subjectId,
        lessonId: lesson?.id ?? null,
      });

      setBusy(false);

      if (!result.ok) {
        // The photo is kept in state so „ისევ ცადე" does not cost a re-shoot.
        setHandover(files);
        setError(result.message);
        return;
      }

      setHandover(files);
      setAssignmentId(result.data.id);
      onCreated?.(result.data.id);
      toast.success(ka.assignments.kidCreated);
      if (files.length === 0) router.refresh();
    },
    [busy, dueDate, lesson, onCreated, router, sourceRef, subjectId, title],
  );

  function picked(list: FileList | null) {
    const files = list && list.length > 0 ? Array.from(list) : [];
    if (files.length === 0) return;
    void create(files);
  }

  function close() {
    setOpen(false);
    setAssignmentId(null);
    setHandover([]);
    setError(null);
    setTitle("");
    setSourceRef("");
    setDueDate(defaultDueDate);
    setSubjectId(lesson?.subjectId ?? NONE);
    router.refresh();
  }

  /* ---------------------------------------------------------- collapsed -- */

  if (!open) {
    return (
      <Button
        type="button"
        size={size}
        className={cn(size === "lg" && "h-14 text-base", className)}
        onClick={() => setOpen(true)}
      >
        <Camera />
        {ka.assignments.kidAdd}
      </Button>
    );
  }

  /* ----------------------------------------------------------- expanded -- */

  return (
    <div
      className={cn(
        "grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="font-medium">{ka.assignments.kidAddTitle}</p>
          <p className="text-xs text-muted-foreground">
            {lesson?.subjectName ?? ka.assignments.kidAddHint}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ka.common.cancel}
          onClick={close}
        >
          <X />
        </Button>
      </div>

      {assignmentId ? (
        <>
          <PhotoUploader
            target={{
              kind: "assignment",
              assignmentId,
              childId,
              attachmentKind: "task_source",
            }}
            label={ka.assignments.kidTaskPhoto}
            initialFiles={handover}
          />
          <Button
            type="button"
            size={size === "lg" ? "lg" : "default"}
            className={cn(size === "lg" && "h-14 text-base")}
            onClick={close}
          >
            <Check />
            {ka.assignments.kidDone}
          </Button>
        </>
      ) : (
        <>
          {detailed ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-title`}>
                  {ka.assignments.fieldTitle}
                </Label>
                <Input
                  id={`${fieldId}-title`}
                  value={title}
                  placeholder={ka.assignments.kidTitlePlaceholder}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldId}-source`}>
                  {ka.assignments.fieldSourceRef}
                </Label>
                <Input
                  id={`${fieldId}-source`}
                  value={sourceRef}
                  placeholder={ka.assignments.fieldSourceRefPlaceholder}
                  onChange={(event) => setSourceRef(event.target.value)}
                />
              </div>

              {!lesson && subjects.length > 0 ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-subject`}>
                    {ka.assignments.fieldSubject}
                  </Label>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger id={`${fieldId}-subject`}>
                      <SelectValue placeholder={ka.assignments.noSubject} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        {ka.assignments.noSubject}
                      </SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-due`}>
              {ka.assignments.fieldDueDate}
            </Label>
            <Input
              id={`${fieldId}-due`}
              type="date"
              value={dueDate}
              className={cn(size === "lg" && "h-14 text-lg")}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>

          <p className="text-sm font-medium">{ka.assignments.kidTaskPhoto}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 flex-1"
              disabled={busy}
              // Synchronous inside the gesture: the camera must not wait for a
              // round trip, so nothing is awaited before this click.
              onClick={() => cameraRef.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Camera />}
              {ka.attachments.takePhoto}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImagePlus />
              {ka.attachments.addPhotos}
            </Button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              picked(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              picked(event.target.files);
              event.target.value = "";
            }}
          />

          {detailed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void create([])}
            >
              {ka.assignments.kidSaveWithoutPhoto}
            </Button>
          ) : null}

          {error ? (
            <div className="grid gap-2">
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void create(handover)}
              >
                {ka.kid.errorRetry}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
