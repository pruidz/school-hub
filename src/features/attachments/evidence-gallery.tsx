"use client";

/**
 * Photos and recordings for one target, in one place.
 *
 * `PhotoGallery` stays image-only — it is a zoomable thumbnail grid and that is
 * all it should be, and A3 already consumes it under that contract. This wraps
 * it instead: the same list of `attachments` is split on mime, the photos go to
 * the grid and the recordings to a player list directly underneath.
 *
 * The point is the review screen. A parent checking a recited poem presses play
 * and presses ✓ in the same view; two separate lists in two separate boxes
 * would mean scrolling away from the decision to hear the evidence.
 */

import * as React from "react";

import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { AudioEvidenceList } from "./audio-player";
import { splitEvidence } from "./audio";
import { PhotoGallery } from "./photo-gallery";
import type { Attachment } from "./types";

export type EvidenceGalleryProps = {
  attachments: Attachment[];
  /** Passed straight through to `PhotoGallery`. Default true. */
  zoom?: boolean;
  /**
   * Shown only when there is NEITHER a photo NOR a recording. Defaults to a
   * wording that covers both, because „ფოტო ჯერ არ არის" under a recording
   * would read as though something were missing.
   */
  emptyLabel?: string;
  gridClassName?: string;
  className?: string;
};

export function EvidenceGallery({
  attachments,
  zoom = true,
  emptyLabel,
  gridClassName,
  className,
}: EvidenceGalleryProps) {
  const { photos, recordings } = React.useMemo(
    () => splitEvidence(attachments),
    [attachments],
  );

  if (photos.length === 0 && recordings.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyLabel ?? ka.attachments.noEvidence}
      </p>
    );
  }

  return (
    <div className={cn("grid gap-3", className)}>
      {photos.length > 0 ? (
        <PhotoGallery
          attachments={photos}
          zoom={zoom}
          gridClassName={gridClassName}
        />
      ) : null}

      {recordings.length > 0 ? (
        <section className="grid gap-2">
          {photos.length > 0 ? (
            <h3 className="text-xs font-medium text-muted-foreground">
              {ka.attachments.recordings}
            </h3>
          ) : null}
          <AudioEvidenceList attachments={recordings} />
        </section>
      ) : null}
    </div>
  );
}
