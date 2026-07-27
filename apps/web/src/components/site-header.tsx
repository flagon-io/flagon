import Link from "next/link";
import { brand, FlagonMark } from "@flagon/design";
import { SIGN_IN_URL } from "@/lib/urls";

/**
 * The top-level sections the marketing site will grow into. They render now as
 * inert, clearly-disabled labels so the nav's final shape is visible before the
 * pages exist; each becomes a real link as it ships. Sign-up stays absent on
 * purpose (access is invite-only).
 */
const NAV_ITEMS = ["Products", "Resources", "Enterprise", "Pricing"] as const;

/**
 * Marketing header for the coming-soon site.
 *
 * Deliberately spare: a logo home-link, a preview of the product nav (disabled
 * until those pages exist), a sign-in link for people who already have a
 * production account, and the one thing there is to do before launch, which is
 * get on the list. Sign-in points at the real app in production rather than a
 * local placeholder.
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
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map((label) => (
              <span
                key={label}
                aria-disabled="true"
                title="Coming soon"
                className="cursor-not-allowed text-sm font-medium text-zinc-500 select-none"
              >
                {label}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <a
            href={SIGN_IN_URL}
            className="text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
          >
            Sign in
          </a>
          <a
            href="#waitlist"
            className="rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
          >
            Get early access
          </a>
        </div>
      </div>
    </header>
  );
}
