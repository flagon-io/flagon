"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center text-zinc-100">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Error
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Something spilled.
      </h1>
      <p className="mt-3 max-w-md text-zinc-400">
        An unexpected error occurred. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-teal-500 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-teal-400"
      >
        <RotateCw className="h-4 w-4" />
        Try again
      </button>
    </main>
  );
}
