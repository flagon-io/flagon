/**
 * GET /api/v1/me - the identity behind the request and the orgs it can act in.
 * Works for a session, a user PAT (returns the user + their orgs), or an org
 * token (returns the bound org + the token's role).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { members, organizations, users } from '@/server/db/schema/auth';
import { apiError, authenticatedPrincipal, isResponse, json } from '@/server/api/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const principal = await authenticatedPrincipal(req);
  if (isResponse(principal)) return principal;

  // Org service token: no human identity — report the bound org + role.
  if (principal.actor === 'org') {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, principal.organizationId ?? ''))
      .limit(1);
    return json({
      actor: 'org',
      token: { id: principal.tokenId, role: principal.role },
      organization: org ?? null,
    });
  }

  // User (session or PAT).
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, principal.userId ?? ''))
    .limit(1);
  if (!user) return apiError(401, 'Unauthenticated.');

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: members.role,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, user.id));

  return json({ actor: 'user', user, organizations: orgs });
}
