/**
 * Reserved org-slug / username words. Duplicated from apps/app/src/lib/reserved.ts
 * (kept in sync) so the API's BetterAuth username validator matches the console's.
 */
export const RESERVED_SLUGS = new Set<string>([
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
