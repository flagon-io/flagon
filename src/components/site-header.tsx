import Link from "next/link";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { SiteNav } from "@/components/site-nav";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";

/**
 * Marketing header, rendered once in the marketing route-group layout. The
 * nav highlights the current page; the right side is session-aware: Sign in /
 * Get started when anonymous, and when signed in a Dashboard button next to
 * the avatar dropdown (the *.flagon.io session cookie spans www, so www
 * knows you're signed in and should hand you straight to the app).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <FlagonMark className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <SiteNav />
        </div>
        <div className="flex items-center gap-1">
          <UserMenu showDashboardLink />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
