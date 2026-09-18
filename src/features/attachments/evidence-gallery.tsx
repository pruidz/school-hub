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
 *
 * `deletable` is the child's side of the same component. A first take of a
 * recitation is almost always scrapped, and before this there was no way to
 * take one back once the page had reloaded — the child could only record again
 * and leave the bad take attached for a parent to wade through. The window is
 * deliberately narrow and the server action decides it, not this prop: see
 * `deleteAttachmentAction`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { ka } from "@/lib/i18n/ka";
import { cn } from "@/lib/utils";

import { deleteAttachmentAction } from "./actions";
import { AudioEvidenceList } from "./audio-player";
import { isAudioAttachment, splitEvidence } from "./audio";
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
  /** Server-signed `storage_path` -> URL, so nothing is signed from here. */
  initialUrls?: Record<string, string | null>;
  /**
   * Offer a remove button on every item. Only ever passed for the child's own
   * unsubmitted solution evidence; the action re-checks who, what and when.
   */
  deletable?: boolean;
  className?: string;
};

export function EvidenceGallery({
  attachments,
  zoom = true,
  emptyLabel,
  gridClassName,
  initialUrls,
  deletable = false,
  className,
}: EvidenceGalleryProps) {
  const { photos, recordings } = React.useMemo(
    () => splitEvidence(attachments),
    [attachments],
  );

  const router = useRouter();
  const [pending, setPending] = React.useState<Attachment | null>(null);
  const [busyIds, setBusyIds] = React.useState<string[]>([]);

  const confirmDelete = React.useCallback(async () => {
    const target = pending;
    if (!target) return;

    setPending(null);
    setBusyIds((current) => [...current, target.id]);

    const result = await deleteAttachmentAction({ attachmentId: target.id });

    setBusyIds((current) => current.filter((id) => id !== target.id));

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(
      isAudioAttachment(target)
        ? ka.attachments.recordingRemoved
        : ka.attachments.removed,
    );
    router.refresh();
  }, [pending, router]);

  const onDelete = deletable ? setPending : undefined;

  if (photos.length === 0 && recordings.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyLabel ?? ka.attachments.noEvidence}
      </p>
    );
  }

  const audioPending = pending ? isAudioAttachment(pending) : false;

  return (
    <div className={cn("grid gap-3", className)}>
      {photos.length > 0 ? (
        <PhotoGallery
          attachments={photos}
          zoom={zoom}
          gridClassName={gridClassName}
          initialUrls={initialUrls}
          onDelete={onDelete}
          busyIds={busyIds}
        />
      ) : null}

      {recordings.length > 0 ? (
        <section className="grid gap-2">
          {photos.length > 0 ? (
            <h3 className="text-xs font-medium text-muted-foreground">
              {ka.attachments.recordings}
            </h3>
          ) : null}
          <AudioEvidenceList
            attachments={recordings}
            initialUrls={initialUrls}
            onDelete={onDelete}
            busyIds={busyIds}
          />
        </section>
      ) : null}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {audioPending
                ? ka.attachments.deleteRecordingConfirmTitle
                : ka.attachments.deleteConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {audioPending
                ? ka.attachments.deleteRecordingConfirmBody
                : ka.attachments.deleteConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>{ka.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              {ka.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
