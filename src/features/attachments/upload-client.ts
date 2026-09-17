/**
 * Browser -> Storage upload with real progress.
 *
 * `supabase.storage.from().upload()` gives no progress events, and a parent
 * watching a phone upload six photos of a maths exercise needs to see that
 * something is happening. This posts the same request supabase-js would, over
 * XHR, so `upload.onprogress` is available.
 *
 * Authorisation is the signed-in user's access token, so Storage RLS applies
 * exactly as it would through the SDK — no service role, no signed upload URL.
 */

import { createClient } from "@/lib/supabase/client";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

import { EVIDENCE_BUCKET } from "./paths";

export class UploadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export type UploadArgs = {
  path: string;
  blob: Blob;
  mime: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function uploadObjectWithProgress({
  path,
  blob,
  mime,
  onProgress,
  signal,
}: UploadArgs): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) throw new UploadError("no session", 401);

  const endpoint = `${supabaseUrl()}/storage/v1/object/${EVIDENCE_BUCKET}/${encodePath(path)}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });

    xhr.open("POST", endpoint, true);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", supabaseAnonKey());
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new UploadError(readErrorMessage(xhr.responseText), xhr.status));
    };

    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new UploadError("network", 0));
    };

    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new UploadError("aborted", 0));
    };

    xhr.send(blob);
  });
}

function readErrorMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["message", "error", "statusCode"]) {
        const value = record[key];
        if (typeof value === "string" && value) return value;
      }
    }
  } catch {
    // Storage occasionally answers with plain text.
  }
  return body.slice(0, 200) || "upload failed";
}

/** Best-effort removal used when a later step of the handshake fails. */
export async function removeObjectFromBrowser(path: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
  } catch {
    // The server action retries this; nothing useful to do here.
  }
}
