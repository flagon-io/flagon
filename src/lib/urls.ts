/**
 * Cross-surface URL helpers.
 *
 * In production the marketing site, app, and API live on separate subdomains
 * (www / app / api . flagon.io). A bare relative link from one surface to
 * another would resolve to the WRONG host (e.g. a link to /terms from
 * app.flagon.io would hit app.flagon.io/terms instead of www.flagon.io/terms).
 *
 * Set the NEXT_PUBLIC_*_URL env vars in production so cross-surface links become
 * absolute. Left unset (local dev, or a single-domain self-host) they fall back
 * to relative paths on the current origin, which is correct there.
 */
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function join(base: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base && normalized === "/") return base;
  return `${base}${normalized}`;
}

/** Link to a marketing page (www.flagon.io in production). */
export function marketingHref(path = "/"): string {
  return join(MARKETING_URL, path);
}

/**
 * Link to an app page (app.flagon.io in production). Without a configured base
 * URL (local dev, single-domain self-host) the app lives under the /app path
 * prefix, so the fallback is path-prefixed rather than relative. Use for
 * CROSS-SURFACE links (marketing -> app); inside the app use appPath so
 * navigation stays same-origin and client-side.
 */
export function appHref(path = "/"): string {
  return join(APP_URL || "/app", path);
}

/**
 * Path for IN-APP navigation. When NEXT_PUBLIC_APP_URL is set the app is
 * served at a subdomain ROOT (app.flagon.io/<org>), so links carry no
 * prefix; without it (local dev, single-domain self-host, previews) the app
 * lives under /app. Set the var per Vercel environment: production only,
 * unless previews also get their own subdomain.
 */
export const APP_PATH_PREFIX = APP_URL ? "" : "/app";

export function appPath(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return APP_PATH_PREFIX || "/";
  return `${APP_PATH_PREFIX}${normalized}`;
}

/**
 * Strip the physical /app route prefix, yielding an app-relative path. Every
 * app route lives under /app on the origin (locally it is the visible URL; in
 * production the proxy adds it), so this is how a request path the server sees
 * becomes the logical path to store in a `next=` param. Idempotent: a path that
 * carries no prefix is returned unchanged.
 */
export function stripAppPrefix(pathname: string): string {
  if (pathname === "/app") return "/";
  if (pathname.startsWith("/app/")) return pathname.slice("/app".length);
  return pathname || "/";
}

/**
 * Validate a stored `next` value and expand it back to an environment-correct
 * in-app URL, or return null when it is not a safe same-origin path.
 *
 * The guard is the whole point: `next` comes from the URL, so it must never be
 * able to become an open redirect. Only single-slash absolute paths pass;
 * protocol-relative ("//host"), backslash tricks ("/\\host"), and anything
 * carrying a scheme are refused. The result is always re-prefixed through
 * appPath, so it stays on the app surface in both routing modes.
 */
export function resolveNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    next.includes("://")
  ) {
    return null;
  }
  const queryIndex = next.indexOf("?");
  const path = queryIndex === -1 ? next : next.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : next.slice(queryIndex);
  return appPath(stripAppPrefix(path)) + query;
}

/** Link to an API endpoint (api.flagon.io in production; /api otherwise). */
export function apiHref(path = "/"): string {
  return join(API_URL || "/api", path);
}
