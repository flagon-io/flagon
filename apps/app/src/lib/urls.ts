// Cross-surface URLs the app links back out to.
//
// The marketing site lives on its own origin: the web dev server on :3000
// locally, www.flagon.io in production. Defaults to the LOCAL value so a bare
// `next dev` stays on localhost; production sets NEXT_PUBLIC_WEB_URL.
export const WEB_URL =
  process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
