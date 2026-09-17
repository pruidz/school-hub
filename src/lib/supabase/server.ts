import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/db.types";

import { supabaseAnonKey, supabaseUrl } from "./env";

/** ~13 months — children stay signed in on their own device. */
const LONG_LIVED_MAX_AGE = 60 * 60 * 24 * 400;

export type ServerClientOptions = {
  /**
   * Write session cookies with a long `Max-Age`. Used by the child sign-in
   * actions so a kid does not have to re-enter a PIN after every browser
   * restart.
   */
  longLived?: boolean;
};

/**
 * Cookie-bound Supabase client for Server Components, Route Handlers and
 * Server Actions. Runs with the anon key, so every query is still subject to
 * RLS for the signed-in user.
 */
export async function createClient(options: ServerClientOptions = {}) {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookieOptions: options.longLived ? { maxAge: LONG_LIVED_MAX_AGE } : {},
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options: cookieOptions } of cookiesToSet) {
            cookieStore.set(name, value, cookieOptions);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // `src/middleware.ts` refreshes the session instead, so this is safe
          // to ignore.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
