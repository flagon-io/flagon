import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarketingNavLinks } from '@/components/marketing-nav-links';
import { MarketingAuthSlot } from '@/components/marketing-auth-slot';

/**
 * Marketing header. Server-rendered and static — the session-dependent buttons
 * live in <MarketingAuthSlot> (a client island), so the marketing/docs/legal
 * pages prerender as static content instead of being forced server-on-demand.
 */
export function MarketingNav() {
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
          <MarketingAuthSlot />
        </div>
      </div>
    </header>
  );
}
