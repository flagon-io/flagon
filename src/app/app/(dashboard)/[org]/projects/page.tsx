import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { getOrgBySlug } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { projects } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';
import { CreateProject } from './create-project';

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();

  const rows = await withTenant(resolved.org.id, (tx) =>
    tx
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        // Correlate on the literal `projects.id` — NOT `${projects.id}`, which
        // Drizzle renders unqualified as `"id"` and the subquery binds to the
        // inner table's own id (e.id / f.id), silently counting 0.
        envCount: sql<number>`(select count(*) from environments e where e.project_id = projects.id)`,
        flagCount: sql<number>`(select count(*) from flags f where f.project_id = projects.id)`,
      })
      .from(projects)
      .orderBy(projects.name),
  );

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            A project groups flags, environments, and SDK keys for one application.
          </p>
        </div>
        <CreateProject orgSlug={slug} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-sm text-muted">No projects yet.</p>
          <p className="mt-1 text-xs text-muted">Create your first project to start adding flags.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={appPath(`/${slug}/projects/${p.id}`)}
                className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-500/40"
              >
                <p className="font-medium">{p.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">{p.slug}</p>
                <p className="mt-3 text-xs text-muted">
                  {Number(p.envCount)} environment{Number(p.envCount) === 1 ? '' : 's'} ·{' '}
                  {Number(p.flagCount)} flag{Number(p.flagCount) === 1 ? '' : 's'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
