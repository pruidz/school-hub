"use server";

/**
 * Reading a private `evidence` object needs a signed URL.
 *
 * This is a Server Action module so the same helper works from a Server
 * Component (A3's lesson screen, the review screen) and from `PhotoGallery`,
 * which is a Client Component and cannot import `@/lib/supabase/server`.
 *
 * Scoping is Storage RLS, not code here: `createSignedUrls` runs on the
 * user-scoped client, so a path the caller may not read simply comes back with
 * an error and is dropped from the result.
 */

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { EVIDENCE_BUCKET, SIGNED_URL_TTL_SECONDS } from "./paths";

/** One page of a gallery is well under this; the cap stops a silly request. */
const MAX_PATHS_PER_CALL = 200;

/**
 * Batch-sign `paths`. One round trip regardless of how many paths are asked
 * for. Paths that do not exist, or that the caller may not read, are omitted
 * from the returned map rather than throwing.
 */
export async function getSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (!Array.isArray(paths) || paths.length === 0) return {};

  const unique = Array.from(
    new Set(
      paths.filter(
        (path): path is string =>
          typeof path === "string" && path.length > 0 && path.length <= 300,
      ),
    ),
  ).slice(0, MAX_PATHS_PER_CALL);

  if (unique.length === 0) return {};

  const user = await getSessionUser();
  if (!user) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const entry of data) {
    if (entry.error || !entry.path || !entry.signedUrl) continue;
    urls[entry.path] = entry.signedUrl;
  }
  return urls;
}

/** Convenience wrapper for a single object. */
export async function getSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const urls = await getSignedUrls([path]);
  return urls[path] ?? null;
}
