/**
 * Public surface of the attachments feature (A4).
 *
 * `PhotoUploader` / `PhotoGallery` are Client Components; `getSignedUrls` is a
 * Server Action module, so importing this barrel from either environment is
 * safe. Everything that touches `@/lib/supabase/server` directly lives behind
 * `actions.ts` / `signed-urls.ts` and is never re-exported as a plain function.
 */

export { PhotoUploader, type PhotoUploaderProps } from "./photo-uploader";
export { PhotoGallery, type PhotoGalleryProps } from "./photo-gallery";
export { getSignedUrl, getSignedUrls } from "./signed-urls";
export {
  deleteAttachmentAction,
  discardOrphanObjectAction,
  registerAttachmentAction,
  type RegisterAttachmentInput,
} from "./actions";
export {
  DEFAULT_MAX_PHOTOS,
  EVIDENCE_BUCKET,
  HARD_MAX_ATTACHMENTS_PER_TARGET,
  SIGNED_URL_TTL_SECONDS,
  assignmentObjectPath,
  isWellFormedEvidencePath,
  lessonObjectPath,
} from "./paths";
export type {
  Attachment,
  AttachmentKind,
  AttachmentTarget,
  UploadPhase,
  UploadableAttachmentKind,
  UploadedObject,
} from "./types";
