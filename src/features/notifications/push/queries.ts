import "server-only";

/**
 * Reading the signed-in user's own devices.
 *
 * Read through the cookie-scoped client, so `push_subscriptions_own_select`
 * from 0014 is the decision and the `.eq("user_id", …)` below is the same
 * belt-and-braces the rest of the codebase applies. Nobody — not a parent, not
 * a helper — can reach another user's row here, by construction: there is no
 * family clause in that policy at all.
 *
 * `endpoint`, `p256dh` and `auth_key` are never selected. The settings screen
 * has no use for them and they must not exist in a payload that crosses to the
 * browser.
 */

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { describeDevice } from "./device-label";
import type { PushDeviceList } from "./types";

/** A user with more browsers than this has a different problem. */
const MAX_DEVICES_SHOWN = 20;

export async function listOwnPushDevices(
  currentEndpoint: string | null = null,
): Promise<PushDeviceList> {
  const user = await getSessionUser();
  if (!user) return { devices: [], currentId: null };

  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false })
    .limit(MAX_DEVICES_SHOWN);

  const rows = data ?? [];
  const current =
    currentEndpoint === null
      ? null
      : (rows.find((row) => row.endpoint === currentEndpoint)?.id ?? null);

  return {
    currentId: current,
    devices: rows.map((row) => ({
      id: row.id,
      label: describeDevice(row.user_agent),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    })),
  };
}
