"use client";

/**
 * Multi-file photo upload for an assignment or a lesson.
 *
 * Contract (CLAUDE.md, "Cross-agent contracts") — A3 imports this for the
 * lesson screen, so the prop names are fixed.
 *
 * The flow per file is: compress -> PUT to Storage -> register the row.
 * Every failure path cleans up after itself, so the invariant
 * "no object without a row, no row without an object" always holds.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import { ka, t } from "@/lib/i18n/ka";
import {
  MAX_SOURCE_BYTES,
  compressImage,
  formatBytes,
  looksLikeImage,
} from "@/lib/images";
import { cn } from "@/lib/utils";

import {
  deleteAttachmentAction,
  discardOrphanObjectAction,
  registerAttachmentAction,
} from "./actions";
import {
  DEFAULT_MAX_PHOTOS,
  assignmentObjectPath,
  lessonObjectPath,
} from "./paths";
import type { AttachmentTarget, UploadPhase } from "./types";
import { uploadObjectWithProgress } from "./upload-client";

export type PhotoUploaderProps = {
  target: AttachmentTarget;
  /** Files this component may add in one sitting. Default 6. */
  max?: number;
  /** Georgian, from `ka.ts`. */
  label?: string;
  onUploaded?: () => void;
  /** Photos already attached, so `max` counts the real total. */
  existingCount?: number;
  /**
   * Files picked BEFORE this component existed, queued once on mount.
   *
   * The kid quick-add flow (`features/assignments/kid-quick-add.tsx`) needs the
   * camera to open on the same tap that eventually creates the assignment: the
   * file input has to be clicked inside the real user gesture, but the upload
   * target only exists once the row is inserted. So the caller owns the first
   * picker, creates the row while the child is still in the camera app, then
   * mounts this component with the photo already in hand. Read once — later
   * changes to the array are ignored, so a re-render cannot re-upload.
   */
  initialFiles?: File[];
  disabled?: boolean;
  className?: string;
};

type Item = {
  id: string;
  source: File;
  previewUrl: string;
  phase: UploadPhase;
  progress: number;
  error: string | null;
  attachmentId: string | null;
  busy: boolean;
};

const PHASE_LABEL: Record<UploadPhase, string> = {
  queued: ka.common.loading,
  compressing: ka.attachments.compressing,
  uploading: ka.attachments.uploading,
  saving: ka.attachments.savingRow,
  done: ka.attachments.uploaded,
  error: ka.attachments.errUploadFailed,
};

