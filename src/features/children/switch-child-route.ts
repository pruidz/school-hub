import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  ACTIVE_CHILD_COOKIE,
  ACTIVE_CHILD_COOKIE_MAX_AGE,
} from "@/lib/auth/active-child";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { isChildId } from "./child-scope";

/**
 * "Open /parent/schedule (or /parent/reports) for *this* child."
 *
 * Both of those screens resolve their subject from the `sh_active_child`
 * cookie — the same one the shell's switcher writes — and neither takes a
 * `?child=`. Rather than duplicate either screen inside P4, the forwarding tabs
 * point at a route handler that sets the cookie and redirects, which is the one
 * place a cookie may be written during a GET.
 *
 * The id is re-checked through the user-scoped client first: RLS decides
 * whether this parent may see the child at all, and a miss falls back to the
 * children list instead of pointing another family's id at the cookie.
 */
export async function switchChildAndRedirect(
  request: NextRequest,
  childId: string,
  target: string,
): Promise<NextResponse> {
  await requireParent();

  const supabase = await createClient();
  const { data } = isChildId(childId)
    ? await supabase
        .from("children")
        .select("id")
        .eq("id", childId)
        .maybeSingle()
    : { data: null };

  if (!data) {
    return NextResponse.redirect(new URL("/parent/children", request.url));
  }

  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.set(ACTIVE_CHILD_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_CHILD_COOKIE_MAX_AGE,
  });

  return response;
}
