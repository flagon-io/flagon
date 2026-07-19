import Link from "next/link";

/**
 * App-surface 404. Deliberately ambiguous: an org/resource that doesn't exist
 * and one the viewer isn't allowed to see return the SAME response, so we never
 * leak the existence of private organizations (GitHub-style). Doubles as the
 * "you may need to sign in" prompt.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Not found
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        This page doesn&apos;t exist, or you don&apos;t have access to it. If
        you have an account, sign in to continue.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex h-11 cursor-not-allowed items-center rounded-full bg-teal-500 px-5 text-sm font-medium text-zinc-950 opacity-50"
        >
          Sign in
        </button>
        <Link
          href="/app"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Back to console
        </Link>
      </div>
    </div>
  );
}
