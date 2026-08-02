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

  // The console hosts BetterAuth. Ask our OWN /api/auth/sign-out to end the
  // session (POST /sign-out) and carry the Set-Cookie(s) it returns onto our
  // redirect. Same-origin server-to-server call; the Origin header names this
  // console (a trusted origin) so BetterAuth's CSRF check passes.
  const redirect = new Response(null, { status: 303, headers: { Location: returnTo } });
  try {
    const signedOut = await fetch(`${APP_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        // BetterAuth's POST endpoints require a JSON content-type + a parseable
        // body (a bare POST 415s; an empty body 400s), so send "{}".
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
        origin: APP_URL,
      },
      body: "{}",
    });
    for (const cookie of signedOut.headers.getSetCookie()) {
      redirect.headers.append("set-cookie", cookie); // clears the configured-domain cookie
      const hostClear = hostScopedClear(cookie); // also clear a stale host-scoped copy
      if (hostClear) redirect.headers.append("set-cookie", hostClear);
    }
  } catch {
    // Network hiccup reaching the API: still redirect; the user can retry.
  }
  return redirect;
}
