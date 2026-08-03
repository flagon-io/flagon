import { createHmac } from "node:crypto";
import { env } from "../env.js";

/**
 * Turn a unit identity (an evaluation targetingKey) into the opaque `unit_hash`
 * we store for experiment attribution.
 *
 * Experiments must join a unit's goal events back to the arm it was assigned, so
 * we need a STABLE per-unit identifier — but we never want to persist a raw
 * targeting key (it is often a user id / email and is PII we have no reason to
 * hold). So we store a keyed hash instead: HMAC-SHA256 under the server secret,
 * truncated. It is:
 *   - deterministic (same key -> same hash, so exposures and metric events line
 *     up across requests and days),
 *   - one-way (the raw key can't be recovered from the stored value),
 *   - salted by a server-only secret (BETTER_AUTH_SECRET, min 32 chars and always
 *     present per env.ts), so the hashes aren't guessable/rainbow-tableable from
 *     the key space alone.
 *
 * Unlike lib/token-hash.ts (a plain, unsalted sha256 for CREDENTIAL lookup, where
 * the input is already high-entropy), this is deliberately SALTED because the
 * input is low-entropy user data. Truncated to 32 hex chars (128 bits) — ample to
 * avoid collisions at any realistic unit count while keeping the column compact.
 */
export function hashUnit(targetingKey: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(targetingKey)
    .digest("hex")
    .slice(0, 32);
}
