import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clientKeys } from "../db/schema.js";
import { organizations } from "../db/auth-tables.js";
import { hashToken } from "../lib/token-hash.js";

/**
 * Client-key credentials for OFREP evaluation.
 *
 * A client key identifies an (org, environment). Because it must be resolved
 * BEFORE any org context exists, client_keys is an auth-layer table (no RLS): the
 * lookup here runs on the bare client and matches a unique, high-entropy hash,
 * the same shape as access-token auth. Client keys are publishable, so the
 * plaintext is also stored (retrievable in the console); the hash stays the
 * authentication lookup path.
 */
// Client keys (renamed from "SDK keys"). New keys mint with the client prefix;
// keys minted before the rename keep the legacy prefix and still evaluate (both
// are accepted in looksLikeClientKey; resolveClientKey matches by hash regardless).
const CLIENT_KEY_PREFIX = "flagon_client";
const LEGACY_SDK_PREFIX = "flagon_sdk";

export type ClientKeyIdentity = {
  keyId: string;
  organizationId: string;
  environmentId: string;
  /** The org's plan, joined at resolve time so the eval hot path can apply a
   *  plan-scoped fair-use limit without a second lookup. */
  plan: string;
  /** Whether remote evaluations on this key auto-log a billable exposure (default
   *  true). Off disables the exposures default-on behavior for this key. */
  autoExpose: boolean;
};

/** Mint a new client key: returns the one-time plaintext plus the columns to store. */
export function generateClientKey() {
  const secret = randomBytes(24).toString("base64url");
  const token = `${CLIENT_KEY_PREFIX}_${secret}`;
  return {
    token,
    keyHash: hashToken(token),
    prefix: CLIENT_KEY_PREFIX,
    lastFour: token.slice(-4),
  };
}

/**
 * Resolve a presented client key to its (org, environment), or null if it is
 * unknown or revoked. Stamps last-used best-effort (never blocks the request).
 */
export async function resolveClientKey(
  presented: string,
): Promise<ClientKeyIdentity | null> {
  const rows = await db
    .select({
      id: clientKeys.id,
      organizationId: clientKeys.organizationId,
      environmentId: clientKeys.environmentId,
      revokedAt: clientKeys.revokedAt,
      autoExpose: clientKeys.autoExpose,
      plan: organizations.plan,
      orgDeletedAt: organizations.deletedAt,
    })
    .from(clientKeys)
    // LEFT join: a valid key always has an org in production, but resolution must
    // not depend on the join (an unexpected miss should still resolve the key, not
    // 401 the eval hot path). A null plan falls back to the tightest tier below.
    .leftJoin(organizations, eq(organizations.id, clientKeys.organizationId))
    .where(eq(clientKeys.keyHash, hashToken(presented)))
    .limit(1);

  const key = rows[0];
  // Revoked key, or a SOFT-DELETED org: deny. A soft-deleted org must serve no
  // flags and write no billable events, so its keys resolve to nothing (401). A
  // join miss leaves orgDeletedAt null and still resolves (unchanged behavior).
  if (!key || key.revokedAt || key.orgDeletedAt) return null;

  void db
    .update(clientKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(clientKeys.id, key.id))
    .catch(() => {});

  return {
    keyId: key.id,
    organizationId: key.organizationId,
    environmentId: key.environmentId,
    // Default to the tightest tier if the plan couldn't be read (join miss); a real
    // org always supplies its plan (the column is NOT NULL, defaulting to "hobby").
    plan: key.plan ?? "hobby",
    autoExpose: key.autoExpose,
  };
}

/** Whether a bearer value looks like a client key (cheap pre-check). Accepts the
 * legacy `flagon_sdk_` prefix too so keys minted before the rename still work. */
export function looksLikeClientKey(token: string): boolean {
  return (
    token.startsWith(`${CLIENT_KEY_PREFIX}_`) ||
    token.startsWith(`${LEGACY_SDK_PREFIX}_`)
  );
}
