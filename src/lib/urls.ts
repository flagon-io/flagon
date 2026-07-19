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
  return `${base}${normalized}`;
}

/** Link to a marketing page (www.flagon.io in production). */
export function marketingHref(path = "/"): string {
  return join(MARKETING_URL, path);
}

/** Link to an app page (app.flagon.io in production). */
export function appHref(path = "/"): string {
  return join(APP_URL, path);
}

/** Link to an API endpoint (api.flagon.io in production). */
export function apiHref(path = "/"): string {
  return join(API_URL, path);
}
