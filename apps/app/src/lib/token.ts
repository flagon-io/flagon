import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Small stateless signed tokens for our own out-of-band flows (secondary-email
 * verification), where BetterAuth's own verification store does not apply. A
 * token is `base64url(payload).base64url(hmac)`, signed with the same secret as
 * the rest of auth. Stateless: nothing to store or clean up, and tampering or
 * expiry is caught on verify.
 */

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set.");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function signToken(
  data: Record<string, unknown>,
  ttlMs: number,
): string {
  const body = { ...data, exp: Date.now() + ttlMs };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken<T = Record<string, unknown>>(
  token: string,
): T | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as T & { exp?: number };
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
