import { NextResponse, type NextRequest } from "next/server";

/**
 * Host-based routing for the production subdomains, mapping them onto the
 * single-repo route segments:
 *
 *   www.flagon.io / flagon.io  ->  marketing (root)
 *   app.flagon.io/<org>        ->  /app/<org>
 *   api.flagon.io/...          ->  /api/...
 *
 * Locally (and on preview / single-domain self-hosted deployments) there are no
 * subdomains, so everything is reached by path (/app, /api) with no rewrite.
 * Set NEXT_PUBLIC_ROOT_DOMAIN to self-host under a different apex domain.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "flagon.io";

function subdomainOf(host: string): string | null {
  const hostname = host.split(":")[0];
  if (hostname === ROOT_DOMAIN || !hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    // apex, localhost, or preview hosts -> treat as marketing root
    return null;
  }
  const label = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  const parts = label.split(".");
  return parts[parts.length - 1] || null;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const sub = subdomainOf(host);
  const { pathname } = request.nextUrl;

  // api.flagon.io/... -> /api/...
  if (sub === "api" && !pathname.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/api" : `/api${pathname}`;
    return NextResponse.rewrite(url);
  }

  // app.flagon.io: the app is served at the subdomain ROOT. A leaked /app
  // prefix (old link, local-style URL) is canonicalized away with a
  // permanent redirect so production URLs are always app.flagon.io/<org>/...
  if (
    sub === "app" &&
    (pathname === "/app" || pathname.startsWith("/app/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice("/app".length) || "/";
    return NextResponse.redirect(url, 308);
  }

  // app.flagon.io/... -> /app/... , EXCEPT /api/* which is the shared API and
  // auth surface. Keeping it same-origin means login on app.flagon.io hits
  // app.flagon.io/api/auth directly (no CORS), and the app can call the API
  // same-origin too.
  if (sub === "app" && !pathname.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/app" : `/app${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.\\w+$).*)",
  ],
};
