import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, eq, sql } from 'drizzle-orm';
import { getOrgBySlug } from '@/server/api/org-context';
import { db, withTenant } from '@/server/db';
import { invitations } from '@/server/db/schema/auth';
import { projects } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';

export default async function OrgOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const { org, user } = resolved;

  const [pending] = await db
    .select({ c: sql<number>`count(*)` })
    .from(invitations)
    .where(
      and(
        eq(invitations.status, 'pending'),
        sql`lower(${invitations.email}) = ${user.email.toLowerCase()}`,
      ),
    );
  const pendingCount = Number(pending?.c ?? 0);

  const projectRows = await withTenant(org.id, (tx) =>
    tx.select({ id: projects.id, name: projects.name, slug: projects.slug }).from(projects),
  );

  return (
    <div>
      {pendingCount > 0 && (
        <Link
          href={appPath('/invitations')}
          className="mb-6 flex items-center justify-between rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm"
        >
          <span>
            You have {pendingCount} pending organization invitation{pendingCount === 1 ? '' : 's'}.
          </span>
          <span className="font-medium text-brand-500">Review →</span>
        </Link>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Organization</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="font-mono">{org.slug}</span> · {org.role}
        </p>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Projects</h2>
          <Link
            href={appPath(`/${slug}/projects`)}
            className="text-sm font-medium text-brand-500 hover:text-brand-400"
          >
            Manage projects →
          </Link>
        </div>
        {projectRows.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <p className="text-sm text-muted">No projects yet.</p>
            <p className="mt-1 text-xs text-muted">
              Head to{' '}
              <Link href={appPath(`/${slug}/projects`)} className="text-brand-500 hover:text-brand-400">
                Projects
              </Link>{' '}
              to create your first one.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projectRows.map((p) => (
              <li key={p.id}>
                <Link
                  href={appPath(`/${slug}/projects/${p.id}`)}
                  className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-500/40"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted">{p.slug}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
