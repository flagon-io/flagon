import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { API_SCOPES } from '@/server/api/scopes';
import { db } from '@/server/db';
import { apiTokens } from '@/server/db/schema/app';
import { DangerZone, OrgSettingsForm } from './form';
import { OrgApiTokens } from './org-tokens';

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
const ASSIGNABLE_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

export default async function OrgSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const { org } = resolved;
  const canManage = roleAtLeast(org.role, 'admin');
  const isOwner = org.role === 'owner';

  const tokenRows = canManage
    ? await db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          prefix: apiTokens.prefix,
          role: apiTokens.role,
          lastUsedAt: apiTokens.lastUsedAt,
          expiresAt: apiTokens.expiresAt,
          revokedAt: apiTokens.revokedAt,
          scopes: apiTokens.scopes,
        })
        .from(apiTokens)
        .where(and(eq(apiTokens.organizationId, org.id), eq(apiTokens.kind, 'org')))
        .orderBy(desc(apiTokens.createdAt))
    : [];
  const orgTokens = tokenRows.map((t) => ({
    ...t,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
  }));
  // A creator can only grant up to their own role (and never 'owner').
  const roleOptions = ASSIGNABLE_ROLES.filter((r) => ROLE_RANK[r.value]! <= ROLE_RANK[org.role]!);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage {org.name}.</p>

      <div className="mt-8 max-w-2xl space-y-6">
        <OrgSettingsForm
          org={{ id: org.id, name: org.name, slug: org.slug, logo: org.logo }}
          canManage={canManage}
        />
        {canManage && (
          <OrgApiTokens
            orgSlug={org.slug}
            tokens={orgTokens}
            roleOptions={roleOptions}
            scopeOptions={API_SCOPES.map((s) => ({ value: s.value, label: s.label }))}
            canManage={canManage}
          />
        )}
        {isOwner && <DangerZone org={{ id: org.id, name: org.name, slug: org.slug }} />}
      </div>
    </div>
  );
}
