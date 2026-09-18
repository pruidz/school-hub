"use server";

/**
 * The bell's server surface.
 *
 * The bell lives inside the shells, which are Client Components, so it cannot
 * be an RSC and has to fetch for itself. It does that through these actions
 * rather than by querying Supabase from the browser, for the usual reason: the
 * cookie-bound server client is the only place `getSessionUser()` is
 * trustworthy, and it keeps the client surface to "call a function, render the
 * result".
 *
 * Writes are ownership-checked twice — `.eq("user_id", user.id)` here, and the
 * `user_id = auth.uid()` policy from 0004 underneath. A client cannot mark
 * somebody else's notification read, and cannot create one at all: 0009 revokes
 * INSERT outright and there is no INSERT policy to fall back on.
 */

import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

import { getNotificationFeed, NOTIFICATION_PAGE_SIZE } from "./queries";
import { type NotificationFeed } from "./types";

/**
 * The whole feed. Returns `null` — not an empty feed — when nobody is signed
 * in, so the bell can tell "you have nothing" from "your session expired" and
 * keep showing what it already had instead of blanking.
 */
export async function loadNotificationsAction(): Promise<NotificationFeed | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return getNotificationFeed(NOTIFICATION_PAGE_SIZE);
}

const markOneSchema = z.object({ id: z.uuid() });

export async function markNotificationReadAction(
  input: z.input<typeof markOneSchema>,
): Promise<ActionResult<NotificationFeed | null>> {
  const parsed = markOneSchema.safeParse(input);
  if (!parsed.success) return fail(ka.errors.generic);

  const user = await getSessionUser();
  if (!user) return fail(ka.errors.generic);

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return fail(ka.errors.generic);

  return ok(await getNotificationFeed(NOTIFICATION_PAGE_SIZE));
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<NotificationFeed | null>
> {
  const user = await getSessionUser();
  if (!user) return fail(ka.errors.generic);

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return fail(ka.errors.generic);

  return ok(await getNotificationFeed(NOTIFICATION_PAGE_SIZE));
}
