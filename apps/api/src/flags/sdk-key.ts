import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sdkKeys } from "../db/schema.js";
import { hashToken } from "../lib/token-hash.js";

/**
 * SDK-key credentials for OFREP evaluation.
 *
 * An SDK key identifies an (org, environment). Because it must be resolved
 * BEFORE any org context exists, sdk_keys is an auth-layer table (no RLS): the
 * lookup here runs on the bare client and matches a unique, high-entropy hash —
 * the same shape as access-token auth. Only the SHA-256 hash is stored; the
 * plaintext is returned once, at creation.
 */
const SDK_KEY_PREFIX = "flagon_sdk";

export type SdkKeyIdentity = {
  keyId: string;
  organizationId: string;
  environmentId: string;
};

/** Mint a new SDK key: returns the one-time plaintext plus the columns to store. */
export function generateSdkKey() {
  const secret = randomBytes(24).toString("base64url");
  const token = `${SDK_KEY_PREFIX}_${secret}`;
  return {
    token,
    keyHash: hashToken(token),
    prefix: SDK_KEY_PREFIX,
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
    })
    .from(sdkKeys)
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
  };
}

/** Whether a bearer value looks like an SDK key (cheap pre-check). */
export function looksLikeSdkKey(token: string): boolean {
  return token.startsWith(`${SDK_KEY_PREFIX}_`);
}
