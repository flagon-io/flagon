import { notFound } from 'next/navigation';
import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import { getOrgBySlug } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { teams } from '@/server/db/schema/auth';
import { environments, projects } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';
import { CreateProject } from './create-project';

export default async function ProjectsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();

  const { rows, envCount } = await withTenant(resolved.org.id, async (tx) => {
    const rows = await tx
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        team: teams.name,
      })
      .from(projects)
      .leftJoin(teams, eq(teams.id, projects.teamId))
      .orderBy(projects.name);
    // Environments are org-level, so the count is shared across every project.
    const [{ value: envCount }] = await tx.select({ value: count() }).from(environments);
    return { rows, envCount };
  });

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            A project is one application or service you run. Capabilities attach to it per
            environment.
          </p>
        </div>
        <CreateProject orgSlug={slug} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <p className="text-sm text-muted">No projects yet.</p>
          <p className="mt-1 text-xs text-muted">Create your first project to start your catalog.</p>
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
                  {Number(envCount)} environment{Number(envCount) === 1 ? '' : 's'}
                  {p.team ? ` · ${p.team}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
