import { NextResponse, type NextRequest } from "next/server";

import {
  canAccessPath,
  homePathForRole,
  isAppRole,
  isKidPath,
  isParentPath,
  loginPathForPath,
  roleFromClaims,
  type AppRole,
} from "@/lib/auth/roles";
import {
  updateSession,
  withRefreshedCookies,
} from "@/lib/supabase/middleware";

/**
 * Screens a signed-in user has no business being on. `/reset-password` is
 * deliberately absent: the Supabase recovery link signs the user in, and they
 * still need that form.
 */
const PARENT_AUTH_ENTRY_PATHS = new Set(["/", "/login", "/signup"]);

/**
 * Kid entry screens. A signed-in *child* may still open them — siblings share
 * a tablet and need to switch accounts or redeem a second invite code — but a
 * signed-in parent is sent back to their own side.
 */
const KID_AUTH_ENTRY_PATHS = new Set(["/join", "/kid-login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, supabase } = await updateSession(request);

  const guarded = isKidPath(pathname) || isParentPath(pathname);

  if (!user) {
    if (!guarded) return response;

    const url = request.nextUrl.clone();
    url.pathname = loginPathForPath(pathname);
    url.search = "";
    if (!isKidPath(pathname)) url.searchParams.set("next", pathname);
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  // Trust `app_metadata` (service-role only) first, fall back to the profile
  // row for accounts created before the claim existed.
  let role: AppRole | null = roleFromClaims(user);
  if (!role) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = isAppRole(profile?.role) ? profile.role : null;
  }

  // Signed in but not provisioned yet (e.g. email confirmed before the profile
  // row was written). Let the page-level guards deal with it.
  if (!role) return response;

  const home = homePathForRole(role);

  if (guarded && !canAccessPath(role, pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  const onParentEntry = PARENT_AUTH_ENTRY_PATHS.has(pathname);
  const onKidEntry = KID_AUTH_ENTRY_PATHS.has(pathname) && role !== "child";

  if (onParentEntry || onKidEntry) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    url.search = "";
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the PWA files and static assets.
     * Keeping the service worker and manifest out matters: they must stay
     * reachable while signed out.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icons/).*)",
  ],
};
