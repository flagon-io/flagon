import { randomBytes } from "node:crypto";

/**
 * UUIDv7 generator.
 *
 * Flagon uses UUIDv7 for all identifiers: they are time-ordered (the first 48
 * bits are a millisecond Unix timestamp), so primary keys sort by creation time
 * and index locality is far better than random v4. We generate them in the
 * application because Postgres 17 (our runtime) has no `uuidv7()` function yet;
 * this is wired into BetterAuth (advanced.database.generateId) and into our own
 * tables via drizzle `$defaultFn`.
 *
 * Layout (RFC 9562): 48-bit big-endian ms timestamp | 4-bit version (7) |
 * 12-bit random | 2-bit variant | 62-bit random.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);

  // 48-bit millisecond timestamp, big-endian, in bytes 0..5. Use modulo/division
  // (not bitwise) so the full 48-bit value survives without int32 truncation.
  let ts = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }

  // Version 7 in the high nibble of byte 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant (10xx) in the high bits of byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
