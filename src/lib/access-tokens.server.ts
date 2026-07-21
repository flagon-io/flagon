import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { accessTokens } from "@/db/schema";

/**
 * What a token may do, as resource:action pairs covering the whole v1 surface.
 *
 * Two rules govern this list.
 *
 * A `:write` scope IMPLIES its `:read` counterpart (see `satisfiesScope`), so
 * nobody has to tick both boxes and no route has to ask for both. Requiring
 * the pair is the kind of papercut that leads people to grant everything.
 *
 * There is deliberately NO scope over tokens themselves. A token that could
 * mint tokens is a privilege-escalation primitive: any leak becomes permanent,
 * because the attacker issues a fresh credential before you revoke the one you
 * know about. Token management stays session-only, which means a human with a
 * password and a session is always in the loop.
 */
export const TOKEN_SCOPES = [
  /** Evaluate flags over OFREP. The only scope most integrations ever need. */
  "flags:evaluate",
  "flags:read",
  "flags:write",
  "projects:read",
  "projects:write",
  "members:read",
  "members:write",
  "usage:read",
  "org:read",
  "org:write",
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];
export type AccessToken = typeof accessTokens.$inferSelect;

/** Human labels for the scope picker, in the order they should be offered. */
export const TOKEN_SCOPE_LABELS: Record<TokenScope, string> = {
  "flags:evaluate": "Evaluate feature flags",
  "flags:read": "Read flags and segments",
  "flags:write": "Create and change flags and segments",
  "projects:read": "Read projects, access, and ownership",
  "projects:write": "Create and change projects, access, and ownership",
  "members:read": "Read members and teams",
  "members:write": "Manage members, teams, and invitations",
  "usage:read": "Read usage and billing periods",
  "org:read": "Read organization settings",
  "org:write": "Change organization settings",
};

/**
 * Whether a granted scope set satisfies a required scope.
 *
 * `x:write` satisfies `x:read`. Nothing else implies anything: `flags:write`
 * does not grant `projects:read`, because a token scoped to one product must
 * not quietly become a reader of the whole organization.
 */
export function satisfiesScope(
  granted: readonly string[],
  required: TokenScope,
): boolean {
  if (granted.includes(required)) return true;
  const [resource, action] = required.split(":");
  return action === "read" && granted.includes(`${resource}:write`);
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createAccessToken(input: {
  subjectType: "user" | "organization";
  subjectId: string;
  name: string;
  scopes: TokenScope[];
  expiresAt?: Date | null;
}) {
  const name = input.name.trim();
  if (!name || name.length > 100) return { ok: false as const, error: "Provide a token name up to 100 characters." };
  if (!input.scopes.length || input.scopes.some((scope) => !TOKEN_SCOPES.includes(scope))) {
    return { ok: false as const, error: "Choose at least one valid scope." };
  }
  const prefix = input.subjectType === "user" ? "flagon_pat" : "flagon_org";
  const identity = Buffer.from(input.subjectId).toString("base64url");
  const token = `${prefix}_${identity}_${randomBytes(32).toString("base64url")}`;
  const [created] = await db.insert(accessTokens).values({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    name,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
    secretHash: digest(token),
  }).returning();
  return { ok: true as const, token, accessToken: created };
}

export const listAccessTokens = (subjectType: "user" | "organization", subjectId: string) =>
  db.select().from(accessTokens).where(and(eq(accessTokens.subjectType, subjectType), eq(accessTokens.subjectId, subjectId))).orderBy(desc(accessTokens.createdAt));

export async function revokeAccessToken(subjectType: "user" | "organization", subjectId: string, id: string) {
  return (await db.delete(accessTokens).where(and(eq(accessTokens.id, id), eq(accessTokens.subjectType, subjectType), eq(accessTokens.subjectId, subjectId))).returning({ id: accessTokens.id })).length > 0;
}

export async function rotateAccessToken(subjectType: "user" | "organization", subjectId: string, id: string) {
  const [current] = await db.select().from(accessTokens).where(and(eq(accessTokens.id, id), eq(accessTokens.subjectType, subjectType), eq(accessTokens.subjectId, subjectId))).limit(1);
  if (!current) return { ok: false as const };
  const prefix = subjectType === "user" ? "flagon_pat" : "flagon_org";
  const identity = Buffer.from(subjectId).toString("base64url");
  const token = `${prefix}_${identity}_${randomBytes(32).toString("base64url")}`;
  const [accessToken] = await db.update(accessTokens).set({ secretHash: digest(token), lastUsedAt: null }).where(eq(accessTokens.id, id)).returning();
  return { ok: true as const, token, accessToken };
}

/**
 * Resolves a bearer token to its record, WITHOUT checking scopes.
 *
 * Callers that need one specific permission should use
 * `authenticateAccessToken`. This exists for the API middleware, which has to
 * distinguish "not a valid token" (401) from "a valid token lacking this
 * scope" (403) - collapsing those into one answer makes a scope mistake
 * indistinguishable from a bad credential, which is a miserable thing to debug.
 */
export async function authenticateToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token.startsWith("flagon_org_") && !token.startsWith("flagon_pat_")) return null;
  const [credential] = await db.select().from(accessTokens).where(and(
    eq(accessTokens.secretHash, digest(token)),
    or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, new Date())),
  )).limit(1);
  if (!credential) return null;

  // Fire-and-forget: last-used is for humans auditing which credentials are
  // still live, and it must never add latency to, or fail, the request it is
  // describing. Coarse to the minute so a busy token is not one write per
  // evaluation on the hot path.
  const now = new Date();
  const last = credential.lastUsedAt;
  if (!last || now.getTime() - last.getTime() > 60_000) {
    void db
      .update(accessTokens)
      .set({ lastUsedAt: now })
      .where(eq(accessTokens.id, credential.id))
      .catch(() => {});
  }
  return credential;
}

export async function authenticateAccessToken(header: string | null, requiredScope: TokenScope) {
  const credential = await authenticateToken(header);
  if (!credential || !satisfiesScope(credential.scopes, requiredScope)) return null;
  return credential;
}

export function serializeAccessToken(token: AccessToken) {
  return { id: token.id, name: token.name, subject_type: token.subjectType, scopes: token.scopes,
    expires_at: token.expiresAt?.toISOString() ?? null, last_used_at: token.lastUsedAt?.toISOString() ?? null,
    created_at: token.createdAt.toISOString() };
}
