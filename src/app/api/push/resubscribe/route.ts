import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isPushConfigured } from "@/features/notifications/push/config";
import {
  pushEndpointSchema,
  pushSubscriptionSchema,
} from "@/features/notifications/push/endpoint";
import {
  forgetEndpoint,
  saveSubscription,
} from "@/features/notifications/push/store";
import { getSessionUser } from "@/lib/auth/session";

/**
 * `pushsubscriptionchange`, landing.
 *
 * A service worker cannot call a Server Action, so the one thing it needs to
 * write gets a route of its own. Everything else about push goes through
 * `src/features/notifications/push/actions.ts`; this is deliberately the
 * narrowest possible second door — it can replace the caller's own
 * subscription and nothing else.
 *
 * AUTHENTICATION
 * A same-origin `fetch` from a service worker carries the page's cookies, so
 * `getSessionUser()` identifies the browser's owner exactly as it does in a
 * Server Action. The worker never holds a token of its own. When the session
 * has expired the answer is 401 and the device stays quiet until the next visit
 * re-subscribes it — which is the right failure: a worker that could
 * re-register without a live session would be a worker that could register a
 * device against a user who had signed out.
 *
 * The old endpoint is deleted only when it is the caller's, and the ownership
 * clause is written out because `forgetEndpoint` runs as the service role.
 */

const bodySchema = z.object({
  oldEndpoint: pushEndpointSchema.nullable(),
  subscription: z.object({
    endpoint: pushEndpointSchema,
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  if (!isPushConfigured()) return new NextResponse(null, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const fields = pushSubscriptionSchema.safeParse({
    endpoint: parsed.data.subscription.endpoint,
    p256dh: parsed.data.subscription.keys.p256dh,
    auth: parsed.data.subscription.keys.auth,
    // The worker has no `navigator.userAgent` worth trusting and the row
    // already carries the label from when the device first registered.
    userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
  });
  if (!fields.success) return new NextResponse(null, { status: 400 });

  const saved = await saveSubscription(user.id, fields.data);
  if (!saved) return new NextResponse(null, { status: 500 });

  const { oldEndpoint } = parsed.data;
  if (oldEndpoint && oldEndpoint !== fields.data.endpoint) {
    await forgetEndpoint(user.id, oldEndpoint);
  }

  return new NextResponse(null, { status: 204 });
}
