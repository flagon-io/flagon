import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { environments } from '@/server/db/schema/app';
import { EnvironmentsManager } from './manager';

export default async function EnvironmentsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  // Environments are a platform primitive shared across every project, so only
  // admins/owners manage the set (adding one adds it everywhere).
  const canManage = roleAtLeast(resolved.org.role, 'admin');

  const rows = await withTenant(resolved.org.id, (tx) =>
    tx
      .select({
        id: environments.id,
        name: environments.name,
        key: environments.key,
        color: environments.color,
      })
      .from(environments)
      .orderBy(asc(environments.rank), asc(environments.createdAt)),
  );

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Environments</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Environments are shared across every project, so{' '}
            <code className="font-mono text-xs">production</code> means the same thing everywhere.
            They are the promotion ladder your capabilities deploy across.
          </p>
        </div>
      </div>

      <EnvironmentsManager orgSlug={slug} canManage={canManage} environments={rows} />
    </div>
  );
}
