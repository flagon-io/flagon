/**
 * Slug helpers for organization URLs (app.flagon.io/<slug>). Pure, so both the
 * client form and server validation share the exact same rules.
 */

/** Turn a display name into a candidate slug: lowercase, hyphen-separated. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

/** Validate a slug's shape (reserved-name checks live in reserved.ts). */
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
