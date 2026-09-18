import { z } from "zod";

import { ka } from "@/lib/i18n/ka";

/**
 * Validation for the one field with a security dimension.
 *
 * An endpoint is a URL this server will later make an outbound POST to.
 * Unchecked, a user could register `https://169.254.169.254/latest/meta-data/`
 * or an address on the deployment's own network and turn the delivery path into
 * a request forger.
 *
 * The fence is a shape test rather than an allow-list of push services: FCM,
 * Apple, Mozilla and Microsoft are not the last four that will ever exist, and
 * an allow-list would silently stop working on whatever ships next. https, a
 * dotted public hostname, no IP literal, no localhost, no internal TLD.
 * Everything an attacker would actually aim at fails at least one of those.
 *
 * Shared by the Server Action and by `/api/push/resubscribe`, which the service
 * worker calls — two doors into the same table, one lock.
 */
export function isPlausiblePushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  // IPv6 literals arrive bracketed; IPv4 literals are four numeric labels.
  if (host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  // A public push service always has a dotted name.
  return host.includes(".");
}

export const pushEndpointSchema = z
  .string()
  .min(8)
  .max(2000)
  .refine(isPlausiblePushEndpoint, ka.push.errGeneric);

/** The three fields a browser hands over, plus the label for the device list. */
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  p256dh: z.string().min(1).max(255),
  auth: z.string().min(1).max(255),
  userAgent: z.string().max(400).nullable(),
});

export type PushSubscriptionFields = z.output<typeof pushSubscriptionSchema>;
