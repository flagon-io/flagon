import Link from "next/link";
import { brand, FlagonMark, GridBackdrop } from "@flagon/design";
import { WEB_URL } from "@/lib/urls";

/**
 * Branded 404. In this Next, the root not-found also catches any URL that
 * matches no route (not just notFound() calls), so a mistyped app.flagon.io/…
 * lands here. It renders inside the root layout, so it inherits the app's dark
 * theme and fonts.
 */
export default function NotFound() {
  return (
    <>
      <GridBackdrop />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <a
          href={WEB_URL}
          aria-label={`Back to ${brand.domain}`}
          className="rounded-md transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none"
        >
          <FlagonMark className="size-10" />
        </a>

        <div className="space-y-2">
          <p className="bg-linear-to-br from-teal-300 to-teal-600 bg-clip-text text-6xl font-bold tracking-tight text-transparent">
            404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Page not found
          </h1>
          <p className="mx-auto max-w-xs text-sm/6 text-zinc-400">
            {"That page doesn't exist, or it moved. Check the address, or head back."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
          >
            Go to sign in
          </Link>
          <a
            href={WEB_URL}
            className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-100"
          >
            {`Back to ${brand.domain}`}
          </a>
        </div>
      </main>
    </>
  );
}
