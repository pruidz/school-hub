"use client";

/**
 * Thumbnail grid + lightbox for private `evidence` objects.
 *
 * Zoom is the point of this component, not decoration: the parent has to read a
 * child's handwriting off a phone photo. Pinch works on touch, wheel and
 * double-click work on a desktop, and panning keeps the zoomed area reachable.
 *
 * Signed URLs are fetched once, in a single batched round trip, because the
 * bucket is private and a raw `storage_path` is not loadable.
 */

import * as React from "react";
import { ChevronLeft, ChevronRight, ImageOff, X, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ka, t } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { getSignedUrls } from "./signed-urls";
import type { Attachment } from "./types";

export type PhotoGalleryProps = {
  attachments: Attachment[];
  /** Enable the lightbox. Default true. */
  zoom?: boolean;
  /** Georgian empty-state text; defaults to `ka.attachments.noPhotos`. */
  emptyLabel?: string;
  /** Tailwind column classes for the thumbnail grid. */
  gridClassName?: string;
  className?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * `storage_path` -> signed URL. `null` marks a path that came back unsigned;
 * a missing key means signing is still in flight.
 */
type SignedUrlMap = Record<string, string | null>;

export function PhotoGallery({
  attachments,
  zoom = true,
  emptyLabel,
  gridClassName,
  className,
}: PhotoGalleryProps) {
  const ordered = React.useMemo(
    () =>
      [...attachments].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      ),
    [attachments],
  );

  const pathKey = ordered.map((item) => item.storage_path).join("\n");
  const [urls, setUrls] = React.useState<SignedUrlMap>({});
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  /**
   * Paths already asked for, so a re-render that adds one photo signs that one
   * path instead of the whole list again. Kept in a ref because it must not
   * itself re-trigger the effect.
   */
  const requestedRef = React.useRef<Set<string>>(new Set());

  // The map is keyed per path and merged, never replaced: a `router.refresh()`
  // after an upload adds the new path and leaves every thumbnail that is
  // already signed on screen. An entry is a URL, `null` once signing came back
  // without one, and absent while it is still in flight.
  React.useEffect(() => {
    const paths = pathKey ? pathKey.split("\n") : [];
    const missing = paths.filter((path) => !requestedRef.current.has(path));
    if (missing.length === 0) return;

    for (const path of missing) requestedRef.current.add(path);

    getSignedUrls(missing)
      .then((result) => {
        setUrls((current) => {
          const next = { ...current };
          for (const path of missing) next[path] = result[path] ?? null;
          return next;
        });
      })
      .catch(() => {
        // Let a later render retry these rather than pinning them to "failed".
        for (const path of missing) requestedRef.current.delete(path);
        setUrls((current) => {
          const next = { ...current };
          for (const path of missing) next[path] = null;
          return next;
        });
      });
  }, [pathKey]);

  if (ordered.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyLabel ?? ka.attachments.noPhotos}
      </p>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <ul
        className={cn(
          "grid grid-cols-2 gap-2 sm:grid-cols-3",
          gridClassName,
        )}
      >
        {ordered.map((attachment, index) => {
          const entry = urls[attachment.storage_path];
          const url = entry ?? undefined;
          return (
            <li key={attachment.id}>
              <button
                type="button"
                disabled={!zoom || !url}
                aria-label={ka.attachments.openPhoto}
                onClick={() => setOpenIndex(index)}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-lg border bg-muted",
                  zoom && url && "cursor-zoom-in",
                )}
              >
                {url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover"
                    />
                    {zoom ? (
                      <span className="pointer-events-none absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
                        <ZoomIn className="size-4" />
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="grid aspect-square w-full place-items-center text-xs text-muted-foreground">
                    {entry === undefined ? (
                      ka.attachments.loadingPhotos
                    ) : (
                      <ImageOff className="size-5" />
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {zoom && openIndex !== null ? (
        <Lightbox
          attachments={ordered}
          urls={urls}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  lightbox                                                                   */
/* -------------------------------------------------------------------------- */

function Lightbox({
  attachments,
  urls,
  index,
  onIndexChange,
  onClose,
}: {
  attachments: Attachment[];
  urls: SignedUrlMap;
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const total = attachments.length;
  const current = attachments[index];

  const goPrev = React.useCallback(
    () => onIndexChange((index - 1 + total) % total),
    [index, onIndexChange, total],
  );
  const goNext = React.useCallback(
    () => onIndexChange((index + 1) % total),
    [index, onIndexChange, total],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        goPrev();
      } else if (event.key === "ArrowRight") {
        goNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [goNext, goPrev, onClose]);

  if (!current) return null;
  const url = urls[current.storage_path];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ka.attachments.openPhoto}
      className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-2 p-2 text-white">
        <span className="px-2 text-sm tabular-nums">
          {t("attachments.photoIndex", { index: index + 1, total })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={ka.attachments.closePhoto}
          onClick={onClose}
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <X />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        {url ? (
          <ZoomableImage key={current.id} src={url} />
        ) : (
          <p className="grid h-full place-items-center text-sm text-white/70">
            {ka.attachments.unavailable}
          </p>
        )}

        {total > 1 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={ka.attachments.prevPhoto}
              onClick={goPrev}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={ka.attachments.nextPhoto}
              onClick={goNext}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
      </div>

      <p className="p-3 text-center text-xs text-white/60">
        {ka.attachments.zoomHint}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  pinch / wheel / drag zoom                                                  */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ZoomableImage({ src }: { src: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  /** True while a finger is down, so the transform follows without easing. */
  const [interacting, setInteracting] = React.useState(false);

  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{ distance: number; scale: number } | null>(null);
  const pan = React.useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  /** Keep the image from being dragged entirely off screen. */
  const clampOffset = React.useCallback(
    (next: { x: number; y: number }, atScale: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return next;
      const limitX = (box.width * (atScale - 1)) / 2;
      const limitY = (box.height * (atScale - 1)) / 2;
      return {
        x: clamp(next.x, -limitX, limitX),
        y: clamp(next.y, -limitY, limitY),
      };
    },
    [],
  );

  const applyScale = React.useCallback(
    (nextScale: number) => {
      const bounded = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      setScale(bounded);
      setOffset((current) =>
        bounded === MIN_SCALE ? { x: 0, y: 0 } : clampOffset(current, bounded),
      );
    },
    [clampOffset],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    setInteracting(true);

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { distance: distanceBetween(a!, b!), scale };
      pan.current = null;
    } else if (pointers.current.size === 1 && scale > MIN_SCALE) {
      pan.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = distanceBetween(a!, b!);
      if (pinch.current.distance > 0) {
        applyScale((distance / pinch.current.distance) * pinch.current.scale);
      }
      return;
    }

    if (pan.current && scale > MIN_SCALE) {
      const next = {
        x: pan.current.offsetX + (event.clientX - pan.current.x),
        y: pan.current.offsetY + (event.clientY - pan.current.y),
      };
      setOffset(clampOffset(next, scale));
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      pan.current = null;
      setInteracting(false);
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    applyScale(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  const onDoubleClick = () => {
    if (scale > MIN_SCALE) {
      setScale(MIN_SCALE);
      setOffset({ x: 0, y: 0 });
    } else {
      applyScale(2.5);
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full touch-none overflow-hidden overscroll-contain"
      style={{ cursor: scale > MIN_SCALE ? "grab" : "zoom-in" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full origin-center object-contain select-none"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          transition: interacting ? "none" : "transform 120ms",
        }}
      />
    </div>
  );
}

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
