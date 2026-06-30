/**
 * UUIDv7 id generation.
 *
 * UUIDv7 is time-ordered (millisecond timestamp in the high bits), so ids sort
 * roughly by creation time - great for index locality and pagination, unlike
 * random v4. Postgres 18 ships a native `uuidv7()` we can switch the column
 * DEFAULT to once Neon/Vercel are on 18; until then we generate app-side, which
 * is wire-compatible (same bytes, same type) so no data migration is needed.
 *
 * Every `uuid('id')` column uses `.$defaultFn(uuidv7)`, so inserts can omit the
 * id; generate one explicitly only when you need the value before insert (e.g.
 * to satisfy a foreign key in the same transaction).
 */

/** Generate a UUIDv7 string (RFC 9562, version 7). */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian Unix timestamp in milliseconds.
  const ts = Date.now();
  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ts / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ts / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // 74 random bits fill the remainder.
  crypto.getRandomValues(bytes.subarray(6));

  // Version 7 (high nibble of byte 6) and RFC 4122 variant (top two bits of byte 8).
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
