import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

import type { Database } from "@/lib/db.types";

import { supabaseAnonKey, supabaseUrl } from "./env";

export type SessionRefresh = {
  /**
   * Response carrying the refreshed auth cookies. Any redirect built in the
   * middleware must copy these cookies over, or the refreshed session is lost.
   */
  response: NextResponse;
  user: User | null;
  supabase: ReturnType<typeof createServerClient<Database>>;
};

/**
 * Refresh the Supabase session for an incoming request and return a response
 * that carries the rotated cookies.
 */
export async function updateSession(
  request: NextRequest,
): Promise<SessionRefresh> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be `getUser()` — it revalidates the JWT with Supabase Auth.
  // `getSession()` trusts the cookie and is not safe for authorization.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}

/**
 * Copy the refreshed auth cookies onto a redirect response so the rotated
 * refresh token is not dropped.
 */
export function withRefreshedCookies(
  target: NextResponse,
  source: NextResponse,
): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}
