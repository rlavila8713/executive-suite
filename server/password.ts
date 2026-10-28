import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored?.startsWith('scrypt:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  const derived = scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Sellers may use a short PIN (4–8 digits); managers need a longer password. */
export function validatePasswordForRole(roleKey: string, password: string): string | null {
  const trimmed = password.trim();
  if (roleKey === 'seller') {
    if (!/^\d{4,8}$/.test(trimmed)) {
      return 'Seller PIN must be 4–8 digits';
    }
    return null;
  }
  if (trimmed.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return null;
}
