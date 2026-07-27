/**
 * Names that may not be claimed as an organization slug or a username.
 *
 * Org slugs become the first path segment (app.flagon.io/<slug>), so a slug
 * that collides with a real route ("settings", "login") would shadow it. The
 * reserved set is shared with username validation too: usernames are not in the
 * URL today, but reserving the same words keeps identity unambiguous and leaves
 * room for personal namespaces later.
 */
export const RESERVED_SLUGS = new Set<string>([
  // Auth + top-level app routes.
  "login",
  "signup",
  "sign-in",
  "sign-up",
  "signin",
  "logout",
  "forgot-password",
  "reset-password",
  "verify-email",
  "new",
  "select",
  "settings",
  "invite",
  "invitations",
  "onboarding",
  // Reserved surfaces / subdomains.
  "api",
  "app",
  "www",
  "admin",
  "sudo",
  "internal",
  "billing",
  "account",
  "accounts",
  "org",
  "orgs",
  "organization",
  "organizations",
  "team",
  "teams",
  "user",
  "users",
  "me",
  "help",
  "support",
  "status",
  "docs",
  "static",
  "assets",
  "public",
  "favicon.ico",
  "robots.txt",
]);

export function isReserved(value: string): boolean {
  return RESERVED_SLUGS.has(value.trim().toLowerCase());
}
