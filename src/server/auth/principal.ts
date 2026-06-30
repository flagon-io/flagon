/**
 * The Principal: one normalized identity for every way a request can authenticate
 * (session cookie, user PAT, org token, or a pre-exchanged JWT). The control plane
 * resolves a Principal; `principalClaims()` turns a directly-resolved one into JWT
 * claims. That single claims shape is what a future split-out API validates — so
 * the resolver and the JWT mint can never drift apart.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { members } from '@/server/db/schema/auth';

export type Actor = 'user' | 'org';
export type AuthVia = 'session' | 'pat' | 'org-token' | 'jwt';

export interface Principal {
  actor: Actor;
  via: AuthVia;
  /** Human identity (session / user PAT / jwt minted from a user). */
  userId?: string;
  /** api_tokens.id when authed by a token (pat/org-token), or the JWT's `tid`. */
  tokenId?: string;
  /** org tokens (and jwt minted from one): the single bound org. */
  organizationId?: string;
  /** org tokens (and jwt minted from one): the role within that org. */
  role?: string;
  /** jwt only: the trusted org→role map carried in the token (authorize from this, no DB). */
  orgs?: Record<string, string>;
  /** fine-grained scope restriction; null/undefined = unrestricted (inherit role). */
  scopes?: string[] | null;
}

export interface JwtClaims {
  /** subject: user id (user actor) or token id (org actor). */
  sub: string;
  act: Actor;
  /** org → role. For a user, their live memberships at mint time; for an org token, its one org. */
  orgs: Record<string, string>;
  /** token id, when minted from a PAT/org token. */
  tid?: string;
  /** fine-grained scopes, when the source token is restricted. */
  scopes?: string[];
  [k: string]: unknown;
}

/** Live-resolve a user's org memberships → { orgId: role }. */
export async function userOrgRoles(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ orgId: members.organizationId, role: members.role })
    .from(members)
    .where(eq(members.userId, userId));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.orgId] = r.role;
  return map;
}

/**
 * Build JWT claims for a directly-resolved principal (session / PAT / org token).
 * Shared by the jwt plugin's `definePayload` (session) and the /v1/token exchange.
 */
export async function principalClaims(p: Principal): Promise<JwtClaims> {
  const scoped = p.scopes && p.scopes.length ? { scopes: p.scopes } : {};
  if (p.actor === 'org') {
    return {
      sub: p.tokenId!,
      act: 'org',
      tid: p.tokenId,
      orgs: p.organizationId && p.role ? { [p.organizationId]: p.role } : {},
      ...scoped,
    };
  }
  // user (session or PAT): inherit the user's LIVE memberships.
  return {
    sub: p.userId!,
    act: 'user',
    ...(p.tokenId ? { tid: p.tokenId } : {}),
    orgs: await userOrgRoles(p.userId!),
    ...scoped,
  };
}

/** Reconstruct a Principal from verified JWT claims (the seam-validated path). */
export function claimsToPrincipal(claims: JwtClaims): Principal {
  const scopes = claims.scopes ?? null;
  if (claims.act === 'org') {
    const [organizationId, role] = Object.entries(claims.orgs ?? {})[0] ?? [];
    return { actor: 'org', via: 'jwt', tokenId: claims.tid ?? claims.sub, organizationId, role, scopes };
  }
  return { actor: 'user', via: 'jwt', userId: claims.sub, tokenId: claims.tid, orgs: claims.orgs ?? {}, scopes };
}
