import { randomBytes } from 'node:crypto';

/**
 * Collision-resistant, URL-safe, k-sortable id with a type prefix
 * (e.g. `proj_3Qr8...`). Prefixes make ids self-describing in logs and APIs,
 * the way Stripe does it. Text ids keep us aligned with BetterAuth, which also
 * uses string ids.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function newId(prefix: string): string {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}
