// Cross-surface origins the console links to and trusts.
//
// Each defaults to its LOCAL dev value so a bare `next dev` works with no env,
// and production overrides via the matching NEXT_PUBLIC_* variable.

/** This console's own origin: app dev server on :3001, app.flagon.io in prod. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

/** The marketing site: web dev server on :3000, www.flagon.io in prod. */
export const WEB_URL =
  process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

/** The Flagon API (Hono): :3002 locally, api.flagon.io in prod. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
