import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { accessTokens, organizations, users } from "../db/auth-tables.js";
import { clientIp } from "./http.js";
import { rateLimit, tooManyRequests } from "./rate-limit.js";
import { hashToken } from "./token-hash.js";

/**
 * Request authentication for the API.
 *
 * The console (app.flagon.io) owns BetterAuth; the API stays out of its cold
 * path and authenticates on its own against the shared database. Two ways in:
 *
 *   1. `Authorization: Bearer flagon_pat_...` / `flagon_oat_...` — a personal or
 *      organization access token. We hash it (sha256, exactly as the console
 *      stored it) and look it up. This is the primary, first-class path.
 *   2. The session cookie — for "just browse the API while I'm logged in". We
 *      cannot verify BetterAuth's signed cookie without BetterAuth, so we ask
 *      the console's own /api/auth/get-session to resolve it, forwarding the
 *      cookie. Secondary and best-effort.
 *
 * The resolved identity is either a user (personal token or cookie) or an
 * organization (org token), or null when unauthenticated.
 */

type UserSummary = {
  id: string;
  name: string;
  email: string;
  username: string | null;
};
type OrgSummary = { id: string; name: string; slug: string; plan: string };

export type AuthIdentity =
  | { kind: "user"; via: "token" | "cookie"; user: UserSummary }
  | { kind: "organization"; via: "token"; organization: OrgSummary }
  | null;

// Make c.get("auth") / c.set("auth") typed everywhere.
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthIdentity;
  }
}

async function fromToken(token: string): Promise<AuthIdentity> {
  const rows = await db
    .select()
    .from(accessTokens)
    .where(eq(accessTokens.tokenHash, hashToken(token)))
    .limit(1);
  const t = rows[0];
  if (!t) return null;
  if (t.expiresAt && t.expiresAt.getTime() < Date.now()) return null;

  // Best-effort "last used" stamp; never block the request on it.
  void db
    .update(accessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(accessTokens.id, t.id))
    .catch(() => {});

  if (t.type === "personal" && t.userId) {
    const u = (
      await db.select().from(users).where(eq(users.id, t.userId)).limit(1)
    )[0];
    if (!u) return null;
    return {
      kind: "user",
      via: "token",
      user: { id: u.id, name: u.name, email: u.email, username: u.username },
    };
  }

  if (t.type === "organization" && t.organizationId) {
    const o = (
      await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, t.organizationId))
        .limit(1)
    )[0];
    if (!o) return null;
    return {
      kind: "organization",
      via: "token",
      organization: { id: o.id, name: o.name, slug: o.slug, plan: o.plan },
    };
  }

  return null;
}

async function fromCookie(c: Context): Promise<AuthIdentity> {
  const cookie = c.req.header("cookie");
  if (!cookie || !cookie.includes("better-auth")) return null;

  const appUrl = process.env.APP_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${appUrl}/api/auth/get-session`, {
      headers: { cookie },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: {
        id: string;
        name: string;
        email: string;
        username?: string | null;
      };
    } | null;
    if (!data?.user) return null;
    return {
      kind: "user",
      via: "cookie",
      user: {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        username: data.user.username ?? null,
      },
    };
  } catch {
    return null;
  }
}

/** Whether the caller presented a Flagon bearer token (valid or not). */
function presentedBearerToken(c: Context): boolean {
  const authorization = c.req.header("authorization");
  return (
    authorization?.startsWith("Bearer ") === true &&
    authorization.slice(7).trim().startsWith("flagon_")
  );
}

/** Resolve the caller's identity from a Bearer token or the session cookie. */
export async function resolveIdentity(c: Context): Promise<AuthIdentity> {
  const authorization = c.req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.startsWith("flagon_")) return fromToken(token);
  }
  return fromCookie(c);
}

/** Populate c.get("auth"). Apply to any route group that needs identity. */
export const authContext: MiddlewareHandler = async (c, next) => {
  const identity = await resolveIdentity(c);

  // Brute-force backstop: throttle a source that keeps presenting bearer tokens
  // that DON'T resolve. Valid tokens and plain unauthenticated requests never
  // touch the limiter, so ordinary traffic — including high-volume authenticated
  // traffic — is never slowed. Tokens are 24 random bytes, so this is defense in
  // depth (and a DoS backstop) rather than the primary guard.
  if (!identity && presentedBearerToken(c)) {
    const limit = await rateLimit({
      key: `auth-fail:${clientIp(c)}`,
      limit: 20,
      windowSeconds: 300,
    });
    if (!limit.ok) return tooManyRequests(c, limit);
  }

  c.set("auth", identity);
  await next();
};

/** Convenience accessor. */
export function getAuth(c: Context): AuthIdentity {
  return c.get("auth") ?? null;
}
