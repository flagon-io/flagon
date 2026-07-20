import { isValidUsername } from "./username";

/**
 * Organization slug rules. Slugs are URL identity (app.flagon.io/<slug>), so
 * they follow the username charset (alphanumeric with single hyphens, no
 * leading/trailing hyphen). Enforced server-side in the organization
 * plugin's beforeCreateOrganization hook (src/lib/auth.ts).
 *
 * The only blocked words are app ROUTE segments: an organization at one of
 * those slugs would be unreachable behind the static route. Everything else
 * - including the brand name - is first-come: uniqueness holds a slug from
 * the moment it's registered, and the operator can pre-create special orgs
 * with scripts/org-claim.mjs when there's a reason to.
 */
export const ORG_SLUG_MIN_LENGTH = 2;
export const ORG_SLUG_MAX_LENGTH = 39;

export const ORG_SLUG_HINT =
  "Slug may only contain lowercase alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.";

/** App route segments an org slug would shadow (and become unreachable). */
const RESERVED_SLUGS = new Set([
  "signin",
  "signup",
  "forgot-password",
  "reset-password",
  "settings",
  "new",
  "invitations",
  "api",
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
    return {
      ok: false,
      error: "That slug collides with an app page. Choose another.",
    };
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
