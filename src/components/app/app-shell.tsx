import { AppTopbar } from '@/components/app/app-topbar';
import { AppSidebar, type NavFooterItem, type NavSection } from '@/components/app/app-sidebar';
import { MobileNav } from '@/components/app/mobile-nav';
import type { Org } from '@/components/org-switcher';
import type { SessionUser } from '@/components/app/user-menu';

/**
 * The logged-in application shell: a fixed left sidebar (org selector header +
 * grouped nav + bottom collapse) beside a column with a slim top header (account
 * menu top-right) over scrolling page content. Used by both the product dashboard
 * (org switcher header) and the sudo console (brand header) — same chrome, different nav.
 */
export function AppShell({
  user,
  homeHref,
  signOutRedirect,
  sections,
  footer,
  orgs,
  activeSlug,
  badge,
  children,
}: {
  user: SessionUser;
  homeHref: string;
  signOutRedirect: string;
  sections: NavSection[];
  footer?: NavFooterItem[];
  orgs?: Org[];
  activeSlug?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar
        sections={sections}
        footer={footer}
        orgs={orgs}
        activeSlug={activeSlug}
        brandHref={homeHref}
        badge={badge}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          user={user}
          homeHref={homeHref}
          signOutRedirect={signOutRedirect}
          left={
            <MobileNav
              sections={sections}
              footer={footer}
              orgs={orgs}
              activeSlug={activeSlug}
              brandHref={homeHref}
              badge={badge}
            />
          }
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
