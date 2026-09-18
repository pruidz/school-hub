/**
 * Helper invitation tokens.
 *
 * Not the child's 6-character code from `@/lib/auth/codes`: a child types their
 * code on a phone keypad, so it trades entropy for legibility and leans on the
 * PIN throttle. A helper never types anything — they follow a link — so the
 * token is sized to be unguessable on its own.
 *
 * 32 characters of the 31-symbol alphabet is log2(31^32) ≈ 158 bits. The same
 * alphabet is reused so a token that does get read aloud still survives it.
 *
 * Pure module: Web Crypto only, safe to import from a client component.
 */

import { INVITE_CODE_ALPHABET } from "@/lib/auth/codes";

export const HELPER_TOKEN_ALPHABET = INVITE_CODE_ALPHABET;
export const HELPER_TOKEN_LENGTH = 32;
export const HELPER_INVITE_TTL_DAYS = 14;

/** Cryptographically random, rejection-sampled so every token is equally likely. */
export function generateHelperToken(): string {
  const size = HELPER_TOKEN_ALPHABET.length;
  const limit = Math.floor(256 / size) * size;

  let token = "";
  const buffer = new Uint8Array(HELPER_TOKEN_LENGTH * 2);

  while (token.length < HELPER_TOKEN_LENGTH) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= limit) continue;
      token += HELPER_TOKEN_ALPHABET[byte % size];
      if (token.length === HELPER_TOKEN_LENGTH) break;
    }
  }

  return token;
}

export function helperInviteExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + HELPER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** A token straight out of the URL. Rejects anything not shaped like one. */
export function isWellFormedHelperToken(value: string): boolean {
  if (value.length !== HELPER_TOKEN_LENGTH) return false;
  return [...value].every((char) => HELPER_TOKEN_ALPHABET.includes(char));
}

