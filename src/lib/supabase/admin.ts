import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db.types";

import { supabaseServiceRoleKey, supabaseUrl } from "./env";

/**
 * Service-role Supabase client. It bypasses RLS, so:
 *   - only import it from Server Actions / Route Handlers,
 *   - always re-check ownership yourself before reading or writing,
 *   - never return raw rows from it to the browser.
 *
 * `import "server-only"` makes a client-side import a build error.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export type AdminClient = ReturnType<typeof createAdminClient>;
