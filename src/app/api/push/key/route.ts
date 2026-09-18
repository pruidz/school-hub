import { NextResponse } from "next/server";

import { vapidPublicKey } from "@/features/notifications/push/config";

/**
 * The VAPID application server key, for `public/sw.js`.
 *
 * A service worker handling `pushsubscriptionchange` has to re-subscribe, and
 * re-subscribing needs the key. Chrome hands the old one back on the event;
 * others do not, so the worker falls back to this.
 *
 * Public by definition — the same value is inlined into every client bundle as
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and a VAPID public key is meant to be
 * published. It authorises nothing on its own: pushing requires the private
 * half, which never leaves the server.
 *
 * 404 rather than an empty body when push is not configured, so the worker's
 * `response.ok` check stops it dead instead of subscribing against "".
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = vapidPublicKey();
  if (!key) return new NextResponse(null, { status: 404 });

  return NextResponse.json(
    { key },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
