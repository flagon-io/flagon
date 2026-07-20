import Link from "next/link";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { UserMenu } from "@/components/user-menu";

/**
 * Marketing header, rendered once in the marketing route-group layout. The
 * right side is session-aware: Sign in / Get started when anonymous, the
 * avatar dropdown when signed in (the *.flagon.io session cookie spans www).
 * Nav stays disabled until the corresponding pages exist.
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
          <nav className="hidden items-center gap-1 md:flex">
            {brand.nav.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-zinc-300 transition hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled
                  title="Coming soon"
                  className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-500"
                >
                  {item.label}
                </span>
              ),
            )}
          </nav>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
