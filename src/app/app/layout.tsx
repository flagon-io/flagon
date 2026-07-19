import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";

/**
 * Application shell - served at `app.flagon.io` (locally `/app`). Intentionally
 * distinct from the marketing chrome; this is the product surface. Not indexed.
 */
export const metadata: Metadata = {
  title: {
    default: `${brand.name} Console`,
    template: `%s · ${brand.name}`,
  },
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-[#09090b] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Link href="/app" className="flex items-center gap-2">
              <FlagonMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight">
                {brand.name}
              </span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-sm text-zinc-400">Console</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-500">
              Preview
            </span>
            <div
              className="h-7 w-7 rounded-full bg-white/10"
              aria-hidden
              title="Account (coming soon)"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        {children}
      </main>
    </div>
  );
}
