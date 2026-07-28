"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Route-level error boundary for the console. Renders inside the root layout, so
 * it inherits the dark theme and fonts. Every error that lands here is reported
 * to Sentry (inert unless the DSN is set) with its digest, so a user-facing
 * "something went wrong" always has a matching server-side record.
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
    <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Something went wrong
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-6 text-zinc-400">
          {"An unexpected error interrupted that page. You can try again, and we've been notified."}
        </p>
        {error.digest ? (
          <p className="pt-1 font-mono text-xs text-zinc-600">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
