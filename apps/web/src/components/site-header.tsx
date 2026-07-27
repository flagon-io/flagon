import Link from "next/link";
import { brand, FlagonMark } from "@flagon/design";
import { SIGN_IN_URL } from "@/lib/urls";

/**
 * Marketing header for the coming-soon site.
 *
 * Deliberately spare: a logo home-link, a sign-in link for people who already
 * have a production account, and the one thing there is to do before launch,
 * which is get on the list. No product nav (those pages don't exist yet), no
 * sign-up (access is invite-only), and sign-in points at the real app in
 * production rather than a local placeholder.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <FlagonMark className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-tight">
            {brand.name}
          </span>
        </Link>
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
