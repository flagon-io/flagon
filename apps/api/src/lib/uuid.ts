import { randomBytes } from "node:crypto";

/**
 * UUIDv7 generator. Duplicated from apps/app/src/lib/uuid.ts (kept identical on
 * purpose) so the API can generate the same time-ordered ids BetterAuth and our
 * own inserts use. Postgres 17 has no `uuidv7()`, so generation is in-app.
 *
 * Layout (RFC 9562): 48-bit big-endian ms timestamp | 4-bit version (7) |
 * 12-bit random | 2-bit variant | 62-bit random.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);

  let ts = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
