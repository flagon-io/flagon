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
 * CORS.
 *
 * Belt-and-suspenders: BetterAuth clears each cookie on the CONFIGURED domain
 * (the apex `.flagon.io` in prod). But a browser that logged in BEFORE
 * AUTH_COOKIE_DOMAIN was set still carries a HOST-scoped (`app.flagon.io`) copy
 * of the same cookie, which BetterAuth never touches and which shadows the good
 * one. So for every cookie BetterAuth expires, we also expire the host-scoped
 * variant (same name, no Domain attribute). That makes "sign out and back in"
 * always fully reset a bad state — no manual cookie surgery required.
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

/** A host-scoped (no Domain) expiry for the same cookie name BetterAuth cleared.
 * `__Secure-`-prefixed names must carry Secure to be accepted (prod is HTTPS);
 * the un-prefixed local names must not (local is HTTP). */
function hostScopedClear(setCookie: string): string | null {
  const name = setCookie.slice(0, setCookie.indexOf("=")).trim();
  if (!name) return null;
  const secure = name.startsWith("__Secure-") ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
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
    redirect.headers.append("set-cookie", cookie); // clears the configured-domain cookie
    const hostClear = hostScopedClear(cookie); // also clear a stale host-scoped copy
    if (hostClear) redirect.headers.append("set-cookie", hostClear);
  }
  return redirect;
}
