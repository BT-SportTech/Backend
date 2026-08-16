import * as crypto from 'crypto';

/** Lowercase alphanumeric alphabet for player unique codes. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export const UNIQUE_CODE_LENGTH = 8;

/**
 * Cryptographically random 8-character alphanumeric code (a-z, 0-9).
 * Uniqueness must still be enforced against the database.
 */
export function generateUniqueCodeCandidate(
  length: number = UNIQUE_CODE_LENGTH,
): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return result;
}

export function isValidUniqueCode(value: string): boolean {
  return new RegExp(
    `^[a-z0-9]{${UNIQUE_CODE_LENGTH}}$`,
  ).test(value.trim().toLowerCase());
}
