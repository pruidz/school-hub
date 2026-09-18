/**
 * "iPhone · Safari" out of 200 characters of user agent.
 *
 * Isomorphic on purpose: the browser sends its own UA when it subscribes and
 * the settings screen renders the stored one, and both sides have to agree or
 * the device you are holding will not match the row that represents it.
 *
 * This is a label, not analytics. It is coarse by design — enough for a parent
 * with two phones and a laptop to tell which row to delete, and no finer.
 */

import { ka } from "@/lib/i18n/ka";

const PLATFORMS: ReadonlyArray<[RegExp, string]> = [
  [/\biPhone\b/i, "iPhone"],
  [/\biPad\b/i, "iPad"],
  [/\bAndroid\b/i, "Android"],
  [/\bWindows\b/i, "Windows"],
  [/\b(Macintosh|Mac OS X)\b/i, "Mac"],
  [/\b(CrOS)\b/i, "ChromeOS"],
  [/\b(Linux)\b/i, "Linux"],
];

// Order matters: every Chromium UA also says "Safari", Edge also says "Chrome",
// so the most specific token has to be tested first.
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/\bEdgA?\//i, "Edge"],
  [/\bOPR\//i, "Opera"],
  [/\bSamsungBrowser\//i, "Samsung"],
  [/\bFxiOS\//i, "Firefox"],
  [/\bCriOS\//i, "Chrome"],
  [/\bFirefox\//i, "Firefox"],
  [/\bChrome\//i, "Chrome"],
  [/\bSafari\//i, "Safari"],
];

function firstMatch(
  table: ReadonlyArray<[RegExp, string]>,
  value: string,
): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(value)) return label;
  }
  return null;
}

export function describeDevice(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").trim();
  if (ua.length === 0) return ka.push.deviceUnknown;

  const parts = [firstMatch(PLATFORMS, ua), firstMatch(BROWSERS, ua)].filter(
    (part): part is string => part !== null,
  );

  return parts.length > 0 ? parts.join(" · ") : ka.push.deviceUnknown;
}
