"use client";

/**
 * Attaching a recording to an assignment — the oral-homework counterpart of
 * `PhotoUploader`.
 *
 * TWO ways in, and the order matters:
 *
 *  1. PRIMARY — `<input type="file" accept="audio/*" capture>`. The phone opens
 *     its own recorder, an app the child has used before, with its own big red
 *     button, its own permission dialog and its own codec. Nothing here can get
 *     that wrong: we receive a finished file and a mime we canonicalise.
 *     This path is always rendered, on every device, whatever else is or is not
 *     available.
 *
 *  2. OPTIONAL — in-browser `MediaRecorder`, so a recitation can be recorded
 *     without leaving the page. It is rendered ONLY after a probe at mount
 *     finds `mediaDevices.getUserMedia`, a `MediaRecorder`, and a container
 *     `isTypeSupported()` accepts that is also on our storage allowlist. Any
 *     runtime failure afterwards — permission denied, `start()` throwing, a
 *     zero-byte blob, a mime that is not what the probe promised — retires the
 *     recorder for the rest of the session and says so. The file input is
 *     untouched by all of that, so the degradation is "one button fewer",
 *     never "cannot hand in".
 *
 * Both paths converge on the same queue as photos: upload the bytes to Storage,
 * then register the row, and delete the object again if the row is refused —
 * never a stored object with no row, never a row with no object. Unlike photos,
 * nothing is re-encoded on the way (see MAX_AUDIO_BYTES in `@/lib/images`).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Circle, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";

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
  MAX_AUDIO_BYTES,
  canonicalAudioMime,
  extensionForMime,
  formatBytes,
  formatDuration,
  isAllowedAudioMime,
  normalizeMime,
} from "@/lib/images";
import { cn } from "@/lib/utils";

import {
  deleteAttachmentAction,
  discardOrphanObjectAction,
  registerAttachmentAction,
} from "./actions";
import { assignmentObjectPath, lessonObjectPath } from "./paths";
import type { AttachmentTarget, UploadPhase } from "./types";
import { uploadObjectWithProgress } from "./upload-client";

/** Recordings this component may add in one sitting. */
export const DEFAULT_MAX_RECORDINGS = 3;

/**
 * Hard stop for the in-browser recorder. Ten minutes is the same budget as
 * MAX_AUDIO_BYTES, so a forgotten recording fails as a polite stop rather than
 * as a rejected upload.
 */
const MAX_RECORDING_SECONDS = 10 * 60;

/**
 * Containers we would accept from `MediaRecorder`, best first. Android Chrome
 * answers with the WebM/Opus entries, Safari 14.1+ with `audio/mp4`; anything
 * else means the probe fails and only the file input is offered.
 */
const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

function probeRecorderMime(): string | null {
  if (typeof window === "undefined") return null;
  if (!navigator.mediaDevices?.getUserMedia) return null;

  const Recorder = window.MediaRecorder;
  if (typeof Recorder !== "function") return null;
  if (typeof Recorder.isTypeSupported !== "function") return null;

  for (const candidate of RECORDER_MIME_CANDIDATES) {
    let supported = false;
    try {
      supported = Recorder.isTypeSupported(candidate);
    } catch {
      supported = false;
    }
    // `isTypeSupported` saying yes is not enough: the stored object has to be
    // something the bucket and the server allowlist both accept.
    if (supported && isAllowedAudioMime(normalizeMime(candidate))) {
      return candidate;
    }
  }
  return null;
}

/** The probe is a property of the browser, so it runs once per document. */
let cachedRecorderMime: string | null | undefined;

function recorderMime(): string | null {
  if (cachedRecorderMime === undefined) {
    cachedRecorderMime = probeRecorderMime();
  }
  return cachedRecorderMime;
}

/**
 * Capability detection as an external store rather than an effect: the answer
 * never changes while the page is open, the server must read `false` so the
 * markup it sends has no record button in it, and a `setState` in an effect
 * body would be a cascading render for a value that is already known.
 */
const subscribeToNothing = () => () => {};

function useRecorderSupported(): boolean {
  return React.useSyncExternalStore(
    subscribeToNothing,
    () => recorderMime() !== null,
    () => false,
  );
}

type Item = {
  id: string;
  source: File;
  mime: string;
  previewUrl: string;
  phase: UploadPhase;
  progress: number;
  error: string | null;
  attachmentId: string | null;
  busy: boolean;
};

export type AudioRecorderProps = {
  target: AttachmentTarget;
  /** Recordings allowed in total, counting `existingCount`. Default 3. */
  max?: number;
  /** Georgian, from `ka.ts`. */
  label?: string;
  onUploaded?: () => void;
  /** Recordings already attached, so `max` counts the real total. */
  existingCount?: number;
  disabled?: boolean;
  className?: string;
};

