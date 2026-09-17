"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db.types";

import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Browser Supabase client. Use it only for realtime subscriptions and reads
 * that must live in a client component — all writes go through Server Actions.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}

export type BrowserClient = ReturnType<typeof createClient>;
