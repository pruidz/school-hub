import "server-only";

/**
 * Best-effort in-process throttle for unauthenticated auth endpoints
 * (invite-code lookups, PIN attempts from an unknown device).
 *
 * Caveat: this lives in one server instance's memory, so it does not hold
 * across a serverless fleet. The real guarantee for PINs is the per-child
 * `pin_attempts` / `pin_locked_until` counter in Postgres; this only blunts
 * fast scripted guessing from a single origin. Swap in Upstash/Redis when the
 * app runs on more than one instance.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > MAX_BUCKETS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000),
  );
  return { allowed: bucket.count <= limit, retryAfterSeconds };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Caller IP from the proxy headers Vercel sets, or a shared fallback key. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
