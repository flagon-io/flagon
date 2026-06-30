'use client';

import Link from 'next/link';
import { AccessButton } from '@/components/access-button';
import { UserMenu, type SessionUser } from '@/components/app/user-menu';
import { buttonVariants } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { appHref } from '@/lib/site';

/**
 * The session-dependent right side of the marketing nav. Read client-side
 * (useSession) so the marketing/docs pages stay statically rendered; signed-out
 * CTAs show first, then swap to Dashboard + account menu once the session loads.
 */
export function MarketingAuthSlot() {
  const { data: session } = useSession();

  if (session) {
    return (
      <>
        <Link
          href={appHref('/')}
          className={`${buttonVariants({ variant: 'secondary' })} hidden sm:inline-flex`}
        >
          Dashboard
        </Link>
        <UserMenu
          user={session.user as SessionUser}
          homeHref={appHref('/')}
          signOutRedirect="/"
          accountHref={appHref('/settings')}
        />
      </>
    );
  }

  return (
    <>
      <Link
        href={appHref('/signin')}
        className={`${buttonVariants({ variant: 'ghost' })} hidden sm:inline-flex`}
      >
        Sign in
      </Link>
      <AccessButton />
    </>
  );
}
