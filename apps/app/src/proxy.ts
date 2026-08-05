import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Route gate (Next 16's `proxy`, formerly `middleware`).
 *
 * OPTIMISTIC only: it checks the PRESENCE of the session cookie without hitting
 * the database, so it is cheap and edge-safe. Its single job is to send
 * signed-out visitors from protected routes to /login (remembering where they
 * were headed via ?redirect).
 *
 * It deliberately does NOT redirect signed-in visitors away from the auth pages:
 * a cookie can be present but invalid (expired, or its session row is gone), and
 * pairing an optimistic "has cookie -> leave /login" here with the page's
 * authoritative "no session -> go to /login" produces an infinite redirect loop.
 * So the auth pages stay reachable, and each one does its own real getSession()
 * check to bounce genuinely-authenticated users onward.
 *
 * The invitation accept page is public (it must work before you sign in).
 */
const AUTH_PAGES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  // The email verification landing must work before you're signed in — it's the
  // click target of the verification email, then it signs you in.
  "/verify-email",
  // The two-factor challenge: reached mid-sign-in, before the full session
  // exists, so it must be reachable without one.
  "/2fa",
]);

// Prefixes that are always reachable, signed in or out. `/sign-out` must work
// whether or not a (valid) cookie is present — it ends the session and redirects
// back, so it can never be gated behind having one.
const PUBLIC_PREFIXES = ["/invite", "/sign-out"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    AUTH_PAGES.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Everything else requires a session. Send signed-out users to sign in and
  // preserve the deep link so we can return them after. (A present-but-invalid
  // cookie passes here; the page's real getSession() then redirects to /login,
  // which this proxy leaves alone, so there is no loop.)
  // `cookiePrefix` MUST match advanced.cookiePrefix in lib/auth.ts, or this
  // optimistic check looks for the wrong cookie and redirects signed-in users.
  if (!getSessionCookie(request, { cookiePrefix: "flagon" })) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on pages only: never on the auth API, Next internals, or static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon|.*\\..*).*)"],
};
