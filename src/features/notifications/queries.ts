import "server-only";

/**
 * Reading the signed-in user's notifications.
 *
 * `notifications` is the one table in the app whose RLS is purely personal:
 * `user_id = auth.uid()` for SELECT, UPDATE and DELETE, and no INSERT policy at
 * all (0004, hardened in 0009). The `.eq("user_id", …)` below is therefore
 * redundant against RLS and present on purpose — the same belt-and-braces the
 * rest of the codebase applies before any write.
 */

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { parseNotificationPayload, notificationTypeOf } from "./payload";
import { EMPTY_FEED, type NotificationFeed, type NotificationItem } from "./types";

/** The popover shows a page, not an archive. */
export const NOTIFICATION_PAGE_SIZE = 20;

/**
 * Newest notifications plus the true unread total.
 *
 * Two round trips: one for the page, one for the count. The count is a `head`
 * request, so the rows never travel — a user with 400 unread rows still pays
 * for 20.
 */
export async function getNotificationFeed(
  limit = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationFeed> {
  const user = await getSessionUser();
  if (!user) return EMPTY_FEED;

  const supabase = await createClient();
  const page = Math.min(Math.max(1, Math.floor(limit)), 50);

  const [{ data: rows }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, payload, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(page),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  const items: NotificationItem[] = [];
  for (const row of rows ?? []) {
    const type = notificationTypeOf(row.type);
    // A row of an unknown type is a row written by a newer deploy than this
    // bundle. Skipping it is better than rendering an empty card.
    if (!type) continue;
    items.push({
      id: row.id,
      type,
      createdAt: row.created_at,
      readAt: row.read_at,
      payload: parseNotificationPayload(row.payload),
    });
  }

  return { viewerId: user.id, items, unreadCount: count ?? 0 };
}

/** Just the badge number, for a Server Component that only needs the count. */
export async function getUnreadNotificationCount(): Promise<number> {
  const user = await getSessionUser();
  if (!user) return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}
