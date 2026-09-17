import "server-only";

/**
 * Server-side Storage primitives shared by the attachment and message actions.
 *
 * Kept out of the `"use server"` modules on purpose: everything exported from
 * one of those becomes a callable RPC endpoint, and neither of these should be.
 */

import { logDbError } from "@/features/assignments/errors";
import { normalizeMime } from "@/lib/images";
import type { ServerClient } from "@/lib/supabase/server";

import { EVIDENCE_BUCKET, basenameOf, directoryOf } from "./paths";

export type StorageFact = { sizeBytes: number; mime: string };

/**
 * The object's REAL size and mime, read back from Storage after the browser
 * claims to have written it. Runs on the user-scoped client, so an object the
 * caller may not see simply does not exist.
 */
export async function statObject(
  supabase: ServerClient,
  path: string,
): Promise<StorageFact | null> {
  const name = basenameOf(path);

  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .list(directoryOf(path), { limit: 100, search: name });

  if (error || !data) return null;

  const entry = data.find((item) => item.name === name);
  if (!entry) return null;

  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const size = typeof metadata.size === "number" ? metadata.size : null;
  if (size === null) return null;

  return {
    sizeBytes: size,
    mime:
      typeof metadata.mimetype === "string"
        ? normalizeMime(metadata.mimetype)
        : "",
  };
}

/** Best-effort cleanup. An orphan blob is invisible; an orphan row is not. */
export async function removeObjects(
  supabase: ServerClient,
  paths: string[],
): Promise<void> {
  const wanted = paths.filter(Boolean);
  if (wanted.length === 0) return;

  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .remove(wanted);

  if (error) logDbError("storage.remove", error);
}
