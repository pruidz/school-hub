import "server-only";

/**
 * Posting an envelope to one user's devices, and reaping the dead ones.
 *
 * This module is the only place in the app that talks to a push service. It
 * decides nothing about WHO should be told — 0009/0011 already did that, in
 * SQL, once — and nothing about WHAT the message says beyond serialising it.
 * It takes "this user, this envelope" and makes phones buzz.
 *
 * Two rules run through all of it:
 *
 *   1. Never log an endpoint, a p256dh or an auth key. An endpoint is a
 *      capability — anyone holding it can push to that device — and a log line
 *      is the easiest place in a system to read. Failures are logged as a
 *      status code and a row id, which is everything an operator needs and
 *      nothing an attacker does.
 *
 *   2. Never throw at the caller. Delivery runs in `after()`, past the point
 *      where the user's action has already succeeded; an exception here must
 *      not turn a handed-in piece of homework into a red toast.
 */

import { sendNotification, setVapidDetails, WebPushError } from "web-push";

import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

import { vapidConfig } from "./config";
import type { PushEnvelope } from "./types";

/**
 * `setVapidDetails` mutates module-level state in web-push, so it is applied
 * once per server instance rather than per send. Returns false when push is not
 * configured, which is the whole of the "degrade quietly" path.
 */
let vapidApplied = false;

function ensureVapid(): boolean {
  if (vapidApplied) return true;

  const config = vapidConfig();
  if (!config) return false;

  setVapidDetails(config.subject, config.publicKey, config.privateKey);
  vapidApplied = true;
  return true;
}

type DeviceRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

/**
 * A subscription the push service has told us is gone.
 *
 * 404 — the endpoint never existed or was garbage collected.
 * 410 Gone — the browser unsubscribed, the app was deleted, the user wiped
 *            site data. The RFC is explicit that this is permanent.
 *
 * Anything else (429 rate limit, 500, a network blip) is transient and the row
 * is kept: deleting on a 503 would quietly unsubscribe a working phone the
 * first time a push service had a bad afternoon.
 */
function isGone(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

async function reap(admin: AdminClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .in("id", ids);
  if (error) {
    console.error("push.reap failed", { count: ids.length, code: error.code });
  }
}

/**
 * Push `envelope` to every device belonging to `userId`.
 *
 * Returns the number of devices that accepted it. Zero is an ordinary answer —
 * the user may simply not have turned push on — and is never an error.
 *
 * The admin client is required rather than optional: the recipient is by
 * definition somebody other than the caller (0009 never notifies you about your
 * own action), so a cookie-scoped client would correctly see no rows at all.
 * The user id is always derived server-side, never taken from a browser.
 */
export async function pushToUser(
  admin: AdminClient,
  userId: string,
  envelope: PushEnvelope,
): Promise<number> {
  if (!ensureVapid()) return 0;

  const { data: devices, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (error) {
    console.error("push.devices failed", { code: error.code });
    return 0;
  }
  if (!devices || devices.length === 0) return 0;

  const payload = JSON.stringify(envelope);
  const dead: string[] = [];
  let delivered = 0;

  // Sequential would make a parent with three devices wait three round trips
  // inside `after()`, which on a serverless platform is billed time. They are
  // independent posts to independent services; fan them out.
  await Promise.all(
    (devices as DeviceRow[]).map(async (device) => {
      try {
        await sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth_key },
          },
          payload,
          {
            // A homework notification is worthless tomorrow.
            TTL: 60 * 60 * 6,
            urgency: "high",
          },
        );
        delivered += 1;
      } catch (cause) {
        if (cause instanceof WebPushError && isGone(cause.statusCode)) {
          dead.push(device.id);
          return;
        }
        console.error("push.send failed", {
          subscriptionId: device.id,
          statusCode: cause instanceof WebPushError ? cause.statusCode : null,
        });
      }
    }),
  );

  await reap(admin, dead);
  return delivered;
}

/** Convenience wrapper for callers that do not already hold an admin client. */
export async function pushToUserId(
  userId: string,
  envelope: PushEnvelope,
): Promise<number> {
  return pushToUser(createAdminClient(), userId, envelope);
}
