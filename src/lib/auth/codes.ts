/**
 * Invite codes a child types on a phone.
 *
 * Alphabet deliberately drops the look-alikes 0/O and 1/I/L, so a code read off
 * a screen can be typed without guessing. 31^6 ≈ 887 million combinations,
 * codes expire after a week and are single use, which together with the
 * throttle in `rate-limit.ts` makes guessing impractical.
 *
 * Pure module — uses Web Crypto, so it is safe to import from client
 * components (for the normalisation helpers) as well as from the server.
 */

export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_TTL_DAYS = 7;

/** Cryptographically random, rejection-sampled so every code is equally likely. */
export function generateInviteCodeValue(): string {
  const size = INVITE_CODE_ALPHABET.length;
  // Largest multiple of `size` that fits in a byte; anything above is rejected.
  const limit = Math.floor(256 / size) * size;

  let code = "";
  const buffer = new Uint8Array(INVITE_CODE_LENGTH * 2);

  while (code.length < INVITE_CODE_LENGTH) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= limit) continue;
      code += INVITE_CODE_ALPHABET[byte % size];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }

  return code;
}

export function inviteCodeExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Uppercase and strip spaces/dashes so "ab c-2 3d9" matches "ABC23D9". */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isWellFormedInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  return [...code].every((char) => INVITE_CODE_ALPHABET.includes(char));
}
