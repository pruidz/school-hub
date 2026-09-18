/**
 * Roles and the routing rules that follow from them.
 * Pure module — safe to import from client components and from middleware.
 */

export const APP_ROLES = ["parent", "child", "helper"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return (
    typeof value === "string" && (APP_ROLES as readonly string[]).includes(value)
  );
}

/** Where a signed-in user of this role belongs. */
export function homePathForRole(role: AppRole | null | undefined): string {
  switch (role) {
    case "child":
      return "/kid";
    case "helper":
      return "/helper";
    case "parent":
      return "/parent";
    default:
      return "/";
  }
}

/** Which sign-in screen an unauthenticated visitor to `pathname` should see. */
export function loginPathForPath(pathname: string): string {
  return isKidPath(pathname) ? "/kid-login" : "/login";
}

export function isKidPath(pathname: string): boolean {
  return pathname === "/kid" || pathname.startsWith("/kid/");
}

export function isParentPath(pathname: string): boolean {
  return pathname === "/parent" || pathname.startsWith("/parent/");
}

export function isHelperPath(pathname: string): boolean {
  return pathname === "/helper" || pathname.startsWith("/helper/");
}

/**
 * The one `/helper/*` screen that must stay reachable signed out: an invited
 * adult opens it before they have an account, let alone a helper role.
 */
export function isHelperInvitePath(pathname: string): boolean {
  return pathname.startsWith("/helper/invite/");
}

/** True when `role` is allowed to load `pathname`. */
export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (isKidPath(pathname)) return role === "child";
  if (isHelperInvitePath(pathname)) return true;
  if (isHelperPath(pathname)) return role === "helper";
  // Helpers used to be admitted here. They are not: every /parent screen is
  // built on queries a helper cannot run, so they would get a sidebar of links
  // to blank pages. They have their own area.
  if (isParentPath(pathname)) return role === "parent";
  return true;
}

/**
 * Role carried in the JWT. Set with the service-role client in
 * `app_metadata`, which a user cannot modify, so it is safe to trust.
 * Falls back to `null` for accounts created before it was populated —
 * callers then read `profiles.role` instead.
 */
export function roleFromClaims(claims: {
  app_metadata?: Record<string, unknown> | null;
}): AppRole | null {
  const value = claims.app_metadata?.role;
  return isAppRole(value) ? value : null;
}
