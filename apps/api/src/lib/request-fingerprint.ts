import type { Context } from "hono";
import { clientIp } from "./http.js";
import { hashToken } from "./token-hash.js";

/**
 * Pure request-classification helpers for rate limiting. Kept free of any boot
 * env / database coupling (like token-hash.ts) so they can be unit-tested on
 * their own, without standing up the validated environment.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** True for the HTTP methods that change state and should be throttled. */
export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/**
 * A stable, cheap identity for "who is calling", for rate-limit bucketing only.
 * NEVER used for authorization, and needs no database lookup: the bearer token's
 * digest when present (the API-token path), else the caller's IP (the console's
 * cookie path). Namespaced (`t:` vs `ip:`) so a token digest and an IP can never
 * collide into the same bucket.
 */
export function callerFingerprint(c: Context): string {
  const authz = c.req.header("Authorization");
  if (authz) {
    const match = /^Bearer\s+(.+)$/i.exec(authz.trim());
    if (match) return `t:${hashToken(match[1]!).slice(0, 16)}`;
  }
  return `ip:${clientIp(c)}`;
}
