import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sdkKeys } from "../db/schema.js";
import { organizations } from "../db/auth-tables.js";
import { hashToken } from "../lib/token-hash.js";

/**
 * Client-key credentials for OFREP evaluation.
 *
 * A client key identifies an (org, environment). Because it must be resolved
 * BEFORE any org context exists, sdk_keys is an auth-layer table (no RLS): the
 * lookup here runs on the bare client and matches a unique, high-entropy hash,
 * the same shape as access-token auth. Client keys are publishable, so the
 * plaintext is also stored (retrievable in the console); the hash stays the
 * authentication lookup path.
 */
// Client keys (renamed from "SDK keys"). New keys mint with the client prefix;
// keys minted before the rename keep the legacy prefix and still evaluate (both
// are accepted in looksLikeSdkKey; resolveSdkKey matches by hash regardless).
const CLIENT_KEY_PREFIX = "flagon_client";
const LEGACY_SDK_PREFIX = "flagon_sdk";

export type SdkKeyIdentity = {
  keyId: string;
  organizationId: string;
  environmentId: string;
  /** The org's plan, joined at resolve time so the eval hot path can apply a
   *  plan-scoped fair-use limit without a second lookup. */
  plan: string;
};

/** Mint a new SDK key: returns the one-time plaintext plus the columns to store. */
export function generateSdkKey() {
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
 * Resolve a presented SDK key to its (org, environment), or null if it is
 * unknown or revoked. Stamps last-used best-effort (never blocks the request).
 */
export async function resolveSdkKey(
  presented: string,
): Promise<SdkKeyIdentity | null> {
  const rows = await db
    .select({
      id: sdkKeys.id,
      organizationId: sdkKeys.organizationId,
      environmentId: sdkKeys.environmentId,
      revokedAt: sdkKeys.revokedAt,
      plan: organizations.plan,
    })
    .from(sdkKeys)
    // LEFT join: a valid key always has an org in production, but resolution must
    // not depend on the join (an unexpected miss should still resolve the key, not
    // 401 the eval hot path). A null plan falls back to the tightest tier below.
    .leftJoin(organizations, eq(organizations.id, sdkKeys.organizationId))
    .where(eq(sdkKeys.keyHash, hashToken(presented)))
    .limit(1);

  const key = rows[0];
  if (!key || key.revokedAt) return null;

  void db
    .update(sdkKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(sdkKeys.id, key.id))
    .catch(() => {});

  return {
    keyId: key.id,
    organizationId: key.organizationId,
    environmentId: key.environmentId,
    // Default to the tightest tier if the plan couldn't be read (join miss); a real
    // org always supplies its plan (the column is NOT NULL, defaulting to "hobby").
    plan: key.plan ?? "hobby",
  };
}

/** Whether a bearer value looks like a client key (cheap pre-check). Accepts the
 * legacy `flagon_sdk_` prefix too so keys minted before the rename still work. */
export function looksLikeSdkKey(token: string): boolean {
  return (
    token.startsWith(`${CLIENT_KEY_PREFIX}_`) ||
    token.startsWith(`${LEGACY_SDK_PREFIX}_`)
  );
}
