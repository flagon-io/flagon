"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

/**
 * Route-level error boundary for the marketing site. Renders inside the root
 * layout, so it keeps the dark theme and fonts. Reports to Sentry (inert unless
 * the DSN is set) so a visible failure always has a matching server record.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Something went wrong
        </h1>
        <p className="mx-auto max-w-sm text-sm/6 text-zinc-400">
          {"An unexpected error interrupted that page. Try again, or head back home."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-white/20 bg-white/4 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-white/40 hover:bg-white/8"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
