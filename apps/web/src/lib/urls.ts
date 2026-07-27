// Cross-surface URLs the marketing site links out to.
//
// The application (console) lives on its own origin: the app dev server on
// :3001 locally, app.flagon.io in production. Like NEXT_PUBLIC_API_URL in
// api.ts, this defaults to the LOCAL value so a bare `next dev` stays on
// localhost, and production sets NEXT_PUBLIC_APP_URL to the deployed host.
// Hardcoding the production URL is what previously sent local visitors to the
// real app.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

/** Sign-in on the app. No sign-up link exists on purpose: access is invite-only. */
export const SIGN_IN_URL = `${APP_URL}/login`;
