"use client";

/**
 * Playback for recorded evidence.
 *
 * `<audio controls>` is the whole player on purpose: the native control strip
 * is the one media UI a child and a parent already know, it is keyboard- and
 * screen-reader-accessible for free, and on a phone it hands the lock screen
 * and the headphone buttons the right thing. What this component adds is the
 * two things the native element cannot do here:
 *
 *   1. the src is a SIGNED url for a private object, so it has to be fetched
 *      and — because it expires — refetched. An expired link surfaces as a
 *      media `error` event, which is caught below and answered with a fresh
 *      signature and the playhead put back where it was. This is the audio
 *      equivalent of what `PhotoGallery` does when a thumbnail fails to load;
 *   2. a readable duration. Chrome's own MediaRecorder writes WebM with no
 *      duration in the header, so `<audio>` reports `Infinity` until the file
 *      has been seeked to the end — the seek dance below is what makes
 *      „2:14" appear instead of nothing.
 */

import * as React from "react";
import { Mic } from "lucide-react";

import { formatDuration } from "@/lib/images";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { orderEvidence } from "./audio";
import { SIGNED_URL_TTL_SECONDS } from "./paths";
import { getSignedUrl } from "./signed-urls";
import type { Attachment } from "./types";

/** Re-sign this long before the URL actually dies, so a tap never 403s. */
const RESIGN_MARGIN_MS = 5 * 60 * 1000;

export type AudioEvidenceListProps = {
  attachments: Attachment[];
  /** Shown instead of the list when there is nothing. `null` renders nothing. */
  emptyLabel?: string | null;
  className?: string;
};

/**
 * Every recording attached to one target, in the same order `PhotoGallery`
 * puts photos in.
 */
export function AudioEvidenceList({
  attachments,
  emptyLabel = null,
  className,
}: AudioEvidenceListProps) {
  const ordered = React.useMemo(
    () => orderEvidence(attachments),
    [attachments],
  );

  if (ordered.length === 0) {
    return emptyLabel ? (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    ) : null;
  }

  return (
    <ul className={cn("grid gap-2", className)}>
      {ordered.map((attachment, index) => (
        <li key={attachment.id}>
          <AudioEvidence
            attachment={attachment}
            label={t("attachments.recordingIndex", {
              index: index + 1,
              total: ordered.length,
            })}
          />
        </li>
      ))}
    </ul>
  );
}

export function AudioEvidence({
  attachment,
  label,
}: {
  attachment: Attachment;
  label?: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [duration, setDuration] = React.useState<number | null>(null);

  const signedAtRef = React.useRef(0);
  /** Guards the error path so a genuinely broken object cannot loop. */
  const resignAttemptsRef = React.useRef(0);
  /** Set while the Infinity-duration workaround is seeking. */
  const measuringRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const path = attachment.storage_path;

  // Deliberately a promise chain rather than an `async` function: the state
  // updates have to land in a `.then` callback, never synchronously inside the
  // effect below. `PhotoGallery` signs its thumbnails the same way.
  const sign = React.useCallback(
    (): Promise<string | null> =>
      getSignedUrl(path)
        .catch(() => null)
        .then((fresh) => {
          if (!mountedRef.current) return null;
          if (!fresh) {
            setFailed(true);
            return null;
          }
          signedAtRef.current = Date.now();
          setFailed(false);
          setUrl(fresh);
          return fresh;
        }),
    [path],
  );

  React.useEffect(() => {
    void sign();
  }, [sign]);

  /**
   * A link signed when the page loaded is dead by the time a parent works
   * through a long review queue, so the signature is refreshed on the way into
   * playback rather than after it has already failed.
   */
  const onPlay = React.useCallback(() => {
    const age = Date.now() - signedAtRef.current;
    if (age < SIGNED_URL_TTL_SECONDS * 1000 - RESIGN_MARGIN_MS) return;

    const element = audioRef.current;
    const position = element?.currentTime ?? 0;
    void sign().then((fresh) => {
      if (!fresh || !audioRef.current) return;
      audioRef.current.currentTime = position;
      void audioRef.current.play().catch(() => {
        // Autoplay policy, not our problem to solve: the control strip still
        // works and the child can press play again.
      });
    });
  }, [sign]);

  /**
   * The only errors worth retrying are the ones a fresh signature fixes. One
   * retry, then the row says so in Georgian instead of sitting mute.
   */
  const onError = React.useCallback(() => {
    if (resignAttemptsRef.current >= 1) {
      setFailed(true);
      return;
    }
    resignAttemptsRef.current += 1;

    const position = audioRef.current?.currentTime ?? 0;
    void sign().then((fresh) => {
      if (!fresh || !audioRef.current) return;
      audioRef.current.load();
      audioRef.current.currentTime = position;
    });
  }, [sign]);

  const readDuration = React.useCallback(() => {
    const element = audioRef.current;
    if (!element) return;

    if (Number.isFinite(element.duration) && element.duration > 0) {
      if (measuringRef.current) {
        measuringRef.current = false;
        element.currentTime = 0;
      }
      setDuration(element.duration);
      return;
    }

    // WebM from MediaRecorder carries no duration until it has been seeked
    // past its end. Asking for an impossible position makes the browser scan
    // the container and answer with the real one on the next `durationchange`.
    if (element.duration === Infinity && !measuringRef.current) {
      measuringRef.current = true;
      try {
        element.currentTime = 1e101;
      } catch {
        measuringRef.current = false;
      }
    }
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
      >
        <Mic className="size-4" />
      </span>

      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium">
            {label ?? ka.attachments.recording}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatDuration(duration)}
          </span>
        </div>

        {failed ? (
          <p className="text-xs text-muted-foreground">
            {ka.attachments.audioUnavailable}
          </p>
        ) : url ? (
          <audio
            ref={audioRef}
            src={url}
            controls
            preload="metadata"
            className="h-9 w-full"
            aria-label={label ?? ka.attachments.recording}
            onPlay={onPlay}
            onError={onError}
            onLoadedMetadata={readDuration}
            onDurationChange={readDuration}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {ka.attachments.loadingAudio}
          </p>
        )}
      </div>
    </div>
  );
}
