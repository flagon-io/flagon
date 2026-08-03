import type { Context, Next } from "hono";
import { invalidateEvalCache } from "../flags/eval-cache.js";
import { orgIdBySlug } from "./org-context.js";
import { logger } from "./logger.js";

/**
 * Extra caches that also key off an org's evaluation state and must be dropped on
 * a management write. The flag-config cache is invalidated directly; anything
 * layered ON TOP of flag evaluation (e.g. the experiments holdout overlay)
 * registers here at import time, so this glue never has to import those modules.
 * The dependency stays one-way: overlays depend on lib, never the reverse.
 */
const extraInvalidators: Array<(organizationId: string) => void> = [];

export function registerEvalInvalidator(fn: (organizationId: string) => void): void {
  extraInvalidators.push(fn);
}

/**
 * After a SUCCESSFUL management mutation, drop the org's cached flag config (and
 * any registered overlay caches) so the next evaluation reflects the change
 * immediately (on this instance).
 *
 * Registered on the routers whose writes change evaluation output — flags (and
 * its nested variants/rules), segments, holdouts, and experiments. Reads and
 * failed writes are left alone. It is a best-effort speedup layered on the
 * eval-cache's TTL: if the slug lookup fails, we swallow it — a successful
 * mutation must never be turned into an error by a cache-warming step, and the
 * TTL still bounds staleness.
 */
export async function invalidateEvalCacheOnWrite(c: Context, next: Next) {
  await next();

  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  if (c.res.status < 200 || c.res.status >= 300) return;

  const slug = c.req.param("org");
  if (!slug) return;

  try {
    const orgId = await orgIdBySlug(slug);
    if (orgId) {
      invalidateEvalCache(orgId);
      for (const fn of extraInvalidators) fn(orgId);
    }
  } catch (err) {
    logger.warn("eval-cache invalidation after mutation failed", { err, slug });
  }
}
