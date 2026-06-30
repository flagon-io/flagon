import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, desc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { environments, flags, projects, sdkKeys, segments } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';
import { EnvironmentsSection } from './environments-section';
import { FlagsSection } from './flags-section';
import { SegmentsSection } from './segments-section';

export default async function ProjectWorkspace({
  params,
}: {
  params: Promise<{ org: string; projectId: string }>;
}) {
  const { org: slug, projectId } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const canManage = roleAtLeast(resolved.org.role, 'member');

  const data = await withTenant(resolved.org.id, async (tx) => {
    const [project] = await tx
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return null;

    const envRows = await tx
      .select({ id: environments.id, name: environments.name, key: environments.key, color: environments.color })
      .from(environments)
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environments.createdAt));

    const keyRows = await tx
      .select({
        id: sdkKeys.id,
        name: sdkKeys.name,
        prefix: sdkKeys.prefix,
        scope: sdkKeys.scope,
        environmentId: sdkKeys.environmentId,
        revokedAt: sdkKeys.revokedAt,
        lastUsedAt: sdkKeys.lastUsedAt,
      })
      .from(sdkKeys)
      .orderBy(desc(sdkKeys.createdAt));

    const flagRows = await tx
      .select({ id: flags.id, key: flags.key, name: flags.name, type: flags.type, archived: flags.archived })
      .from(flags)
      .where(eq(flags.projectId, projectId))
      .orderBy(desc(flags.updatedAt));

    const segRows = await tx
      .select({
        id: segments.id,
        key: segments.key,
        name: segments.name,
        description: segments.description,
        condition: segments.condition,
      })
      .from(segments)
      .where(eq(segments.projectId, projectId))
      .orderBy(asc(segments.name));

    return { project, envRows, keyRows, flagRows, segRows };
  });

  if (!data) notFound();
  const { project, envRows, keyRows, flagRows, segRows } = data;
  const envIds = new Set(envRows.map((e) => e.id));

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
      <p className="mt-1 font-mono text-xs text-muted">{project.slug}</p>

      <EnvironmentsSection
        orgSlug={slug}
        projectId={project.id}
        canManage={canManage}
        environments={envRows}
        sdkKeys={keyRows.filter((k) => envIds.has(k.environmentId))}
      />

      <FlagsSection
        orgSlug={slug}
        projectId={project.id}
        canManage={canManage}
        hasEnvironments={envRows.length > 0}
        flags={flagRows}
      />

      <SegmentsSection
        orgSlug={slug}
        projectId={project.id}
        canManage={canManage}
        segments={segRows}
      />
    </div>
  );
}
