import { redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq, sql } from 'drizzle-orm';
import { getOrgContext } from '@/server/api/org-context';
import { db } from '@/server/db';
import { invitations, organizations } from '@/server/db/schema/auth';
import { AppTopbar } from '@/components/app/app-topbar';
import { Logo } from '@/components/logo';
import type { SessionUser } from '@/components/app/user-menu';
import { appPath } from '@/lib/site';
import { InvitationActions } from './actions';

export default async function InvitationsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect(appPath('/signin'));

  const rows = await db
    .select({
      id: invitations.id,
      orgName: organizations.name,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .where(
      and(
        eq(invitations.status, 'pending'),
        sql`lower(${invitations.email}) = ${ctx.user.email.toLowerCase()}`,
      ),
    );

  const homeHref = ctx.active ? appPath(`/${ctx.active.slug}`) : appPath('/');

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopbar
        user={ctx.user as SessionUser}
        homeHref={homeHref}
        signOutRedirect={appPath('/signin')}
        left={
          <Link href={homeHref} className="flex items-center">
            <Logo />
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invitations</h1>
      <p className="mt-1 text-sm text-muted">
        Organizations that have invited <span className="font-mono text-foreground">{ctx.user.email}</span>.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted">
          No pending invitations.
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div>
                <p className="font-medium">{r.orgName}</p>
                <p className="text-xs text-muted">Role: {r.role}</p>
              </div>
              <InvitationActions invitationId={r.id} />
            </li>
          ))}
        </ul>
      )}
        </div>
      </main>
    </div>
  );
}
