import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { members, organizations } from '@/server/db/schema/auth';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  logo: string | null;
}

/**
 * Resolve a single org the current user belongs to, addressed by slug. Returns
 * null if not signed in or not a member — used to gate org-scoped routes.
 */
export async function getOrgBySlug(slug: string): Promise<{ user: { id: string; email: string; name: string }; org: OrgSummary } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: members.role,
      logo: organizations.logo,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(and(eq(organizations.slug, slug), eq(members.userId, session.user.id)))
    .limit(1);
  if (!org) return null;
  return { user: session.user, org };
}

/**
 * Resolve the signed-in user, their organizations, and the active one (from the
 * session's activeOrganizationId, falling back to the first). Server-only.
 */
export async function getOrgContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const orgs: OrgSummary[] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: members.role,
      logo: organizations.logo,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, session.user.id));

  const activeId =
    (session.session as { activeOrganizationId?: string }).activeOrganizationId ?? orgs[0]?.id;
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  return { session, user: session.user, orgs, active, activeId: active?.id };
}

const RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
export function roleAtLeast(role: string | undefined, min: 'member' | 'admin' | 'owner') {
  return (RANK[role ?? ''] ?? -1) >= RANK[min];
}
