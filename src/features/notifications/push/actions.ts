"use server";

/**
 * The write surface of Web Push: register this browser, forget a browser, and
 * "send me one so I believe you".
 *
 * Guard order is the house order — who is calling, then zod, then the write.
 * Every action resolves the user from the cookie-bound server client, so a
 * `user_id` never comes from the browser even though the browser is the only
 * thing that knows the endpoint.
 *
 * Nothing here ever logs an endpoint, a p256dh or an auth key. An endpoint is a
 * capability: anyone holding it can make that device buzz.
 */

import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/auth/result";
import { getSessionUser } from "@/lib/auth/session";
import { ka } from "@/lib/i18n/ka";
import { createClient } from "@/lib/supabase/server";

import { isPushConfigured } from "./config";
import { pushSubscriptionSchema } from "./endpoint";
import { listOwnPushDevices } from "./queries";
import { pushToUserId } from "./send";
import { saveSubscription } from "./store";
import type { PushDeviceList } from "./types";

const removeSchema = z.object({ id: z.uuid() });

const refreshSchema = z.object({
  endpoint: z.string().min(8).max(2000).nullable(),
});

/**
 * Register (or re-register) the calling browser.
 *
 * Idempotent by construction: the upsert keys on `endpoint`, so pressing
 * "enable" twice, or re-subscribing after a browser restart, updates one row
 * rather than accumulating a column of identical devices.
 */
export async function subscribeDeviceAction(
  input: z.input<typeof pushSubscriptionSchema>,
): Promise<ActionResult<PushDeviceList>> {
  const user = await getSessionUser();
  if (!user) return fail(ka.errors.generic);

  if (!isPushConfigured()) return fail(ka.push.stateUnsupported);

  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail(ka.push.errGeneric);

  const saved = await saveSubscription(user.id, parsed.data);
  if (!saved) return fail(ka.push.errGeneric);

  return ok(await listOwnPushDevices(parsed.data.endpoint));
}

/**
 * Forget one device.
 *
 * Through the user-scoped client on purpose: `push_subscriptions_own_delete` is
 * the guard, so an id belonging to anybody else simply matches no row. The
 * caller cannot tell "not yours" from "already gone", which is the right amount
 * to tell them.
 */
export async function removeDeviceAction(
  input: z.input<typeof removeSchema>,
): Promise<ActionResult<PushDeviceList>> {
  const user = await getSessionUser();
  if (!user) return fail(ka.errors.generic);

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return fail(ka.push.errGeneric);

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("push.remove failed", { code: error.code });
    return fail(ka.push.errGeneric);
  }

  return ok(await listOwnPushDevices(null));
}

/**
 * The device list as it stands. `null` — not an empty list — when nobody is
 * signed in, so the UI can tell "no devices" from "your session expired" and
 * keep what it has on screen, the same contract the bell uses.
 */
export async function refreshDevicesAction(
  input: z.input<typeof refreshSchema>,
): Promise<PushDeviceList | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const parsed = refreshSchema.safeParse(input);
  if (!parsed.success) return null;

  return listOwnPushDevices(parsed.data.endpoint);
}

/**
 * "Send me one so I believe you."
 *
 * The single most important button on the screen: without it nobody finds out
 * whether push works until the evening it was supposed to and did not.
 *
 * Bypasses `notifications` entirely — a test buzz is not an event in the
 * family's history and has no business in the bell — and therefore carries no
 * `pushed_at` bookkeeping. `pushToUserId` still reaps a dead subscription on a
 * 404/410, so pressing this also tidies up after a phone that was wiped.
 */
export async function sendTestPushAction(): Promise<ActionResult<null>> {
  const user = await getSessionUser();
  if (!user) return fail(ka.errors.generic);

  if (!isPushConfigured()) return fail(ka.push.stateUnsupported);

  const isChild = user.role === "child";

  const delivered = await pushToUserId(user.id, {
    title: ka.push.testTitle,
    body: isChild ? ka.push.kidTestBody : ka.push.testBody,
    url: isChild ? "/kid" : "/parent",
    tag: "school-hub:test",
    notificationId: null,
  });

  if (delivered === 0) return fail(ka.push.errNoDevice);
  return ok(null);
}
