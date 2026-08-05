"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Workspace-scoped 404. A signed-in user who mistypes a URL inside their org gets a
 * "back to your workspace" path (not the root not-found's "go to sign in", which is
 * wrong for someone already authenticated). Renders inside [org]/layout, so the
 * shell stays.
 */
export default function WorkspaceNotFound() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="space-y-2">
        <p className="font-mono text-xs text-zinc-600">404</p>
        <h1 className="text-lg font-semibold text-zinc-100">Page not found</h1>
        <p className="mx-auto max-w-sm text-sm/6 text-zinc-400">
          This page doesn&apos;t exist or has moved. The rest of your workspace is right where you
          left it.
        </p>
      </div>
      {slug ? (
        <Link
          href={`/${slug}`}
          className="inline-flex h-10 items-center rounded-md bg-teal-500 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
        >
          Back to workspace
        </Link>
      ) : null}
    </div>
  );
}
