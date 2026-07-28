import { createHash } from "node:crypto";

/**
 * The one way an access token is turned into its stored form: sha256 hex of the
 * raw token string. Both sides depend on this being IDENTICAL — the console
 * (apps/app) hashes at mint time and stores only the digest; the API hashes a
 * presented token and looks the digest up. If these two ever diverge, every
 * token silently stops authenticating, so the hashing lives in a tiny pure
 * module with no database or framework coupling, and is covered by a test that
 * pins the exact digest of a known input (see token-hash.test.ts). The console
 * has a byte-for-byte twin at apps/app/src/lib/token-hash.ts.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
