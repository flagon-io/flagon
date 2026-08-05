"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@flagon/design";

/**
 * Workspace-scoped error boundary. Because it lives under [org]/layout, a thrown
 * error in any workspace page renders HERE inside the shell — the sidebar and topbar
 * stay put and only the content region shows the error, instead of the root
 * boundary replacing the whole app. Session is untouched (an error here, including a
 * briefly-unreachable auth API, is not a sign-out). Reported to Sentry (inert
 * without a DSN); no toast, to avoid double-firing with this page.
 */
export default function WorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-zinc-100">This page hit a snag</h1>
        <p className="mx-auto max-w-sm text-sm/6 text-zinc-400">
          Your session is safe and the rest of your workspace is fine. Try again, and we&apos;ve been
          notified.
        </p>
        {error.digest ? (
          <p className="pt-1 font-mono text-xs text-zinc-600">Reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" onClick={() => unstable_retry()}>
          Try again
        </Button>
        {slug ? (
          <Link
            href={`/${slug}`}
            className="inline-flex h-10 items-center rounded-md border border-white/10 bg-white/5 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
          >
            Back to workspace
          </Link>
        ) : null}
      </div>
    </div>
  );
}
