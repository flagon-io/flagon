/**
 * API tokens authenticate the management API. We store only a SHA-256 hash; the
 * plaintext is shown once at creation. Lookup is by hash against the (non-RLS)
 * api_tokens table — the request has no tenant context yet, and the unique
 * cryptographic hash is itself the bootstrap credential. Mirrors sdk-keys.ts.
 *
 *   - user PATs  → `flagon_pat_…`  (act with the owner's live org memberships)
 *   - org tokens → `flagon_oat_…`  (act with a fixed role in one org)
 */

import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { apiTokens } from '@/server/db/schema/app';

export type ApiTokenKind = 'user' | 'org';

const TAG: Record<ApiTokenKind, string> = { user: 'pat', org: 'oat' };

export interface GeneratedApiToken {
  /** Shown to the creator exactly once. */
  plaintext: string;
  /** Non-secret display prefix stored alongside the hash. */
  prefix: string;
  /** SHA-256 of the plaintext; what we persist and look up by. */
  hashedKey: string;
}

export function hashApiToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Does this look like one of our API tokens (vs a JWT or an SDK key)? */
export function isApiTokenFormat(plaintext: string): boolean {
  return /^flagon_(pat|oat)_/.test(plaintext);
}

export function generateApiToken(kind: ApiTokenKind): GeneratedApiToken {
  const secret = randomBytes(24).toString('base64url');
  const plaintext = `flagon_${TAG[kind]}_${secret}`;
  return { plaintext, prefix: plaintext.slice(0, 18), hashedKey: hashApiToken(plaintext) };
}

export interface ResolvedApiToken {
  id: string;
  kind: ApiTokenKind;
  userId: string | null;
  organizationId: string | null;
  role: string | null;
  /** Fine-grained scope restriction; null = unrestricted (inherit the role). */
  scopes: string[] | null;
}

/** Resolve a plaintext API token to its identity, or null if invalid/revoked/expired. */
export async function resolveApiToken(plaintext: string): Promise<ResolvedApiToken | null> {
  if (!isApiTokenFormat(plaintext)) return null;
  const hashed = hashApiToken(plaintext);

  const [row] = await db
    .select({
      id: apiTokens.id,
      kind: apiTokens.kind,
      userId: apiTokens.userId,
      organizationId: apiTokens.organizationId,
      role: apiTokens.role,
      scopes: apiTokens.scopes,
      revokedAt: apiTokens.revokedAt,
      expiresAt: apiTokens.expiresAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.hashedKey, hashed))
    .limit(1);

  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  // Best-effort last-used touch; never block or fail the request on it.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return {
    id: row.id,
    kind: row.kind as ApiTokenKind,
    userId: row.userId,
    organizationId: row.organizationId,
    role: row.role,
    scopes: row.scopes ?? null,
  };
}
