import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { environments, flagEnvironments, flags, projects, segments } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';
import type { FlagType, JsonValue, TargetingRule } from '@/core/types';
import { FlagEditor } from './flag-editor';

export default async function FlagDetail({
  params,
}: {
  params: Promise<{ org: string; projectId: string; flagId: string }>;
}) {
  const { org: slug, projectId, flagId } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const canManage = roleAtLeast(resolved.org.role, 'member');

  const data = await withTenant(resolved.org.id, async (tx) => {
    const [flag] = await tx
      .select({
        id: flags.id,
        key: flags.key,
        name: flags.name,
        description: flags.description,
        type: flags.type,
        projectId: flags.projectId,
      })
      .from(flags)
      .where(eq(flags.id, flagId))
      .limit(1);
    if (!flag || flag.projectId !== projectId) return null;

    const [project] = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    const envRows = await tx
      .select({ id: environments.id, name: environments.name, key: environments.key, color: environments.color })
      .from(environments)
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environments.createdAt));

    const cfgRows = await tx
      .select({
        id: flagEnvironments.id,
        environmentId: flagEnvironments.environmentId,
        state: flagEnvironments.state,
        defaultVariant: flagEnvironments.defaultVariant,
        variants: flagEnvironments.variants,
        targeting: flagEnvironments.targeting,
      })
      .from(flagEnvironments)
      .where(eq(flagEnvironments.flagId, flagId));

    const segRows = await tx
      .select({ key: segments.key, name: segments.name })
      .from(segments)
      .where(eq(segments.projectId, projectId))
      .orderBy(asc(segments.name));

    return { flag, project, envRows, cfgRows, segRows };
  });

  if (!data) notFound();
  const { flag, project, envRows, cfgRows, segRows } = data;

  // The flag-level variant set (same across envs); read from any config row.
  const variants = (cfgRows[0]?.variants ?? {}) as Record<string, JsonValue>;

  const envs = envRows.map((env) => {
    const cfg = cfgRows.find((c) => c.environmentId === env.id);
    return {
      ...env,
      configId: cfg?.id ?? null,
      state: (cfg?.state === 'ENABLED' ? 'ENABLED' : 'DISABLED') as 'ENABLED' | 'DISABLED',
      defaultVariant: cfg?.defaultVariant ?? '',
      targeting: (cfg?.targeting ?? []) as TargetingRule[],
    };
  });

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href={appPath(`/${slug}/projects`)} className="hover:text-foreground">
          Projects
        </Link>
        <span>/</span>
        <Link href={appPath(`/${slug}/projects/${projectId}`)} className="hover:text-foreground">
          {project?.name ?? 'Project'}
        </Link>
        <span>/</span>
        <span className="text-foreground">{flag.key}</span>
      </div>

      <FlagEditor
        orgSlug={slug}
        canManage={canManage}
        flag={{
          id: flag.id,
          key: flag.key,
          name: flag.name,
          description: flag.description ?? '',
          type: flag.type as FlagType,
        }}
        variants={variants}
        environments={envs}
        segments={segRows}
      />
    </div>
  );
}
