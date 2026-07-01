import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, count, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { db } from '@/server/db';
import { teamMembers, teams } from '@/server/db/schema/auth';
import { appPath } from '@/lib/site';
import { CreateTeam } from './create-team';

export default async function TeamsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const canManage = roleAtLeast(resolved.org.role, 'admin');

  // Teams are a better-auth table (not under RLS); scope by organizationId.
  const rows = await db
    .select({ id: teams.id, name: teams.name, memberCount: count(teamMembers.userId) })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(eq(teams.organizationId, resolved.org.id))
    .groupBy(teams.id, teams.name, teams.createdAt)
    .orderBy(asc(teams.createdAt));

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Teams own projects. Every organization has a default team; add more to split
            ownership across groups.
          </p>
        </div>
        {canManage && <CreateTeam orgSlug={slug} />}
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={appPath(`/${slug}/teams/${t.id}`)}
              className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-500/40"
            >
              <p className="font-medium">{t.name}</p>
              <p className="mt-2 text-xs text-muted">
                {Number(t.memberCount)} member{Number(t.memberCount) === 1 ? '' : 's'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
