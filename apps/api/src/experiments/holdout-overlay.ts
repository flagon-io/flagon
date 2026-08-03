import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { env } from "../env.js";
import { withOrg, type TenantTx } from "../db/tenant.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import { registerEvalInvalidator } from "../lib/eval-invalidate.js";
import {
  experiments as experimentsTable,
  flags,
  holdouts as holdoutsTable,
} from "../db/schema.js";
import type { HoldoutOverlay } from "./holdout.js";

export type { HoldoutOverlay } from "./holdout.js";
export { applyHoldout, inHoldout } from "./holdout.js";

/**
 * Holdouts are an EXPERIMENTS concern layered on top of flag evaluation, not part
 * of the flag primitive. This module owns the eval-path plumbing: loading the
 * active-holdout context for an environment and caching it. The pure application
 * logic lives in holdout.ts. It depends on the flags primitive (bucketing,
 * config/result types) but the flags primitive knows nothing about it. That is the
 * whole point: flags and experiments compose, they are not coupled. See
 * src/routes/ofrep/index.ts for where the two are combined.
 */

/** Active holdouts + the flags a holdout governs, for one environment. */
export async function loadHoldoutOverlay(
  tx: TenantTx,
  environmentId: string,
): Promise<HoldoutOverlay> {
  const [holdoutRows, expFlagRows] = await Promise.all([
    tx
      .select({ key: holdoutsTable.key, percentage: holdoutsTable.percentage })
      .from(holdoutsTable)
      .where(
        and(
          eq(holdoutsTable.environmentId, environmentId),
          eq(holdoutsTable.status, "active"),
        ),
      ),
    tx
      .select({ key: flags.key })
      .from(experimentsTable)
      .innerJoin(flags, eq(flags.id, experimentsTable.flagId))
      .where(
        and(
          eq(experimentsTable.environmentId, environmentId),
          eq(experimentsTable.status, "running"),
        ),
      ),
  ]);
  return {
    holdouts: holdoutRows,
    experimentFlagKeys: new Set(expFlagRows.map((r) => r.key)),
  };
}

/**
 * A read-through cache for the holdout overlay, mirroring the flag-config cache
 * (src/flags/eval-cache.ts) but kept separate so holdout/experiment writes and
 * flag writes invalidate independently. Keyed by `${orgId}:${envId}`; served for
 * env.EVAL_CACHE_TTL_MS before reload. The load runs inside withOrg(), so RLS
 * scopes it exactly as a direct read would.
 */
const cache = createTtlCache<HoldoutOverlay>({
  ttlMs: env.EVAL_CACHE_TTL_MS,
  load: (compositeKey) => {
    const sep = compositeKey.indexOf(":");
    const organizationId = compositeKey.slice(0, sep);
    const environmentId = compositeKey.slice(sep + 1);
    return withOrg(organizationId, (tx) => loadHoldoutOverlay(tx, environmentId));
  },
});

/** The holdout overlay for one environment, from cache when warm. */
export function getHoldoutOverlay(
  organizationId: string,
  environmentId: string,
): Promise<HoldoutOverlay> {
  return cache.get(`${organizationId}:${environmentId}`);
}

// A fingerprint per cached overlay, memoized by instance (like the flag ETag): a
// warm cache returns the same object; a reload yields a new instance and a fresh
// fingerprint. The OFREP bulk endpoint folds this into its ETag so a poller stops
// 304ing when a holdout or a running experiment changes.
const fingerprints = new WeakMap<HoldoutOverlay, string>();

export function overlayFingerprint(overlay: HoldoutOverlay): string {
  let fp = fingerprints.get(overlay);
  if (fp) return fp;
  const holdouts = [...overlay.holdouts].sort((a, b) => a.key.localeCompare(b.key));
  const experimentFlagKeys = [...overlay.experimentFlagKeys].sort();
  fp = createHash("sha1")
    .update(JSON.stringify({ holdouts, experimentFlagKeys }))
    .digest("base64url")
    .slice(0, 27);
  fingerprints.set(overlay, fp);
  return fp;
}

/** Drop this org's cached overlay so the next eval reloads. */
export function invalidateHoldoutOverlay(organizationId: string): void {
  cache.invalidatePrefix(`${organizationId}:`);
}

// A holdout/experiment write goes through the shared invalidate-on-write middleware
// (lib/eval-invalidate). Register here so that middleware busts this cache too,
// without lib/ or flags/ having to import experiments (the dependency stays
// experiments -> lib, never the reverse).
registerEvalInvalidator(invalidateHoldoutOverlay);
