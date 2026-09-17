/**
 * The child a parent is currently looking at, remembered in a cookie so every
 * `/parent/*` screen (including the ones other agents own) can read the same
 * selection on the server:
 *
 *   const active = (await cookies()).get(ACTIVE_CHILD_COOKIE)?.value ?? null;
 */
export const ACTIVE_CHILD_COOKIE = "sh_active_child";

export const ACTIVE_CHILD_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
