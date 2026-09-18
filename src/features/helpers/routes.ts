/**
 * Paths in the helper area.
 *
 * Pure module with no imports, so a Client Component can use it. It exists
 * because `@/lib/auth/helper` is `server-only` and the acceptance form —
 * necessarily a client component — needs somewhere to redirect to.
 */

/** Where a signed-in helper lands. */
export const HELPER_HOME = "/helper";

/** The path a parent copies out of `/parent/helpers`. */
export function helperInvitePath(token: string): string {
  return `${HELPER_HOME}/invite/${token}`;
}
