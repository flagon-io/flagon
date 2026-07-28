import { auth } from "@/lib/auth";
import { APP_URL, WEB_URL } from "@/lib/urls";

/**
 * Cross-surface sign-out.
 *
 * The console owns BetterAuth, whose sign-out is a POST that requires a same-site
 * Origin. The marketing site (a different origin) can't drive that cross-origin
 * without CORS on the auth routes, so instead it navigates the browser HERE
 * (a top-level GET, same-origin to the console). We clear the shared session
 * cookie server-side and 303 back to a trusted return URL. Same-origin, so no
 * CORS; and the Set-Cookie clears the apex-scoped `.flagon.io` cookie in prod
 * (and the host cookie locally), signing the visitor out everywhere.
 */
function safeReturn(raw: string | null): string {
  if (raw) {
    try {
      const url = new URL(raw);
      const allowed = [WEB_URL, APP_URL].map((u) => new URL(u).origin);
      if (allowed.includes(url.origin)) return url.toString();
    } catch {
      // Not a valid absolute URL — fall through to the safe default.
    }
  }
  return WEB_URL;
}

export async function GET(request: Request) {
  const returnTo = safeReturn(new URL(request.url).searchParams.get("returnTo"));

  // Ask BetterAuth to end the session; asResponse gives us the Set-Cookie(s) that
  // expire the session cookie(s), which we carry onto the redirect.
  const signedOut = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });

  const redirect = new Response(null, { status: 303, headers: { Location: returnTo } });
  for (const cookie of signedOut.headers.getSetCookie()) {
    redirect.headers.append("set-cookie", cookie);
  }
  return redirect;
}
