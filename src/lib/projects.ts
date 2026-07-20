import { isValidUsername } from "./username";

/**
 * Project slug rules, shared by client forms and the server. Projects are
 * the org-scoped unit of work everything else attaches to; the slug is the
 * project's stable identifier in URLs, SDK configuration, and the API. Same
 * charset rules as org slugs; unique within the organization (two orgs can
 * both have a "storefront" project).
 *
 * Data access lives in ./projects.server.ts (this module stays free of
 * database imports so client components can use the validation).
 */
export const PROJECT_SLUG_MIN_LENGTH = 2;
export const PROJECT_SLUG_MAX_LENGTH = 39;

export const PROJECT_SLUG_HINT =
  "Slug may only contain lowercase alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.";

/** Segments that collide with project routes. */
const RESERVED_SLUGS = new Set(["new", "settings"]);

export const PROJECT_NAME_MAX_LENGTH = 100;

export function normalizeProjectSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export type ProjectSlugValidation = { ok: true } | { ok: false; error: string };

export function validateProjectSlug(rawSlug: string): ProjectSlugValidation {
  const slug = normalizeProjectSlug(rawSlug);
  if (
    slug.length < PROJECT_SLUG_MIN_LENGTH ||
    slug.length > PROJECT_SLUG_MAX_LENGTH
  ) {
    return {
      ok: false,
      error: `Slug must be between ${PROJECT_SLUG_MIN_LENGTH} and ${PROJECT_SLUG_MAX_LENGTH} characters.`,
    };
  }
  if (!isValidUsername(slug)) {
    return { ok: false, error: PROJECT_SLUG_HINT };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "That slug is reserved. Choose another." };
  }
  return { ok: true };
}

/** Best-effort slug suggestion from a project name (client + server). */
export function suggestProjectSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, PROJECT_SLUG_MAX_LENGTH);
}
