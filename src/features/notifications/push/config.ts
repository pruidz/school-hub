import "server-only";

/**
 * VAPID configuration for Web Push.
 *
 * Three environment variables, all of them already present in `.env.local` and
 * on Vercel for every environment:
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   the application server key the browser
 *                                  passes to `pushManager.subscribe()`. Public
 *                                  by definition — it ships in the client
 *                                  bundle and is readable by anyone.
 *   VAPID_PRIVATE_KEY              signs the JWT that proves to the push
 *                                  service we are the same application server.
 *                                  Server only. Never imported from a client
 *                                  component; `server-only` above makes that a
 *                                  build error rather than a leak.
 *   VAPID_SUBJECT                  a mailto:/https: contact the push service
 *                                  can use if we start misbehaving. Required
 *                                  by RFC 8292.
 *
 * Push is deliberately a soft dependency: `isPushConfigured()` lets the
 * delivery path and the settings screen degrade to "not available" instead of
 * throwing on a deploy where the keys are absent. Everything else in the app
 * keeps working.
 */

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** The browser-facing key, or `null` when push is not configured. */
export function vapidPublicKey(): string | null {
  // Read as a literal `process.env.X` so the Next bundler can inline it.
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}

/** The full triple, or `null` when any part of it is missing. */
export function vapidConfig(): VapidConfig | null {
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}
