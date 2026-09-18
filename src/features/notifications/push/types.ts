/**
 * The Web Push contract, shared by the browser half and the server half.
 *
 * No `server-only` marker: the settings UI is a Client Component and needs
 * these shapes. Nothing secret is described here — in particular a
 * `PushDeviceView` deliberately has no endpoint and no keys. The endpoint is a
 * capability: whoever holds it can make that phone buzz, so it never travels
 * back out of the database, never reaches a log, and never reaches the DOM.
 */

/** One registered browser, as the settings screen sees it. */
export type PushDeviceView = {
  id: string;
  /** Short human label derived from the user agent, e.g. "iPhone · Safari". */
  label: string;
  createdAt: string;
  lastSeenAt: string;
};

/**
 * The device list plus which row is the browser asking.
 *
 * `currentId` is resolved on the server from the endpoint the caller sent, so
 * the browser never has to compare endpoints in the DOM and no other device's
 * endpoint is needed to work out which row says "this device".
 */
export type PushDeviceList = {
  devices: PushDeviceView[];
  currentId: string | null;
};

/**
 * What the service worker receives in `event.data`.
 *
 * Deliberately flat and deliberately complete: the trigger in 0009 already
 * denormalised the child's name, the subject and a preview into the
 * notification row, so the phone can render the whole thing with no network
 * call, offline, from a locked screen.
 *
 * `url` is computed on the server by `notificationHref()`, so the routing rules
 * live in exactly one place and `public/sw.js` never has to know that a message
 * opens `/parent/chat/:id` while a submission opens `/parent/review/:id`.
 *
 * `tag` is per assignment. Two notifications about the same homework replace
 * each other on the lock screen instead of stacking.
 */
export type PushEnvelope = {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** The `notifications.id` this came from, or null for the test push. */
  notificationId: string | null;
};

/** Subscription fields as the browser hands them over. */
export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};
