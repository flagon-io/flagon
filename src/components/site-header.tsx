import Link from "next/link";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";

/**
 * Marketing header, rendered once in the marketing route-group layout. Nav +
 * auth actions are wired but disabled until the corresponding routes exist.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <FlagonMark className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {brand.nav.map((item) => (
              <span
                key={item}
                aria-disabled
                title="Coming soon"
                className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-500"
              >
                {item}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-500"
          >
            Sign in
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="ml-1 cursor-not-allowed rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 opacity-50"
          >
            Get started
          </button>
        </div>
      </div>
    </header>
  );
}
