/**
 * Org-slug shape validation. Duplicated from apps/app/src/lib/slug.ts (kept in
 * sync) so the API validates a rename exactly as the console form does. Reserved-
 * name checks live in reserved.ts.
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
