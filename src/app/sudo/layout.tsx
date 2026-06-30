import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { hasSudoAccess } from '@/server/api/admin';
import { AppShell } from '@/components/app/app-shell';
import type { NavFooterItem, NavSection } from '@/components/app/app-sidebar';
import type { SessionUser } from '@/components/app/user-menu';
import { appHref, appBase } from '@/lib/site';

/**
 * The "sudo" console — internal platform administration, separate from the
 * product. Gated to platform admins only; a non-admin gets a 404 so the surface
 * isn't discoverable. In production this is served at sudo.flagon.io. Shares the
 * app shell (sidebar + account menu) with a distinct, sudo-flavored nav.
 */
export default async function SudoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(appHref('/signin'));

  const admin = await hasSudoAccess({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  if (!admin) notFound();

  const sections: NavSection[] = [
    {
      items: [
        { label: 'Overview', icon: 'home', href: '/sudo', end: true },
        { label: 'Waitlist', icon: 'inbox', href: '/sudo/waitlist' },
        { label: 'Requests', icon: 'lightbulb', href: '/sudo/requests' },
        { label: 'Design', icon: 'palette', href: '/sudo/design' },
      ],
    },
  ];

  const footer: NavFooterItem[] = [
    { label: 'Back to app', icon: 'back', href: appHref('/'), external: Boolean(appBase) },
  ];

  return (
    <AppShell
      user={session.user as SessionUser}
      homeHref="/sudo"
      signOutRedirect={appHref('/signin')}
      sections={sections}
      footer={footer}
      badge="sudo"
    >
      {children}
    </AppShell>
  );
}
