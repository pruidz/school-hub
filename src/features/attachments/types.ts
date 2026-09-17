import type { Attachment, AttachmentKind } from "@/lib/db.types";

export type { Attachment, AttachmentKind };

/** Kinds a `PhotoUploader` may produce. `chat` is handled by the composer. */
export type UploadableAttachmentKind = "task_source" | "solution" | "review";

/**
 * Where an upload belongs. Fixed by the cross-agent contract in CLAUDE.md —
 * A3 passes the `lesson` variant, A4 passes the `assignment` variant.
 */
export type AttachmentTarget =
  | {
      kind: "assignment";
      assignmentId: string;
      childId: string;
      attachmentKind: UploadableAttachmentKind;
    }
  | { kind: "lesson"; lessonId: string; childId: string };

/** Describes an object the browser has already written to Storage. */
export type UploadedObject = {
  storagePath: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

/** Per-file state surfaced by `PhotoUploader`. */
export type UploadPhase =
  | "queued"
  | "compressing"
  | "uploading"
  | "saving"
  | "done"
  | "error";
