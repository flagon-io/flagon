import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu, type SessionUser } from '@/components/app/user-menu';
import { appPath } from '@/lib/site';

/**
 * Slim top header: optional left slot (brand for standalone pages; empty inside
 * the shell, where the sidebar owns brand/org context) and the account menu
 * pinned top-right, alongside the theme toggle.
 */
export function AppTopbar({
  user,
  homeHref,
  signOutRedirect,
  left,
}: {
  user: SessionUser;
  homeHref: string;
  signOutRedirect: string;
  left?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 pl-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">{left}</div>
      <div className="flex h-full items-center">
        <ThemeToggle />
        {/* Full-height divider so the account area reads as its own zone. */}
        <div className="ml-2 flex h-full items-center gap-2 border-l border-border px-4">
          <UserMenu
            user={user}
            homeHref={homeHref}
            signOutRedirect={signOutRedirect}
            accountHref={appPath('/settings')}
          />
        </div>
      </div>
    </header>
  );
}
