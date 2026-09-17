/**
 * Environment access for the Supabase clients.
 *
 * Public values are read as literal `process.env.X` expressions so that the
 * Next.js bundler can inline them in client bundles.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
}

export function supabaseAnonKey(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

/** Server-only. Never import this from a client component. */
export function supabaseServiceRoleKey(): string {
  return required(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
}

/**
 * Server-only. HMAC key used to derive each child's Supabase password from
 * their child id, so no password is ever stored or sent to a browser.
 * Rotating it invalidates every child login (parents must re-invite).
 */
export function childAuthSecret(): string {
  return required(process.env.CHILD_AUTH_SECRET, "CHILD_AUTH_SECRET");
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
