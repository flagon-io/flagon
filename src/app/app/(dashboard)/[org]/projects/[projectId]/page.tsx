import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { db, withTenant } from '@/server/db';
import { teams } from '@/server/db/schema/auth';
import { environments, projects } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';
import { ProjectTeam } from './project-team';

export default async function ProjectWorkspace({
  params,
}: {
  params: Promise<{ org: string; projectId: string }>;
}) {
  const { org: slug, projectId } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const canManage = roleAtLeast(resolved.org.role, 'admin');

  const data = await withTenant(resolved.org.id, async (tx) => {
    const [project] = await tx
      .select({ id: projects.id, name: projects.name, slug: projects.slug, teamId: projects.teamId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return null;

    // Environments are org-level; every project inherits the whole set.
    const envRows = await tx
      .select({ id: environments.id, name: environments.name, key: environments.key, color: environments.color })
      .from(environments)
      .orderBy(asc(environments.rank), asc(environments.createdAt));

    return { project, envRows };
  });

  if (!data) notFound();
  const { project, envRows } = data;

  // Teams (auth table, not RLS) for the owning-team picker.
  const orgTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.organizationId, resolved.org.id))
    .orderBy(asc(teams.createdAt));

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href={appPath(`/${slug}/projects`)} className="hover:text-foreground">
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{project.name}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="font-mono text-xs text-muted">{project.slug}</p>
        <ProjectTeam
          orgSlug={slug}
          projectId={project.id}
          teamId={project.teamId}
          teams={orgTeams}
          canManage={canManage}
        />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Environments</h2>
          <Link
            href={appPath(`/${slug}/environments`)}
            className="text-xs text-muted transition-colors hover:text-foreground"
          >
            Manage environments →
          </Link>
        </div>
        {envRows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
            No environments yet.{' '}
            <Link href={appPath(`/${slug}/environments`)} className="text-brand-400 hover:underline">
              Add one
            </Link>{' '}
            to give this project a place to run.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {envRows.map((env) => (
              <li
                key={env.id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-4"
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: env.color }} />
                <div>
                  <p className="font-medium">{env.name}</p>
                  <p className="font-mono text-xs text-muted">{env.key}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Capabilities</h2>
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
          Capabilities like Feature Flags attach to this project per environment. They&apos;re being
          rebuilt on the new platform and will show up here.
        </p>
      </section>
    </div>
  );
}
