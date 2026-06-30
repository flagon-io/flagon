import { headers } from 'next/headers';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { invitations, organizations } from '@/server/db/schema/auth';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui/button';
import { appPath } from '@/lib/site';
import { InvitationActions } from '../../(dashboard)/invitations/actions';
import { SwitchAccount } from './switch-account';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center border-b border-border px-4">
        <Link href={appPath('/')} className="flex items-center">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          {children}
        </div>
      </main>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [invite] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      orgName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .where(eq(invitations.id, id))
    .limit(1);

  const expired = invite ? invite.expiresAt.getTime() < Date.now() : false;
  if (!invite || invite.status !== 'pending' || expired) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-muted">
          This invitation has already been used, was revoked, or has expired. Ask whoever invited you
          to send a new one.
        </p>
        <Link href={appPath('/')} className={`${buttonVariants({ variant: 'secondary' })} mt-6`}>
          Go to Flagon
        </Link>
      </Shell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const sameEmail = session && session.user.email.toLowerCase() === invite.email.toLowerCase();

  // Signed in as the invited user — let them accept/decline.
  if (session && sameEmail) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">Join {invite.orgName}</h1>
        <p className="mt-2 text-sm text-muted">
          You&rsquo;ve been invited to <span className="font-medium text-foreground">{invite.orgName}</span>{' '}
          as <span className="font-medium text-foreground">{invite.role}</span>.
        </p>
        <div className="mt-6 flex justify-center">
          <InvitationActions invitationId={id} />
        </div>
      </Shell>
    );
  }

  // Signed in as someone else — be explicit about the mismatch.
  if (session && !sameEmail) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">Wrong account</h1>
        <p className="mt-2 text-sm text-muted">
          This invitation to <span className="font-medium text-foreground">{invite.orgName}</span> is for{' '}
          <span className="font-mono text-foreground">{invite.email}</span>, but you&rsquo;re signed in as{' '}
          <span className="font-mono text-foreground">{session.user.email}</span>.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <SwitchAccount />
          <Link href={appPath('/')} className={buttonVariants({ variant: 'ghost' })}>
            Continue as {session.user.email}
          </Link>
        </div>
      </Shell>
    );
  }

  // Signed out — prompt to sign in / create the invited account.
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Join {invite.orgName}</h1>
      <p className="mt-2 text-sm text-muted">
        You&rsquo;ve been invited to <span className="font-medium text-foreground">{invite.orgName}</span>{' '}
        as <span className="font-medium text-foreground">{invite.role}</span>. This invite is for{' '}
        <span className="font-mono text-foreground">{invite.email}</span>. Sign in or create your
        account with that address, then accept it.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link href={appPath('/signup')} className={buttonVariants()}>
          Create account
        </Link>
        <Link href={appPath('/signin')} className={buttonVariants({ variant: 'secondary' })}>
          Sign in
        </Link>
      </div>
    </Shell>
  );
}
