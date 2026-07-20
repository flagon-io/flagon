import { isValidUsername } from "./username";

/**
 * Organization slug rules. Slugs are URL identity (app.flagon.io/<slug>), so
 * they follow the username charset (alphanumeric with single hyphens, no
 * leading/trailing hyphen) and anything that collides with an app route or
 * platform surface is reserved. Enforced server-side in the organization
 * plugin's beforeCreateOrganization hook (src/lib/auth.ts).
 */
export const ORG_SLUG_MIN_LENGTH = 2;
export const ORG_SLUG_MAX_LENGTH = 39;

export const ORG_SLUG_HINT =
  "Slug may only contain lowercase alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.";

/** Route segments and platform words an org slug must never shadow. */
const RESERVED_SLUGS = new Set([
  // App routes (org slugs share the app.flagon.io root path).
  "signin",
  "signup",
  "sign-in",
  "sign-up",
  "login",
  "logout",
  "forgot-password",
  "reset-password",
  "verify-email",
  "settings",
  "account",
  "sessions",
  "emails",
  // Platform surfaces and subdomains.
  "app",
  "api",
  "www",
  "docs",
  "admin",
  "sudo",
  "internal",
  "cron",
  "auth",
  "billing",
  "usage",
  "status",
  "support",
  "help",
  "blog",
  "about",
  "contact",
  "pricing",
  "enterprise",
  "legal",
  "terms",
  "privacy",
  "security",
  // Object words that make URLs ambiguous.
  "new",
  "invitations",
  "invites",
  "orgs",
  "organizations",
  "org",
  "user",
  "users",
  "me",
  "team",
  "teams",
  "projects",
  "dashboard",
  "home",
  "flagon",
]);

export function normalizeOrgSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export type SlugValidation = { ok: true } | { ok: false; error: string };

export function validateOrgSlug(rawSlug: string): SlugValidation {
  const slug = normalizeOrgSlug(rawSlug);
  if (slug.length < ORG_SLUG_MIN_LENGTH || slug.length > ORG_SLUG_MAX_LENGTH) {
    return {
      ok: false,
      error: `Slug must be between ${ORG_SLUG_MIN_LENGTH} and ${ORG_SLUG_MAX_LENGTH} characters.`,
    };
  }
  if (!isValidUsername(slug)) {
    return { ok: false, error: ORG_SLUG_HINT };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "That slug is reserved. Choose another." };
  }
  return { ok: true };
}

/** Best-effort slug suggestion from an organization name (client + server). */
export function suggestOrgSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, ORG_SLUG_MAX_LENGTH);
}
