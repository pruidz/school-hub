import "server-only";

/**
 * Writing `public.push_subscriptions`.
 *
 * WHY THE SERVICE ROLE
 * `endpoint` is unique across the whole table, because the endpoint IS the
 * browser. The awkward case is a device that changes hands: a child signs out
 * of the family phone and a parent signs in, the browser re-uses its existing
 * push subscription, and that endpoint now belongs to a different user. Through
 * the cookie-scoped client the `on conflict do update` would hit
 * `push_subscriptions_own_update`, fail its USING clause and raise — the parent
 * would press "enable", get an error, and no amount of pressing it again would
 * help.
 *
 * So the upsert runs as the service role with `user_id` taken from the session
 * and never from the request. That is the correct answer as well as the working
 * one: whoever is signed in on that browser is who that browser's endpoint
 * belongs to, and the previous owner's row must MOVE rather than linger and
 * keep delivering their family's homework to somebody else's lock screen.
 *
 * Reads and deletes stay on the user-scoped client, where RLS is the decision.
 */

import { createAdminClient } from "@/lib/supabase/admin";

import type { PushSubscriptionFields } from "./endpoint";

/** True on success. Never logs the endpoint or either key. */
export async function saveSubscription(
  userId: string,
  fields: PushSubscriptionFields,
): Promise<boolean> {
  const admin = createAdminClient();

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: fields.endpoint,
      p256dh: fields.p256dh,
      auth_key: fields.auth,
      user_agent: fields.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("push.subscribe failed", { code: error.code });
    return false;
  }
  return true;
}

/**
 * Forget an endpoint, but only if it is this user's.
 *
 * Used when the browser rotates a subscription: the old one is dead and its row
 * would otherwise sit there until the first 410 reaped it. The `user_id` clause
 * is the guard — the service role bypasses RLS, so the ownership check has to
 * be written out, exactly as `src/lib/supabase/admin.ts` insists.
 */
export async function forgetEndpoint(
  userId: string,
  endpoint: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) console.error("push.forget failed", { code: error.code });
}
