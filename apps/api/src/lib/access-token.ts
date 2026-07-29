import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { accessTokens } from "../db/auth-tables.js";
import { hashToken } from "./token-hash.js";

/**
 * Access-token minting + management. Moved into the API (the control plane owns
 * identity writes; any client mints/lists/revokes tokens via /v1). One generic
 * table backs both personal and organization tokens. The plaintext is shown once;
 * only the SHA-256 hash is stored, hashed IDENTICALLY to how auth-context looks
 * it up (see token-hash.ts). Ported from apps/app/src/lib/access-token.ts.
 */

export type TokenType = "personal" | "organization";

const PREFIXES: Record<TokenType, string> = {
  personal: "flagon_pat",
  organization: "flagon_oat",
};

function generate(type: TokenType) {
  const secret = randomBytes(24).toString("base64url");
  const token = `${PREFIXES[type]}_${secret}`;
  return {
    token,
    tokenHash: hashToken(token),
    prefix: PREFIXES[type],
    lastFour: token.slice(-4),
  };
}

/** Create a token, returning the ONE-TIME plaintext alongside the stored row id. */
export async function createAccessToken(opts: {
  type: TokenType;
  name: string;
  ownerId: string; // user id (personal) or org id (organization)
  createdByUserId: string;
  expiresAt?: Date | null;
}): Promise<{ token: string; id: string }> {
  const { type, name, ownerId, createdByUserId, expiresAt } = opts;
  const g = generate(type);
  const [row] = await db
    .insert(accessTokens)
    .values({
      type,
      name,
      tokenHash: g.tokenHash,
      prefix: g.prefix,
      lastFour: g.lastFour,
      userId: type === "personal" ? ownerId : null,
      organizationId: type === "organization" ? ownerId : null,
      createdByUserId,
      expiresAt: expiresAt ?? null,
    })
    .returning({ id: accessTokens.id });
  return { token: g.token, id: row.id };
}

export async function listPersonalTokens(userId: string) {
  return db
    .select()
    .from(accessTokens)
    .where(and(eq(accessTokens.type, "personal"), eq(accessTokens.userId, userId)))
    .orderBy(desc(accessTokens.createdAt));
}

export async function listOrgTokens(organizationId: string) {
  return db
    .select()
    .from(accessTokens)
    .where(
      and(
        eq(accessTokens.type, "organization"),
        eq(accessTokens.organizationId, organizationId),
      ),
    )
    .orderBy(desc(accessTokens.createdAt));
}

export async function revokePersonalToken(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(accessTokens)
    .where(
      and(
        eq(accessTokens.id, id),
        eq(accessTokens.userId, userId),
        eq(accessTokens.type, "personal"),
      ),
    )
    .returning({ id: accessTokens.id });
  return rows.length > 0;
}

export async function revokeOrgToken(organizationId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(accessTokens)
    .where(
      and(
        eq(accessTokens.id, id),
        eq(accessTokens.organizationId, organizationId),
        eq(accessTokens.type, "organization"),
      ),
    )
    .returning({ id: accessTokens.id });
  return rows.length > 0;
}

/** Serialize a token row to masked metadata (never the secret). */
export function serializeToken(t: typeof accessTokens.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    lastFour: t.lastFour,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
  };
}
