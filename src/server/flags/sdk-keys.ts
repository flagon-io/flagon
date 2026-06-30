/**
 * SDK keys authenticate the evaluation hot path. We store only a SHA-256 hash;
 * the plaintext is returned once at creation. Lookup is by hash against the
 * (non-RLS) sdk_keys table — the eval request has no tenant context yet, and a
 * unique cryptographic hash is itself the bootstrap credential.
 */

import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { sdkKeys } from '@/server/db/schema/app';

export type SdkKeyScope = 'server' | 'client';

export interface GeneratedSdkKey {
  /** Shown to the user exactly once. */
  plaintext: string;
  /** Non-secret display prefix stored alongside the hash. */
  prefix: string;
  /** SHA-256 of the plaintext; what we persist and look up by. */
  hashedKey: string;
}

export function hashSdkKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function generateSdkKey(scope: SdkKeyScope): GeneratedSdkKey {
  const tag = scope === 'server' ? 'srv' : 'cli';
  const secret = randomBytes(24).toString('base64url');
  const plaintext = `flagon_${tag}_${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 16),
    hashedKey: hashSdkKey(plaintext),
  };
}

export interface ResolvedSdkKey {
  keyId: string;
  organizationId: string;
  environmentId: string;
  scope: SdkKeyScope;
}

/** Resolve a plaintext SDK key to its org + environment, or null if invalid/revoked. */
export async function resolveSdkKey(plaintext: string): Promise<ResolvedSdkKey | null> {
  if (!plaintext.startsWith('flagon_')) return null;
  const hashed = hashSdkKey(plaintext);

  const [row] = await db
    .select({
      keyId: sdkKeys.id,
      organizationId: sdkKeys.organizationId,
      environmentId: sdkKeys.environmentId,
      scope: sdkKeys.scope,
      revokedAt: sdkKeys.revokedAt,
    })
    .from(sdkKeys)
    .where(eq(sdkKeys.hashedKey, hashed))
    .limit(1);

  if (!row || row.revokedAt) return null;
  return {
    keyId: row.keyId,
    organizationId: row.organizationId,
    environmentId: row.environmentId,
    scope: row.scope as SdkKeyScope,
  };
}

/** Extract a bearer token from an Authorization header (case-insensitive scheme). */
export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}
