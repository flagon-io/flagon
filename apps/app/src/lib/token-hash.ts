import { createHash } from "node:crypto";

/**
 * The one way an access token is turned into its stored form: sha256 hex of the
 * raw token string. This MUST stay byte-for-byte identical to the API's copy at
 * apps/api/src/lib/token-hash.ts — the console hashes at mint time and stores
 * only the digest, the API hashes a presented token and looks the digest up, so
 * any divergence silently breaks every token. Kept in a pure module (no DB, no
 * "server-only") so it is unit-testable without a database, and pinned to an
 * exact digest in token-hash.test.ts alongside the API's matching test.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
