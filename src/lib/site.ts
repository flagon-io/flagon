/** Shared site constants. */

export const SITE_NAME = 'Flagon';
export const GITHUB_URL = 'https://github.com/flagon-io/flagon';
export const OPENFEATURE_URL = 'https://openfeature.dev';

export const appBase = process.env.NEXT_PUBLIC_APP_URL ?? '';

// Canonical marketing origin (the apex, e.g. https://flagon.io) — what we want
// indexed and cited. Distinct from the app subdomain. Falls back to the app URL
// locally where everything is one origin.
export const siteUrl = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
  : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');

// Public product API origin, including the version segment (…/api/v1). The
// marketing site lives on the apex, where the proxy makes /api a hard 404 — so
// its API calls (waitlist join/status) must target this origin cross-origin
// (api.flagon.io/v1), which CORS allows. Locally this points back at /api/v1.
export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

// Internal admin console ("sudo"). Empty locally (served at /sudo); set to
// https://sudo.flagon.io in production where it's its own subdomain.
export const sudoBase = process.env.NEXT_PUBLIC_SUDO_URL ?? '';

/**
 * The dashboard lives under `/app/*` in the code. In production it's served from
 * the `app.` subdomain, where the proxy strips the prefix — so URLs are clean
 * (app.flagon.io/flagon/members). Locally there are no subdomains, so paths keep
 * the `/app` prefix (localhost:3000/app/flagon/members).
 *
 * `appPath` builds a same-origin app link; `appHref` adds the app origin for
 * links coming from the marketing site.
 */
const APP_PREFIX = process.env.NEXT_PUBLIC_ROOT_DOMAIN ? '' : '/app';
export function appPath(path = ''): string {
  return `${APP_PREFIX}${path}`;
}
export function appHref(path = ''): string {
  return `${appBase}${appPath(path)}`;
}