export function AudioRecorder({
  target,
  max = DEFAULT_MAX_RECORDINGS,
  label,
  onUploaded,
  existingCount = 0,
  disabled = false,
  className,
}: AudioRecorderProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<Item[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const runningRef = React.useRef(false);
  const queueRef = React.useRef<Item[]>([]);
  const previewsRef = React.useRef<string[]>([]);
  const dirtyRef = React.useRef(false);
  const [mountedExistingCount] = React.useState(existingCount);

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

  // Same reconciliation as PhotoUploader: a finished upload is counted by the
  // server render too, so the two are maxed rather than added.
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
      patch(item.id, { phase: "uploading", progress: 0, error: null, busy: true });

      let storagePath: string | null = null;

      try {
        const extension = extensionForMime(item.mime);
        storagePath =
          target.kind === "assignment"
            ? assignmentObjectPath(
                target.childId,
                target.assignmentId,
                extension,
              )
            : lessonObjectPath(target.childId, target.lessonId, extension);

        await uploadObjectWithProgress({
          path: storagePath,
          blob: item.source,
          mime: item.mime,
          onProgress: (percent) =>
            patch(item.id, { progress: Math.round(percent * 0.9) }),
        });

        patch(item.id, { phase: "saving", progress: 92 });

        const result = await registerAttachmentAction({
          target,
          storagePath,
          mime: item.mime,
          sizeBytes: item.source.size,
          width: null,
          height: null,
        });

        if (!result.ok) {
          await discardOrphanObjectAction(storagePath);
          patch(item.id, { phase: "error", error: result.message, busy: false });
          return;
        }

        patch(item.id, {
          phase: "done",
          progress: 100,
          attachmentId: result.data.id,
          busy: false,
        });
        dirtyRef.current = true;
        onUploaded?.();
      } catch {
        if (storagePath) await discardOrphanObjectAction(storagePath);
        patch(item.id, {
          phase: "error",
          busy: false,
          error: ka.attachments.errUploadFailed,
        });
      }
    },
    [onUploaded, patch, target],
  );

  const drainQueue = React.useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        const next = queueRef.current.shift();
        if (!next) break;
        await runItem(next);
      }
    } finally {
      runningRef.current = false;
    }

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
          rejected = t("attachments.recordingLimitReached", { count: max });
          break;
        }

        const mime = canonicalAudioMime(file.type, file.name);
        if (!mime) {
          rejected = ka.attachments.errNotAudio;
          continue;
        }
        if (file.size === 0) {
          rejected = ka.attachments.errEmptyRecording;
          continue;
        }
        if (file.size > MAX_AUDIO_BYTES) {
          rejected = `${ka.attachments.errAudioTooLarge} (${formatBytes(file.size)})`;
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        previewsRef.current.push(previewUrl);

        accepted.push({
          id: crypto.randomUUID(),
          source: file,
          mime,
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

  /* ----------------------------------------------------- in-browser rec --- */

  const recorder = useBrowserRecorder({
    onRecorded: addFiles,
    onRetired: () => setNotice(ka.attachments.recorderUnavailable),
  });

  const controlsDisabled = disabled || atLimit;

  /* -------------------------------------------------------------- render -- */

  return (
    <div className={cn("grid gap-3", className)}>
      {label ? <p className="text-sm font-medium">{label}</p> : null}

      <div className="flex flex-wrap gap-2">
        {/* Always first, always present: the phone's own recorder. */}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-12 flex-1 sm:flex-none"
          disabled={controlsDisabled || recorder.recording}
          onClick={() => fileInputRef.current?.click()}
        >
          <Mic />
          {ka.attachments.recordAudio}
        </Button>

        {recorder.available ? (
          recorder.recording ? (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-12 flex-1 sm:flex-none"
              onClick={recorder.stop}
            >
              <Square />
              {t("attachments.stopRecording", {
                duration: formatDuration(recorder.elapsed),
              })}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1 sm:flex-none"
              disabled={controlsDisabled || recorder.starting}
              onClick={() => void recorder.start()}
            >
              {recorder.starting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Circle className="fill-destructive text-destructive" />
              )}
              {ka.attachments.recordHere}
            </Button>
          )
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {atLimit
          ? t("attachments.recordingLimitReached", { count: max })
          : ka.attachments.recordAudioHint}
      </p>

      {notice ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {notice}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        capture
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid gap-2 rounded-lg border bg-muted/30 p-2"
            >
              <div className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-1">
                  <audio
                    src={item.previewUrl}
                    controls
                    preload="metadata"
                    className="h-9 w-full"
                    aria-label={ka.attachments.recording}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {formatBytes(item.source.size)}
                  </p>
                </div>

                <RemoveRecordingButton
                  uploaded={item.attachmentId !== null}
                  busy={item.busy}
                  onRemove={() => void discard(item)}
                />
              </div>

              {item.phase === "error" ? (
                <div className="grid gap-1">
                  <p className="text-xs font-medium text-destructive">
                    {item.error ?? ka.attachments.errUploadFailed}
                  </p>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => retry(item)}
                  >
                    <RotateCcw />
                    {ka.attachments.retryUpload}
                  </Button>
                </div>
              ) : item.phase === "done" ? (
                <p className="text-xs text-muted-foreground">
                  {ka.attachments.uploaded}
                </p>
              ) : (
                <div className="grid gap-1">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    {ka.attachments.uploading}
                  </p>
                  <Progress value={item.progress} className="h-1" />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  in-browser recorder                                                        */
/* -------------------------------------------------------------------------- */

type BrowserRecorder = {
  available: boolean;
  starting: boolean;
  recording: boolean;
  /** Seconds since `start()`, for the stop button's label. */
  elapsed: number;
  start: () => Promise<void>;
  stop: () => void;
};

/**
 * `MediaRecorder`, behind a probe and a one-way "retired" switch.
 *
 * `available` is the probe AND the absence of a retirement. The probe is false
 * during the server render and on any browser without the API, so such a
 * browser never renders a record button at all. `retired` is set the first time
 * anything throws and is never unset: a recorder that has misbehaved once is
 * not asked again in this session, and the file input — which is rendered
 * unconditionally — carries the whole feature from then on.
 */
function useBrowserRecorder({
  onRecorded,
  onRetired,
}: {
  onRecorded: (files: File[]) => void;
  onRetired: () => void;
}): BrowserRecorder {
  const supported = useRecorderSupported();
  const [retired, setRetired] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  /** Mirror of `elapsed`, so the tick can act on it without a state updater. */
  const elapsedRef = React.useRef(0);

  const cleanup = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setRecording(false);
    setStarting(false);
    setElapsed(0);
  }, []);

  const retire = React.useCallback(() => {
    cleanup();
    setRetired(true);
    onRetired();
  }, [cleanup, onRetired]);

  // Never leave the microphone open behind a navigation.
  React.useEffect(() => cleanup, [cleanup]);

  /** Safe to call twice: `stop()` on an inactive recorder throws. */
  const stop = React.useCallback(() => {
    const active = recorderRef.current;
    if (!active || active.state === "inactive") return;
    try {
      active.stop();
    } catch {
      retire();
    }
  }, [retire]);

  const start = React.useCallback(async () => {
    const mime = recorderMime();
    if (!mime) {
      retire();
      return;
    }

    setStarting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Denied, dismissed, or no microphone. The file input still works, and
      // a phone recorder asks for the same permission in a dialog the child
      // understands better than this one.
      retire();
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      retire();
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onerror = () => retire();

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const canonical = canonicalAudioMime(recorder.mimeType || mime);

      cleanup();

      if (chunks.length === 0 || !canonical) {
        // A recorder that produced nothing, or produced a container the probe
        // did not promise, is a recorder we stop trusting.
        retire();
        return;
      }

      const blob = new Blob(chunks, { type: canonical });
      if (blob.size === 0) {
        retire();
        return;
      }

      onRecorded([
        new File([blob], `recording.${extensionForMime(canonical)}`, {
          type: canonical,
        }),
      ]);
    };

    try {
      recorder.start();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      retire();
      return;
    }

    setStarting(false);
    setRecording(true);
    setElapsed(0);
    elapsedRef.current = 0;

    // The tick counts in a ref and stops the recorder from the interval body,
    // not from inside a state updater: React may run an updater twice, and
    // `stop()` on an already-stopped recorder throws.
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_RECORDING_SECONDS) stop();
    }, 1000);
  }, [cleanup, onRecorded, retire, stop]);

  return {
    available: supported && !retired,
    starting,
    recording,
    elapsed,
    start,
    stop,
  };
}

/* -------------------------------------------------------------------------- */
/*  remove one recording                                                       */
/* -------------------------------------------------------------------------- */

function RemoveRecordingButton({
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
      aria-label={ka.attachments.removeRecording}
      disabled={busy}
      onClick={() => (uploaded ? setOpen(true) : onRemove())}
      className="grid size-8 shrink-0 place-items-center rounded-full bg-background text-foreground shadow-sm disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
    </button>
  );

  if (!uploaded) return trigger;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {ka.attachments.deleteRecordingConfirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {ka.attachments.deleteRecordingConfirmBody}
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
