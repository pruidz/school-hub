import "server-only";

import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { childAuthSecret } from "@/lib/supabase/env";

/* -------------------------------------------------------------------------- */
/*  PIN hashing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * scrypt parameters. scrypt is a memory-hard password KDF (the same family as
 * bcrypt/argon2) and ships with Node, so it needs no native dependency.
 * N=16384/r=8/p=1 costs ~16 MB and ~60 ms per verification, which together
 * with the 5-attempt lockout is far more than enough for a 4-digit PIN.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/** `scrypt$N$r$p$saltBase64$hashBase64` */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(pin.normalize("NFKC"), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * Constant-time PIN check. Returns false for any malformed or missing hash
 * rather than throwing, so a corrupted row cannot be used to bypass the check.
 */
export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(pin.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------------------------- */
/*  Child Supabase credentials                                                */
/* -------------------------------------------------------------------------- */

/**
 * Children have no real mailbox. Supabase Auth still needs an identifier, so
 * we derive a stable synthetic one from the child id. The domain is reserved
 * and undeliverable on purpose — nothing is ever sent to it.
 */
export function childAuthEmail(childId: string): string {
  return `kid.${childId}@kids.school-hub.invalid`;
}

/**
 * The child's Supabase password, derived as HMAC-SHA256(serverSecret, childId).
 *
 * Deriving beats storing: there is no password column to leak, the value never
 * leaves the server, and it is 256 bits of entropy rather than something a
 * child could guess. The child never sees or types it — their credential is
 * the PIN, which is what gates access to this derivation.
 */
export function childAuthPassword(childId: string): string {
  return createHmac("sha256", childAuthSecret())
    .update(`child-password:v1:${childId}`)
    .digest("base64url");
}
