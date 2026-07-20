import { randomBytes } from "node:crypto";

/**
 * UUIDv7 (RFC 9562): 48-bit unix-ms timestamp + version/variant bits + 74
 * random bits. Time-ordered, so ids sort by creation and index locality stays
 * tight - the platform default for ALL new ids unless there's an explicit
 * reason otherwise (see AGENTS.md).
 *
 * Node has no native v7 generator yet; Postgres grows one in 18 (uuidv7()),
 * which Neon doesn't ship. Until then: this for application-generated ids,
 * and the uuid_generate_v7() SQL function (drizzle/0003_uuidv7.sql) for
 * database-side defaults. Swap both to native when the platforms catch up.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);

  // 48-bit big-endian unix-ms timestamp (fits a JS double exactly).
  let ts = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
