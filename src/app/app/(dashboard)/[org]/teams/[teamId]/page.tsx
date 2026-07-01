import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { db, withTenant } from '@/server/db';
import { members, teamMembers, teams, users } from '@/server/db/schema/auth';
import { projects } from '@/server/db/schema/app';
import { appPath } from '@/lib/site';
import { TeamMembersManager } from './members';

export default async function TeamDetail({
  params,
}: {
  params: Promise<{ org: string; teamId: string }>;
}) {
  const { org: slug, teamId } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const orgId = resolved.org.id;
  const canManage = roleAtLeast(resolved.org.role, 'admin');

  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.organizationId, orgId)))
    .limit(1);
  if (!team) notFound();

  // Everyone in the org (with user detail); who is on this team (+ their team role).
  const orgMembers = await db
    .select({
      userId: members.userId,
      orgRole: members.role,
      name: users.name,
      email: users.email,
      username: users.username,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, orgId))
    .orderBy(asc(users.name));

  const onTeam = await db
    .select({ userId: teamMembers.userId, teamRole: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  const teamRoleByUser = new Map(onTeam.map((r) => [r.userId, r.teamRole]));

  const people = orgMembers.map((m) => ({
    userId: m.userId,
    label: m.name || m.username || m.email,
    email: m.email,
    orgRole: m.orgRole,
    onTeam: teamRoleByUser.has(m.userId),
    teamRole: teamRoleByUser.get(m.userId) ?? 'member',
  }));

  // Projects this team owns (projects are under RLS).
  const ownedProjects = await withTenant(orgId, (tx) =>
    tx
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects)
      .where(eq(projects.teamId, teamId))
      .orderBy(asc(projects.name)),
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href={appPath(`/${slug}/teams`)} className="hover:text-foreground">
          Teams
        </Link>
        <span>/</span>
        <span className="text-foreground">{team.name}</span>
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{team.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Who is on this team and what it owns. Team roles are recorded for future permissions
        but don&apos;t grant access yet.
      </p>

      <TeamMembersManager orgSlug={slug} teamId={teamId} canManage={canManage} people={people} />

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Projects owned ({ownedProjects.length})
        </h2>
        {ownedProjects.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
            This team doesn&apos;t own any projects yet. Assign one from a project&apos;s page.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {ownedProjects.map((p) => (
              <li key={p.id}>
                <Link
                  href={appPath(`/${slug}/projects/${p.id}`)}
                  className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand-500/40"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">{p.slug}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
