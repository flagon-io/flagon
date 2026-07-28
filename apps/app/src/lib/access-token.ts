import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accessTokens } from "@/db/schema";
import { hashToken } from "@/lib/token-hash";

/**
 * Access-token minting and management (console side). One generic table backs
 * both personal and organization tokens (see db/schema access_tokens).
 *
 * The plaintext token is shown to the user exactly once; we store only its
 * SHA-256 hash. The API authenticates a presented token by hashing it the SAME
 * way (sha256 hex of the raw string) and looking up the hash, so it never needs
 * BetterAuth or this module. Keep the hashing here in lockstep with the API's.
 */

export type TokenType = "personal" | "organization";

const PREFIXES: Record<TokenType, string> = {
  personal: "flagon_pat",
  organization: "flagon_oat",
};

// Re-exported so existing imports from this module keep working; the hashing
// itself lives in the pure, DB-free, unit-tested token-hash module.
export { hashToken };

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

/**
 * Create a token and return the ONE-TIME plaintext alongside the stored row.
 * `ownerId` is the user id for personal tokens or the org id for org tokens.
 */
export async function createAccessToken(opts: {
  type: TokenType;
  name: string;
  ownerId: string;
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
    .where(
      and(eq(accessTokens.type, "personal"), eq(accessTokens.userId, userId)),
    )
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

/** Revoke a personal token the user owns. */
export async function revokePersonalToken(userId: string, id: string) {
  await db
    .delete(accessTokens)
    .where(
      and(
        eq(accessTokens.id, id),
        eq(accessTokens.userId, userId),
        eq(accessTokens.type, "personal"),
      ),
    );
}

/** Revoke an org token belonging to the given org. */
export async function revokeOrgToken(organizationId: string, id: string) {
  await db
    .delete(accessTokens)
    .where(
      and(
        eq(accessTokens.id, id),
        eq(accessTokens.organizationId, organizationId),
        eq(accessTokens.type, "organization"),
      ),
    );
}

/** Purely for display: the masked token label. */
export function maskToken(prefix: string, lastFour: string): string {
  return `${prefix}_••••${lastFour}`;
}
