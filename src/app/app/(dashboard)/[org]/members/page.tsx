import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { db } from '@/server/db';
import { invitations, members, users } from '@/server/db/schema/auth';
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
        members={memberRows.map((m) => ({
          id: m.id,
          role: m.role,
          name: m.name,
          email: m.email,
          username: m.username,
          isSelf: m.userId === user.id,
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
