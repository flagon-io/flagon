import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { db } from '@/server/db';
import { invitations, members, teamMembers, teams, users } from '@/server/db/schema/auth';
import { MembersManager } from './manage';

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  if (!resolved) notFound();
  const { org, user } = resolved;

  const orgId = org.id;
  const canManage = roleAtLeast(org.role, 'admin');

  const memberRows = await db
    .select({
      id: members.id,
      role: members.role,
      userId: members.userId,
      name: users.name,
      email: users.email,
      username: users.username,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, orgId));

  const inviteRows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(and(eq(invitations.organizationId, orgId), eq(invitations.status, 'pending')));

  // Teams in the org + who is on which (with team role), to show + manage per member.
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.organizationId, orgId))
    .orderBy(asc(teams.createdAt));

  const membershipRows = await db
    .select({
      userId: teamMembers.userId,
      teamId: teamMembers.teamId,
      teamRole: teamMembers.role,
      teamName: teams.name,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teams.organizationId, orgId));

  const teamsByUser = new Map<string, { id: string; name: string; role: string }[]>();
  for (const r of membershipRows) {
    const list = teamsByUser.get(r.userId) ?? [];
    list.push({ id: r.teamId, name: r.teamName, role: r.teamRole });
    teamsByUser.set(r.userId, list);
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{org.name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Members &amp; invites</h1>
      <p className="mt-1 text-sm text-muted">
        {memberRows.length} member{memberRows.length === 1 ? '' : 's'}
        {inviteRows.length > 0 ? ` · ${inviteRows.length} pending` : ''}
      </p>

      <MembersManager
        orgId={orgId}
        orgSlug={slug}
        allTeams={teamRows}
        members={memberRows.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          name: m.name,
          email: m.email,
          username: m.username,
          isSelf: m.userId === user.id,
          teams: teamsByUser.get(m.userId) ?? [],
        }))}
        invites={inviteRows.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
        }))}
        canManage={canManage}
      />
    </div>
  );
}
