import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appPath, resolveNext, stripAppPrefix } from "@/lib/urls";
import { auth } from "@/lib/auth";

/**
 * Session gates for app pages and layouts.
 *
 * The point of gathering them here is that every gate remembers where an
 * anonymous visitor was headed: `requireSession` redirects to sign-in with a
 * `next` param, and the sign-in flow sends the user back there. Doing this in
 * one place is what stops the next new page from copy-pasting a bare
 * `redirect(appPath("/signin"))` that drops the destination on the floor.
 */

type AppSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * Read the current session once per request. A layout and the page it wraps
 * both gate, so without `cache` that is two identical `getSession` round-trips
 * on every navigation; `cache` collapses them to one.
 */
const getCurrentSession = cache(
  async (): Promise<AppSession | null> =>
    auth.api.getSession({ headers: await headers() }),
);

/**
 * Gate a page or layout on an authenticated session. With no session it
 * redirects to sign-in, preserving the current location as `next` (read from
 * the proxy-stamped header) so the user lands back there once signed in.
 * Otherwise it returns the session for the caller to use directly.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getCurrentSession();
  if (session) return session;
  redirect(signInHref(await headers()));
}

/**
 * Signed-in users have no business on the sign-in / sign-up forms; bounce them
 * to where they were headed (a valid `next`) or the console root.
 */
export async function redirectIfAuthenticated(next?: string): Promise<void> {
  const session = await getCurrentSession();
  if (session) redirect(resolveNext(next) ?? appPath(""));
}

/**
 * The sign-in URL for a gated request, carrying the current location as `next`.
 * The destination is dropped for the app root and for the auth pages
 * themselves, so we never round-trip someone back onto a login form.
 */
function signInHref(requestHeaders: Headers): string {
  const signin = appPath("/signin");
  const dest = stripAppPrefix(requestHeaders.get("x-app-pathname") ?? "");
  const search = requestHeaders.get("x-app-search") ?? "";
  if (
    !dest ||
    dest === "/" ||
    dest.startsWith("/signin") ||
    dest.startsWith("/signup")
  ) {
    return signin;
  }
  return `${signin}?next=${encodeURIComponent(dest + search)}`;
}
