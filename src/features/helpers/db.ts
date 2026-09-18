import "server-only";

/**
 * The typed client for the two relations migration 0010 adds.
 *
 * `src/lib/db.types.ts` is generated and A1 owns it, so `helper_invitations`
 * and `helper_children` are not in `Database` yet. Rather than sprinkle `as
 * never` over every query, the cast is made exactly once, here, against the
 * hand-written shapes in `./types.ts`.
 *
 * The cast is unsound in the usual sense — nothing checks these shapes against
 * the real schema — which is why the shapes live beside the migration that
 * created them and why the report asks for the generated file to be updated.
 * `supabase/test/rls.test.mjs` is what actually checks the SQL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminClient } from "@/lib/supabase/admin";
import type { ServerClient } from "@/lib/supabase/server";

import type { HelperDatabase } from "./types";

export type HelperAwareClient = SupabaseClient<HelperDatabase, "public">;

/** Re-type a client so the 0010 relations are visible to it. */
export function helperDb(client: ServerClient | AdminClient): HelperAwareClient {
  return client as unknown as HelperAwareClient;
}
