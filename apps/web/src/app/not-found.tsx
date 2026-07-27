import Link from "next/link";
import { GridBackdrop } from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * Branded 404 for the marketing site. The root not-found also catches any URL
 * that matches no route, so a mistyped flagon.io/… lands here. It wears the
 * same header (logo + nav) and footer as every other page so a wrong turn still
 * feels like the site, not a dead end.
 */
export default function NotFound() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <div className="space-y-2">
          <p className="bg-linear-to-br from-teal-300 to-teal-600 bg-clip-text text-6xl font-bold tracking-tight text-transparent">
            404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Page not found
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-6 text-zinc-400">
            {"That page doesn't exist, or it hasn't shipped yet. Head back home."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
          >
            Back to home
          </Link>
          <Link
            href="/#waitlist"
            className="rounded-md border border-white/20 bg-white/4 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-white/40 hover:bg-white/8"
          >
            Get early access
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
