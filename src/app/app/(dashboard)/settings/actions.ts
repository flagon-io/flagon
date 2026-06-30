'use server';

/**
 * Personal access token (PAT) mutations. User-scoped: a PAT belongs to the
 * signed-in user and acts with that user's LIVE org memberships. api_tokens is
 * NOT under RLS, so every query is explicitly scoped by `userId` — that ownership
 * filter is the security boundary (there is no withTenant here).
 */

import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { apiTokens } from '@/server/db/schema/app';
import { generateApiToken } from '@/server/tokens/api-tokens';
import { normalizeScopes } from '@/server/api/scopes';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function createPersonalAccessToken(input: {
  name: string;
  expiresInDays?: number | null;
  scopes?: string[] | null;
}): Promise<ActionResult<{ plaintext: string }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authorized.' };
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give the token a name.' };

  const generated = generateApiToken('user');
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000)
    : null;

  await db.insert(apiTokens).values({
    id: uuidv7(),
    kind: 'user',
    userId,
    createdByUserId: userId,
    name,
    prefix: generated.prefix,
    hashedKey: generated.hashedKey,
    scopes: normalizeScopes(input.scopes),
    expiresAt,
  });
  return { ok: true, data: { plaintext: generated.plaintext } };
}

export async function revokePersonalAccessToken(id: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Not authorized.' };
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), eq(apiTokens.kind, 'user')));
  return { ok: true, data: undefined };
}
