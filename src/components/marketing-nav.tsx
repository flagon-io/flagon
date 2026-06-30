import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/server/auth';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccessButton } from '@/components/access-button';
import { MarketingNavLinks } from '@/components/marketing-nav-links';
import { UserMenu, type SessionUser } from '@/components/app/user-menu';
import { buttonVariants } from '@/components/ui/button';
import { appHref } from '@/lib/site';

/**
 * Marketing header. Reads the session server-side — note we do NOT hit the API:
 * BetterAuth sets cookies on the apex (`.flagon.io`), shared with every
 * subdomain, so `getSession` resolves the user from the cookie right here. When
 * signed in we surface a Dashboard link + account menu (so you can tell), and the
 * apex `/api` can stay a hard 404. Signed out keeps the Sign in / Get started CTAs.
 */
export async function MarketingNav() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <MarketingNavLinks />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session ? (
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
          ) : (
            <>
              <Link
                href={appHref('/signin')}
                className={`${buttonVariants({ variant: 'ghost' })} hidden sm:inline-flex`}
              >
                Sign in
              </Link>
              <AccessButton />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
