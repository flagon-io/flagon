import { notFound } from 'next/navigation';
import { getOrgBySlug, getOrgContext } from '@/server/api/org-context';
import { hasSudoAccess } from '@/server/api/admin';
import { AppShell } from '@/components/app/app-shell';
import type { NavFooterItem, NavSection } from '@/components/app/app-sidebar';
import type { SessionUser } from '@/components/app/user-menu';
import { appPath, sudoBase } from '@/lib/site';

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const resolved = await getOrgBySlug(slug);
  // Not a member (or no such org) — don't reveal it exists.
  if (!resolved) notFound();

  const ctx = await getOrgContext();
  const sudo = await hasSudoAccess(resolved.user);
  const user = (ctx?.user ?? resolved.user) as SessionUser;
  const base = appPath(`/${slug}`);
  const b = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // regex-escape for `match`

  // The Catalog primitives: Projects and Environments are org-level and sit
  // top-level. Capabilities (Feature Flags, …) will add their own nav here as they
  // are rebuilt on the project × environment grid.
  const sections: NavSection[] = [
    {
      items: [
        { label: 'Overview', icon: 'home', href: base, end: true },
        {
          label: 'Projects',
          icon: 'projects',
          href: `${base}/projects`,
          match: `^${b}/projects(/[^/]+)?/?$`,
        },
        {
          label: 'Environments',
          icon: 'environments',
          href: `${base}/environments`,
          match: `^${b}/environments`,
        },
      ],
    },
    {
      title: 'Feature Flags',
      items: [
        { label: 'Flags', icon: 'flag', soon: true },
        { label: 'Segments', icon: 'segment', soon: true },
      ],
    },
    {
      title: 'Organization',
      items: [
        { label: 'Teams', icon: 'teams', href: `${base}/teams` },
        { label: 'Members', icon: 'users', href: `${base}/members` },
        { label: 'Settings', icon: 'settings', href: `${base}/settings` },
      ],
    },
  ];

  const footer: NavFooterItem[] = sudo
    ? [{ label: 'Sudo', icon: 'sudo', href: sudoBase || '/sudo', external: Boolean(sudoBase) }]
    : [];

  return (
    <AppShell
      user={user}
      homeHref={base}
      signOutRedirect={appPath('/signin')}
      sections={sections}
      footer={footer}
      orgs={ctx?.orgs ?? []}
      activeSlug={slug}
    >
      {children}
    </AppShell>
  );
}