export function PhotoUploader({
  target,
  max = DEFAULT_MAX_PHOTOS,
  label,
  onUploaded,
  existingCount = 0,
  initialFiles,
  disabled = false,
  className,
}: PhotoUploaderProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<Item[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const runningRef = React.useRef(false);
  /** Pending work, kept in a ref so the drain loop never races React state. */
  const queueRef = React.useRef<Item[]>([]);
  const previewsRef = React.useRef<string[]>([]);
  /** Set by a successful upload, read once by the drain loop. */
  const dirtyRef = React.useRef(false);
  /** `existingCount` before this component uploaded anything. */
  const [mountedExistingCount] = React.useState(existingCount);

  // Object URLs are per-item and must outlive re-renders, so they are revoked
  // once, on unmount, from a ref that every created URL is pushed onto.
  React.useEffect(() => {
    const previews = previewsRef.current;
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
    };
  }, []);

  const patch = React.useCallback((id: string, change: Partial<Item>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }, []);

  // A finished upload is already an `attachments` row, so the parent screen
  // counts it in `existingCount` once the batch refresh lands. Adding it to
  // that number as well would halve the real limit (6 photos would stop
  // accepting files after 3), so the two are reconciled instead of summed:
  // before the refresh the done tiles are counted on top of the count this
  // component mounted with, after it `existingCount` is already ahead.
  const doneCount = items.filter((item) => item.phase === "done").length;
  const inFlightCount = items.filter(
    (item) => item.phase !== "error" && item.phase !== "done",
  ).length;
  const liveCount =
    Math.max(existingCount, mountedExistingCount + doneCount) + inFlightCount;
  const remaining = Math.max(0, max - liveCount);
  const atLimit = remaining <= 0;

  /* ------------------------------------------------------------------ run -- */

  const runItem = React.useCallback(
    async (item: Item) => {
      patch(item.id, {
        phase: "compressing",
        progress: 0,
        error: null,
        busy: true,
      });

      let storagePath: string | null = null;

      try {
        const compressed = await compressImage(item.source, {
          onProgress: (percent) =>
            patch(item.id, { progress: Math.round(percent * 0.35) }),
        });

        storagePath =
          target.kind === "assignment"
            ? assignmentObjectPath(target.childId, target.assignmentId)
            : lessonObjectPath(target.childId, target.lessonId);

        patch(item.id, { phase: "uploading", progress: 35 });

        await uploadObjectWithProgress({
          path: storagePath,
          blob: compressed.file,
          mime: compressed.mime,
          onProgress: (percent) =>
            patch(item.id, { progress: 35 + Math.round(percent * 0.55) }),
        });

        patch(item.id, { phase: "saving", progress: 92 });

        const result = await registerAttachmentAction({
          target,
          storagePath,
          mime: compressed.mime,
          sizeBytes: compressed.sizeBytes,
          width: compressed.width,
          height: compressed.height,
        });

        if (!result.ok) {
          // The row was refused — do not leave the object behind.
          await discardOrphanObjectAction(storagePath);
          patch(item.id, {
            phase: "error",
            error: result.message,
            busy: false,
          });
          return;
        }

        // The tile keeps its local object URL and stays on screen, so the
        // child sees their own photo the instant it lands — the server render
        // catching up later must not be what makes it appear.
        patch(item.id, {
          phase: "done",
          progress: 100,
          attachmentId: result.data.id,
          busy: false,
        });
        dirtyRef.current = true;

        onUploaded?.();
      } catch (error) {
        if (storagePath) await discardOrphanObjectAction(storagePath);
        patch(item.id, {
          phase: "error",
          busy: false,
          error:
            error instanceof Error && error.name === "UploadError"
              ? ka.attachments.errUploadFailed
              : ka.attachments.errCompressFailed,
        });
      }
    },
    [onUploaded, patch, target],
  );

  const drainQueue = React.useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      // Sequential on purpose: a phone encoding two WebPs at once stalls.
      for (;;) {
        const next = queueRef.current.shift();
        if (!next) break;
        await runItem(next);
      }
    } finally {
      runningRef.current = false;
    }

    // One refresh for the whole batch. Refreshing per file re-ran the detail
    // queries, the signed URLs and the thread once per photo, and four photos
    // meant four full RSC round trips on a phone.
    if (dirtyRef.current) {
      dirtyRef.current = false;
      router.refresh();
    }
  }, [router, runItem]);

  /* --------------------------------------------------------------- pick --- */

  const addFiles = React.useCallback(
    (picked: File[]) => {
      if (picked.length === 0) return;
      setNotice(null);

      const accepted: Item[] = [];
      let rejected: string | null = null;

      for (const file of picked) {
        if (accepted.length >= remaining) {
          rejected = t("attachments.limitReached", { count: max });
          break;
        }
        if (!looksLikeImage(file)) {
          rejected = ka.attachments.errNotImage;
          continue;
        }
        if (file.size > MAX_SOURCE_BYTES) {
          rejected = `${ka.attachments.errTooLarge} (${formatBytes(file.size)})`;
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        previewsRef.current.push(previewUrl);

        accepted.push({
          id: crypto.randomUUID(),
          source: file,
          previewUrl,
          phase: "queued",
          progress: 0,
          error: null,
          attachmentId: null,
          busy: false,
        });
      }

      if (rejected) setNotice(rejected);
      if (accepted.length === 0) return;

      queueRef.current.push(...accepted);
      setItems((current) => [...current, ...accepted]);

      void drainQueue();
    },
    [drainQueue, max, remaining],
  );

  // Queue the handover exactly once. `addFiles` is recreated whenever
  // `remaining` changes, so the guard — not the dependency list — is what keeps
  // the first photo from being uploaded twice.
  const initialFilesRef = React.useRef(initialFiles);
  const initialFilesDone = React.useRef(false);
  React.useEffect(() => {
    if (initialFilesDone.current) return;
    initialFilesDone.current = true;
    const handover = initialFilesRef.current;
    if (handover && handover.length > 0) addFiles(handover);
  }, [addFiles]);

  const retry = React.useCallback(
    (item: Item) => {
      patch(item.id, { phase: "queued", progress: 0, error: null });
      queueRef.current.push({
        ...item,
        phase: "queued",
        progress: 0,
        error: null,
      });
      void drainQueue();
    },
    [drainQueue, patch],
  );

  const discard = React.useCallback(
    async (item: Item) => {
      if (item.attachmentId) {
        patch(item.id, { busy: true });
        const result = await deleteAttachmentAction({
          attachmentId: item.attachmentId,
        });
        if (!result.ok) {
          patch(item.id, { busy: false, error: result.message });
          return;
        }
        router.refresh();
      }
      queueRef.current = queueRef.current.filter(
        (entry) => entry.id !== item.id,
      );
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    },
    [patch, router],
  );

  /* -------------------------------------------------------------- render -- */

  return (
    <div className={cn("grid gap-3", className)}>
      {label ? <p className="text-sm font-medium">{label}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-12 flex-1 sm:flex-none"
          disabled={disabled || atLimit}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera />
          {ka.attachments.takePhoto}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 flex-1 sm:flex-none"
          disabled={disabled || atLimit}
          onClick={() => galleryInputRef.current?.click()}
        >
          <ImagePlus />
          {ka.attachments.addPhotos}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {atLimit
          ? t("attachments.limitReached", { count: max })
          : ka.attachments.addPhotosHint}
      </p>

      {notice ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {notice}
        </p>
      ) : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative overflow-hidden rounded-lg border bg-muted/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt=""
                className={cn(
                  "aspect-square w-full object-cover transition-opacity",
                  item.phase !== "done" && "opacity-60",
                )}
              />

              <RemovePhotoButton
                // A queued or failed tile is nothing but a local preview, so
                // it is dismissed without a prompt. An uploaded one is a row
                // plus a stored object, and a mis-tap costs a re-shoot.
                uploaded={item.attachmentId !== null}
                busy={item.busy}
                onRemove={() => void discard(item)}
              />

              <div className="grid gap-1 p-2">
                {item.phase === "error" ? (
                  <>
                    <p className="text-xs font-medium text-destructive">
                      {item.error ?? PHASE_LABEL.error}
                    </p>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => retry(item)}
                    >
                      <RotateCcw />
                      {ka.attachments.retryUpload}
                    </Button>
                  </>
                ) : item.phase === "done" ? (
                  <p className="text-xs text-muted-foreground">
                    {PHASE_LABEL.done}
                  </p>
                ) : (
                  <>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      {PHASE_LABEL[item.phase]}
                    </p>
                    <Progress value={item.progress} className="h-1" />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  remove one tile                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The same `AlertDialog` guard every destructive action in the app sits behind
 * (see `features/schedule/subjects-manager.tsx`), but only once the photo is
 * really stored — confirming the removal of a preview that never uploaded
 * would just be noise.
 */
function RemovePhotoButton({
  uploaded,
  busy,
  onRemove,
}: {
  uploaded: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  const trigger = (
    <button
      type="button"
      aria-label={ka.attachments.removePhoto}
      disabled={busy}
      onClick={() => (uploaded ? setOpen(true) : onRemove())}
      className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow-sm disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );

  if (!uploaded) return trigger;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {ka.attachments.deleteConfirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {ka.attachments.deleteConfirmBody}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onRemove}>
            {ka.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
