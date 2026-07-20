import { appPath } from "@/lib/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * App-surface 404. Deliberately ambiguous: an org/resource that doesn't exist
 * and one the viewer isn't allowed to see return the SAME response, so we
 * never leak the existence of private organizations. Session-aware: signed-in
 * users get a working path back to their console instead of a sign-in prompt.
 */
export default async function AppNotFound() {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Not found
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        {session
          ? "This page doesn't exist, or you don't have access to it. Check the address, or head back to your console."
          : "This page doesn't exist, or you don't have access to it. If you have an account, sign in to continue."}
      </p>
      <div className="mt-8 flex items-center gap-4">
        {session ? (
          <Link
            href={appPath("")}
            className="inline-flex h-10 items-center rounded-md bg-teal-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
          >
            Back to console
          </Link>
        ) : (
          <>
            <Link
              href={appPath("/signin")}
              className="inline-flex h-10 items-center rounded-md bg-teal-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Sign in
            </Link>
            <Link
              href={appPath("")}
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Back to console
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
