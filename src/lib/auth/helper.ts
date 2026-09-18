import "server-only";

/**
 * Guards for the helper role (migration 0010).
 *
 * Two of them exist because `requireParent()` in `./session.ts` deliberately
 * admits `helper` — `/parent/*` and `/helper/*` share the same middleware
 * predicate (`isParentPath`), and the session helper was written before the
 * helper role had an area of its own.
 *
 *   requireStrictParent()  a real parent, for anything a helper must never do.
 *                          Use it on every page and action under
 *                          `/parent/helpers`. `requireParent()` would let a
 *                          helper load the page, RLS would hand back an empty
 *                          list, and the buttons would fail one by one — which
 *                          is exactly the failure mode this role is supposed to
 *                          avoid.
 *   requireHelper()        an active helper, with the children and rights they
 *                          actually hold, read from the database and never from
 *                          the request.
 *
 * Nothing here is the security boundary. RLS is (0010). These functions decide
 * what to render and turn a denial into a Georgian sentence instead of an
 * opaque Postgres error.
 */

import { cache } from "react";
import { redirect } from "next/navigation";

import { HELPER_HOME } from "@/features/helpers/routes";
import { createClient } from "@/lib/supabase/server";

import { homePathForRole } from "./roles";
import { getSessionUser, requireParent, type ParentSession } from "./session";

/** Re-exported so server-side callers have one import for the helper guards. */
export { HELPER_HOME };

export type HelperRights = {
  /** Always true for an active helper; listed so call sites can be explicit. */
  canView: true;
  canComment: boolean;
  canReview: boolean;
};

export type HelperScope = HelperRights & {
  familyId: string;
  /** Child ids the helper may see. Never empty for an active helper. */
  childIds: string[];
};

export type HelperSession = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: "helper";
  scope: HelperScope;
};

type MembershipRow = {
  family_id: string;
  permissions: unknown;
};

/**
 * Read one helper membership row for the signed-in user.
 *
 * `family_members_select` (0010) narrows a helper to their own row, so this
 * query cannot return anybody else's. The permissions are parsed defensively:
 * the column is jsonb and nothing at the type level stops a future writer from
 * putting a string in `children`.
 */
function parseScope(row: MembershipRow): HelperScope | null {
  const permissions =
    typeof row.permissions === "object" && row.permissions !== null
      ? (row.permissions as Record<string, unknown>)
      : {};

  if (typeof permissions.revoked_at === "string") return null;

  const listed = Array.isArray(permissions.children) ? permissions.children : [];
  const childIds = listed.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (childIds.length === 0) return null;

  return {
    familyId: row.family_id,
    childIds,
    canView: true,
    canComment: permissions.can_comment === true,
    canReview: permissions.can_review === true,
  };
}

/**
 * The signed-in user's helper scope, or `null` when they are not an active
 * helper. Does not redirect — used by layouts that must decide what to render.
 */
export const getHelperScope = cache(async (): Promise<HelperScope | null> => {
  const user = await getSessionUser();
  if (!user || user.role !== "helper") return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("family_members")
    .select("family_id, permissions")
    .eq("user_id", user.id)
    .eq("role", "helper")
    .order("created_at", { ascending: true });

  for (const row of data ?? []) {
    const scope = parseScope(row);
    if (scope) return scope;
  }
  return null;
});

/**
 * Page-level guard for `/helper/*`.
 *
 * A signed-in user who is not a helper is sent to their own home. A helper
 * whose grant has been revoked keeps a valid session — they just have nothing
 * left — so they are sent to the sign-in screen rather than shown an area with
 * no content in it.
 */
export const requireHelper = cache(async (): Promise<HelperSession> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "helper") redirect(homePathForRole(user.role));

  const scope = await getHelperScope();
  if (!scope) redirect("/login");

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: "helper",
    scope,
  };
});

/** Is this child inside the helper's grant? Checked before every read/write. */
export function helperSees(scope: HelperScope, childId: string): boolean {
  return scope.childIds.includes(childId);
}

/**
 * A parent and only a parent.
 *
 * `requireParent()` resolves the role but admits `helper`; this redirects a
 * helper to their own area before the page renders anything. Every server
 * action under `/parent/helpers` pairs this with `guardParentWrite()`, which
 * returns a Georgian failure rather than redirecting.
 */
export const requireStrictParent = cache(async (): Promise<ParentSession> => {
  const parent = await requireParent();
  if (parent.role !== "parent") redirect(HELPER_HOME);
  return parent;
});
