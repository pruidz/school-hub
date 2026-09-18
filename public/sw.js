/*
 * Service worker for the SCHOOL-HUB PWA. No Workbox, no build step.
 *
 *  - Precaches the app shell assets (icons, manifest, offline page).
 *  - Navigations are network-first; if the network fails, the offline shell is
 *    served so the PWA never shows the browser's dinosaur.
 *  - Static assets under /_next/static and /icons are cache-first, because
 *    their URLs are content-hashed or stable.
 *  - Nothing authenticated is ever cached: HTML responses and API/action
 *    requests are not stored, so one child's data cannot be replayed to
 *    another on a shared device.
 *  - Web Push: `push` renders the notification the server already composed,
 *    `notificationclick` opens or focuses the right screen, and
 *    `pushsubscriptionchange` re-registers when the browser rotates the
 *    subscription underneath us.
 *
 * The only human-readable string in this file is the brand name, used when a
 * push somehow arrives with no payload. Everything a user actually reads is
 * composed on the server from src/lib/i18n/ka.ts and arrives in the payload, so
 * this file never has to be translated.
 */

// v3: the icons were regenerated under the same filenames, so an installed
// client keeps the old placeholders until the cache name changes.
const VERSION = "school-hub-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
  "/apple-touch-icon.png",
];

const FALLBACK_TITLE = "SCHOOL-HUB";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("offline", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";

  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

/* ========================================================================== */
/*  Web Push                                                                   */
/* ========================================================================== */

/**
 * The envelope the server sends (src/features/notifications/push/types.ts):
 *
 *   { title, body, url, tag, notificationId }
 *
 * Everything needed to render is in there, denormalised by the database
 * trigger in migration 0009 — child's name, subject, preview. The worker makes
 * no network call: a push that arrives on a locked phone with a bad connection
 * still shows the right sentence.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" && data.title ? data.title : FALLBACK_TITLE;
  const body = typeof data.body === "string" ? data.body : "";
  const url = typeof data.url === "string" && data.url ? data.url : "/";
  // One tag per assignment. A second notification about the same homework
  // REPLACES the first on the lock screen instead of stacking under it, and
  // with renotify left false it does so without a second sound or vibration.
  // That is the client-side half of "three messages are not three buzzes"; the
  // server-side half is notifications.pushed_at (migration 0014).
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "school-hub";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: false,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "ka",
      data: { url },
    }),
  );
});

/**
 * Focus an open window if there is one, otherwise open a new one.
 *
 * `url` was computed on the server by `notificationHref()`, so the routing
 * rules — a message opens the thread, a submission opens the review screen, a
 * child always lands on the assignment page — live in exactly one place and
 * this worker never has to know them.
 *
 * `client.navigate()` is unimplemented in Safari, including the iOS Home-Screen
 * app. It is attempted and allowed to fail: the window is focused either way,
 * which is the part that matters, and the user is one tap from the bell.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const raw = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(raw, self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const ours = windows.filter((client) => {
        try {
          return new URL(client.url).origin === target.origin;
        } catch {
          return false;
        }
      });

      // Prefer a window already showing the destination: focusing it is
      // instant and loses no unsent draft.
      const exact = ours.find((client) => client.url === target.href);
      const chosen = exact ?? ours[0];

      if (chosen) {
        await chosen.focus();
        if (!exact && typeof chosen.navigate === "function") {
          try {
            await chosen.navigate(target.href);
          } catch {
            /* Safari: focus is as far as we get. */
          }
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * The browser rotated the subscription.
 *
 * Push services expire endpoints, and a browser may replace one without asking.
 * When that happens the old endpoint is dead — our next send gets a 410 and the
 * row is reaped — so the device would go quiet forever unless it re-registers
 * itself here.
 *
 * The application server key is taken from the old subscription where the
 * browser provides it, and fetched from `/api/push/key` where it does not. The
 * POST carries the page's cookies (a same-origin fetch from a worker does), so
 * the route can identify the user without this worker ever holding a token. If
 * the session has expired there is nothing to be done from here; the next visit
 * to the settings screen re-subscribes.
 *
 * Safari does not fire this event at all — see the report; on iOS the recovery
 * path is opening the app, which re-syncs.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let key = event.oldSubscription?.options?.applicationServerKey ?? null;

        if (!key) {
          const response = await fetch("/api/push/key");
          if (!response.ok) return;
          const body = await response.json();
          if (!body || typeof body.key !== "string") return;
          key = body.key;
        }

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });

        await fetch("/api/push/resubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            oldEndpoint: event.oldSubscription?.endpoint ?? null,
            subscription: subscription.toJSON(),
          }),
        });
      } catch {
        /* Nothing useful to do from a worker with no UI. */
      }
    })(),
  );
});
