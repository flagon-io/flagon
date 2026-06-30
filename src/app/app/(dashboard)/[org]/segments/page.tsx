import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { projects, segments } from '@/server/db/schema/app';
import { OrgSegmentsManager } from './manager';

export default async function SegmentsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const canManage = roleAtLeast(resolved.org.role, 'member');

  const data = await withTenant(resolved.org.id, async (tx) => {
    const projectRows = await tx
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(asc(projects.name));

    const segRows = await tx
      .select({
        id: segments.id,
        key: segments.key,
        name: segments.name,
        description: segments.description,
        condition: segments.condition,
        projectId: segments.projectId,
        projectName: projects.name,
      })
      .from(segments)
      .innerJoin(projects, eq(segments.projectId, projects.id))
      .orderBy(asc(projects.name), asc(segments.name));

    return { projectRows, segRows };
  });

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
          <p className="mt-1 text-sm text-muted">
            Reusable audience definitions across every project. Reference them from any flag&rsquo;s
            targeting.
          </p>
        </div>
      </div>

      <OrgSegmentsManager
        orgSlug={slug}
        canManage={canManage}
        projects={data.projectRows}
        segments={data.segRows}
      />
    </div>
  );
}
