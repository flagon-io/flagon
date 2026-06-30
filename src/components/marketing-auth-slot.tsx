'use client';

import Link from 'next/link';
import { AccessButton } from '@/components/access-button';
import { UserMenu, type SessionUser } from '@/components/app/user-menu';
import { Skeleton } from '@/components/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { appHref } from '@/lib/site';

/**
 * The session-dependent right side of the marketing nav. Read client-side
 * (useSession) so the marketing/docs pages stay statically rendered. Shows a
 * skeleton while the session resolves (no wrong-state flash), then either the
 * signed-out CTAs or Dashboard + account menu.
 */
export function MarketingAuthSlot() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center gap-2" aria-hidden>
        <Skeleton className="hidden h-9 w-16 rounded-lg sm:block" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    );
  }

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
