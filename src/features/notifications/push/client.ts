/**
 * The browser half of Web Push.
 *
 * Plain functions, no React: the component below owns the state machine, this
 * file owns the browser quirks. Imported only from Client Components.
 *
 * ---------------------------------------------------------------------------
 * THE TWO RULES THAT DECIDE WHETHER ANY OF THIS WORKS
 *
 * 1. THE PROMPT MUST COME FROM A USER GESTURE.
 *    `Notification.requestPermission()` called on load is denied — often
 *    permanently, by a browser that has learned to auto-block sites that ask
 *    before saying why, and with no way back except the user digging into site
 *    settings. So nothing here runs on mount except `readPushState()`, which
 *    asks no questions, and `subscribeThisBrowser()` must be the FIRST await in
 *    a click handler: an `await` before it ends the user activation and Safari
 *    will refuse.
 *
 * 2. ON iOS THE PROMPT ONLY EXISTS INSIDE A HOME-SCREEN INSTALL.
 *    In mobile Safari, `window.Notification` and `PushManager` are not merely
 *    restricted, they are absent, and `requestPermission` therefore does
 *    nothing at all — no prompt, no error, no console line. Since iOS 16.4 the
 *    same page added to the Home Screen and opened from there gets the full
 *    API. Detecting that is the difference between a button that explains
 *    itself and a button that silently does nothing, so `readPushState()`
 *    reports `needs-install` rather than `unsupported` and the UI says what to
 *    do about it.
 */

import type { PushSubscriptionInput } from "./types";

/* -------------------------------------------------------------------------- */
/*  environment                                                                */
/* -------------------------------------------------------------------------- */

/**
 * iPhone, iPad or iPod — including an iPad in desktop mode, which reports a
 * Macintosh user agent and gives itself away only by having a touch screen.
 * A real Mac has `maxTouchPoints === 0`.
 */
export function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** Launched from the Home Screen / installed, rather than from a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // Safari's own pre-standard flag, which is still the only one iOS sets.
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true
  );
}

/** Every API the flow needs, present. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/* -------------------------------------------------------------------------- */
/*  state                                                                      */
/* -------------------------------------------------------------------------- */

export type PushAvailability =
  /** Not determined yet — the first paint, before the effect has run. */
  | "checking"
  /** This browser will never do it. */
  | "unsupported"
  /** iOS in a tab: add to the Home Screen and it becomes possible. */
  | "needs-install"
  /** The user said no. Only site settings can undo this; we must not re-ask. */
  | "blocked"
  /** Possible, and not on. */
  | "off"
  /** Permission granted and a live subscription exists in this browser. */
  | "on";

export type PushState = {
  state: PushAvailability;
  /** This browser's endpoint, when it has one. Never rendered. */
  endpoint: string | null;
};

/**
 * What this browser can do, asking the user nothing.
 *
 * Safe to call on mount — that is the point. The iOS check comes first,
 * deliberately: in mobile Safari the support check would report `unsupported`,
 * which is true of the tab and false of the app, and telling somebody their
 * iPhone cannot do this when it can is the worst available answer.
 */
export async function readPushState(): Promise<PushState> {
  if (typeof window === "undefined") return { state: "checking", endpoint: null };

  if (isIosLike() && !isStandalone()) {
    return { state: "needs-install", endpoint: null };
  }
  if (!pushSupported()) return { state: "unsupported", endpoint: null };

  if (Notification.permission === "denied") {
    return { state: "blocked", endpoint: null };
  }
  if (Notification.permission !== "granted") {
    return { state: "off", endpoint: null };
  }

  // Granted is not the same as subscribed: site data can be cleared, or the
  // subscription dropped, while the permission survives.
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription
      ? { state: "on", endpoint: subscription.endpoint }
      : { state: "off", endpoint: null };
  } catch {
    return { state: "off", endpoint: null };
  }
}

/* -------------------------------------------------------------------------- */
/*  subscribe / unsubscribe                                                    */
/* -------------------------------------------------------------------------- */

export type SubscribeOutcome =
  | { ok: true; subscription: PushSubscriptionInput }
  | { ok: false; reason: "denied" | "unsupported" | "needs-install" | "failed" };

/** VAPID keys travel as base64url; `subscribe()` wants bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The service worker, registered if it was not already.
 *
 * `/sw.js` is mounted by the kid layout, but the parent's shell does not mount
 * it and the parent needs push at least as much as the child does. Registering
 * here means enabling push is self-sufficient on any screen, and a registration
 * persists across reloads, so this costs one call on the first enable and
 * nothing afterwards.
 */
async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }
  // `register()` resolves before the worker is active; `subscribe()` needs it
  // active.
  return navigator.serviceWorker.ready;
}

/**
 * Ask for permission and subscribe this browser.
 *
 * MUST be the first `await` in a click handler — see rule 1 at the top of the
 * file. Returns the fields the server needs; the caller sends them on.
 */
export async function subscribeThisBrowser(
  vapidPublicKey: string,
): Promise<SubscribeOutcome> {
  if (isIosLike() && !isStandalone()) {
    return { ok: false, reason: "needs-install" };
  }
  if (!pushSupported()) return { ok: false, reason: "unsupported" };

  // Nothing above this line awaits, so the user activation is still live.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const registration = await ensureRegistration();

    let subscription = await registration.pushManager.getSubscription();

    // A subscription made against a different application server key cannot be
    // pushed to with this one. That happens on a key rotation, and the only
    // cure is to drop it and ask for a new one.
    if (subscription) {
      const existingKey = subscription.options?.applicationServerKey;
      if (existingKey && toBase64Url(existingKey) !== vapidPublicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        // Required by every browser, and honest: every push we send shows a
        // notification. A silent push would get the subscription revoked.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON();
    const endpoint = json.endpoint ?? subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) return { ok: false, reason: "failed" };

    return {
      ok: true,
      subscription: {
        endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent.slice(0, 400),
      },
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Drop this browser's subscription locally. Returns the endpoint that went
 * away so the caller can delete the matching row, or `null` if there was none.
 *
 * Local first, server second: if the server call then fails, the worst outcome
 * is a stale row, and the first push to it comes back 410 and reaps itself.
 * The other order would leave a browser subscribed with nothing listening.
 */
export async function unsubscribeThisBrowser(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return null;
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}
