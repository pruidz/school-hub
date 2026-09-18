/**
 * Image handling shared by the browser and the server.
 *
 * The limits below are duplicated in three places on purpose:
 *   - here, so the browser can refuse a file before wasting an upload;
 *   - in `registerAttachmentAction`, which re-reads the object's real size and
 *     mime from Storage after the upload, so a hand-rolled request cannot lie;
 *   - in `supabase/migrations/0005_storage.sql`, which is the last word.
 *
 * `browser-image-compression` is imported dynamically so that this module stays
 * importable from Server Components (it touches `window` at module scope).
 */

/** Longest edge of a stored photo, in CSS pixels. */
export const IMAGE_MAX_EDGE = 1600;

/** What the compressor aims for. Not a hard limit. */
export const IMAGE_TARGET_BYTES = 300 * 1024;

/** Hard ceiling, matching the `evidence` bucket's `file_size_limit`. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Hard ceiling for a recording. Deliberately the same 10 MB as the bucket, and
 * that is a real limit rather than a formality:
 *
 *   - every mime in {@link ALLOWED_AUDIO_MIME} is a COMPRESSED format. A phone
 *     recorder writing uncompressed WAV is rejected on type long before size
 *     matters, so 10 MB cannot buy a few seconds of PCM;
 *   - at the 128 kbps a phone recorder tops out at, 10 MB is about ten minutes.
 *     A recited poem or a read passage is one to three minutes. The cap is
 *     therefore several times the real need and still refuses a recording that
 *     was plainly left running;
 *   - it matches `storage.buckets.file_size_limit`, so Storage refuses the body
 *     mid-upload and the server never has to trust a client-declared size.
 *
 * Audio is NOT compressed in the browser: re-encoding costs battery, loses
 * quality and — worse — differs per device, which is exactly the class of bug
 * the file-input recording path exists to avoid.
 */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Largest file we will even try to decode in the browser. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

export const ALLOWED_AUDIO_MIME = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
] as const;

export const ALLOWED_UPLOAD_MIME: readonly string[] = [
  ...ALLOWED_IMAGE_MIME,
  ...ALLOWED_AUDIO_MIME,
];

/** `audio/webm;codecs=opus` -> `audio/webm`, lower-cased and trimmed. */
export function normalizeMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]!.trim().toLowerCase();
}

export function isAllowedImageMime(mime: string | null | undefined): boolean {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(normalizeMime(mime));
}

export function isAllowedAudioMime(mime: string | null | undefined): boolean {
  return (ALLOWED_AUDIO_MIME as readonly string[]).includes(normalizeMime(mime));
}

/**
 * Aliases a phone hands us for a container that IS already on the allowlist.
 *
 * `<input type="file" accept="audio/*" capture>` returns whatever the recorder
 * app labelled the file with, and the labels are not canonical: iOS Voice Memos
 * produces `audio/x-m4a` for an MP4 container, and several Android recorders
 * say `audio/mp3` for what is an MPEG frame stream. Both are the same bytes as
 * the canonical type, so they are renamed rather than refused.
 *
 * Only exact container synonyms belong here. A format that decodes differently
 * (`audio/aac` raw ADTS, `audio/amr`, `audio/wav`) is NOT mapped: calling it
 * `audio/mp4` would store a file the browser then refuses to play, which is a
 * worse failure than an honest refusal at pick time.
 */
const AUDIO_MIME_ALIASES: Readonly<Record<string, string>> = {
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp4a-latm": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg-3": "audio/mpeg",
  "audio/x-ogg": "audio/ogg",
  "audio/x-webm": "audio/webm",
};

/** Last resort when the picker reports no type at all (iOS sometimes does). */
const AUDIO_EXTENSION_MIME: Readonly<Record<string, string>> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
};

/**
 * The canonical, allowlisted mime for a recording, or `null` when the file is
 * not something we are willing to store.
 *
 * Everything that reaches Storage is labelled with the value this returns, so
 * the bucket's `allowed_mime_types` and {@link ALLOWED_AUDIO_MIME} only ever
 * have to know the four canonical names.
 */
export function canonicalAudioMime(
  mime: string | null | undefined,
  fileName?: string,
): string | null {
  const normalized = normalizeMime(mime);
  const aliased = AUDIO_MIME_ALIASES[normalized] ?? normalized;
  if (isAllowedAudioMime(aliased)) return aliased;

  const extension = /\.([a-z0-9]+)$/i.exec(fileName ?? "")?.[1]?.toLowerCase();
  const fromExtension = extension
    ? AUDIO_EXTENSION_MIME[extension]
    : undefined;

  return fromExtension && isAllowedAudioMime(fromExtension)
    ? fromExtension
    : null;
}

/** Picker-side counterpart of {@link looksLikeImage}. */
export function looksLikeAudio(file: File): boolean {
  return canonicalAudioMime(file.type, file.name) !== null;
}

/** `m:ss`, or `—` while `<audio>` has not reported a usable duration yet. */
export function formatDuration(seconds: number | null | undefined): string {
  if (
    seconds === null ||
    seconds === undefined ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "—";
  }
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

export function isAllowedUploadMime(mime: string | null | undefined): boolean {
  return ALLOWED_UPLOAD_MIME.includes(normalizeMime(mime));
}

/**
 * Heuristic used by the picker: iOS hands us `image/heic` (or an empty type)
 * for camera shots, which the compressor can still decode on that platform.
 */
export function looksLikeImage(file: File): boolean {
  if (isAllowedImageMime(file.type)) return true;
  const mime = normalizeMime(file.type);
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export type CompressedImage = {
  file: File;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
};

export type CompressOptions = {
  /** 0–100, reported while the compressor iterates. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * Resize to at most {@link IMAGE_MAX_EDGE} on the long edge, re-encode as WebP
 * and aim for {@link IMAGE_TARGET_BYTES}.
 *
 * EXIF orientation is read from the source and handed to the compressor, which
 * bakes the rotation into the canvas — the output has no EXIF block, so a
 * portrait phone photo stays portrait everywhere.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const { default: imageCompression } = await import(
    "browser-image-compression"
  );

  let exifOrientation = 1;
  try {
    exifOrientation = await imageCompression.getExifOrientation(file);
  } catch {
    // No EXIF block (PNG, WebP, a screenshot) — the default is correct.
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: IMAGE_TARGET_BYTES / (1024 * 1024),
    maxWidthOrHeight: IMAGE_MAX_EDGE,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.82,
    exifOrientation,
    preserveExif: false,
    onProgress: options.onProgress,
    signal: options.signal,
  });

  const { width, height } = await readImageSize(compressed);

  return {
    file: compressed,
    mime: normalizeMime(compressed.type) || "image/webp",
    sizeBytes: compressed.size,
    width,
    height,
  };
}

/** Intrinsic pixel size of an image blob, after orientation has been applied. */
export async function readImageSize(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `image/webp` -> `webp`. Used to build the object name. */
export function extensionForMime(mime: string): string {
  switch (normalizeMime(mime)) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "audio/webm":
      return "webm";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    default:
      return "bin";
  }
}
