import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { getOrgBySlug } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { flags, projects } from '@/server/db/schema/app';
import { Badge } from '@/components/ui/badge';
import { appPath } from '@/lib/site';

/**
 * Read-only flags list — the landing surface of the Feature Flags product. The
 * full authoring UI (create/edit variants + targeting, publish, SDK keys) is the
 * next milestone; the management API + RLS + publish + OFREP serving already
 * exist behind it.
 */
export default async function FlagsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();

  const rows = await withTenant(resolved.org.id, (tx) =>
    tx
      .select({
        id: flags.id,
        projectId: flags.projectId,
        key: flags.key,
        name: flags.name,
        type: flags.type,
        archived: flags.archived,
        project: projects.name,
        updatedAt: flags.updatedAt,
      })
      .from(flags)
      .innerJoin(projects, eq(flags.projectId, projects.id))
      .orderBy(desc(flags.updatedAt)),
  );

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flags</h1>
          <p className="mt-1 text-sm text-muted">
            Every flag across this organization&rsquo;s projects. Open one to edit variants and
            targeting, or create flags inside a <Link href={appPath(`/${slug}/projects`)} className="text-brand-500 hover:text-brand-400">project</Link>.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-sm text-muted">No flags yet.</p>
          <p className="mt-1 text-xs text-muted">
            Create your first project and flag from{' '}
            <Link href={appPath(`/${slug}/projects`)} className="text-brand-500 hover:text-brand-400">
              Projects
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-136 text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Flag</th>
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={appPath(`/${slug}/projects/${f.projectId}/flags/${f.id}`)}
                      className="font-medium hover:text-brand-500"
                    >
                      {f.name}
                    </Link>
                    <div className="font-mono text-xs text-muted">{f.key}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{f.project}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted">{f.type}</span>
                  </td>
                  <td className="px-4 py-3">
                    {f.archived ? (
                      <Badge variant="neutral">archived</Badge>
                    ) : (
                      <Badge variant="success">active</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
