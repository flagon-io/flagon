import { notFound } from 'next/navigation';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { DangerZone, OrgSettingsForm } from './form';

export default async function OrgSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const { org } = resolved;
  const canManage = roleAtLeast(org.role, 'admin');
  const isOwner = org.role === 'owner';

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage {org.name}.</p>

      <div className="mt-8 max-w-2xl space-y-6">
        <OrgSettingsForm
          org={{ id: org.id, name: org.name, slug: org.slug, logo: org.logo }}
          canManage={canManage}
        />
        {isOwner && <DangerZone org={{ id: org.id, name: org.name, slug: org.slug }} />}
      </div>
    </div>
  );
}
