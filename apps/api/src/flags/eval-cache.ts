import { createHash } from "node:crypto";
import { env } from "../env.js";
import { withOrg } from "../db/tenant.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import { loadEvaluationData, type EvaluationData } from "./config.js";

/**
 * The read-through cache in front of loadEvaluationData for the OFREP hot path.
 *
 * Every SDK evaluation needs the same thing: the projected flag config for one
 * (org, environment). Loading it is several tenant queries; doing that on every
 * eval is the dominant cost on the hot path. So we cache the WHOLE environment's
 * config under `${orgId}:${envId}` — single-flag and bulk evals share the one
 * entry — and serve it for env.EVAL_CACHE_TTL_MS before reloading.
 *
 * The load still runs inside withOrg(), so RLS scopes it to the org exactly as a
 * direct read would; the cache only holds the already-projected, org-scoped
 * result. A flag config change is reflected within the TTL, or immediately on
 * the same instance if a management route calls invalidateEvalCache().
 */
const cache = createTtlCache<EvaluationData>({
  ttlMs: env.EVAL_CACHE_TTL_MS,
  load: (compositeKey) => {
    const sep = compositeKey.indexOf(":");
    const organizationId = compositeKey.slice(0, sep);
    const environmentId = compositeKey.slice(sep + 1);
    return withOrg(organizationId, (tx) => loadEvaluationData(tx, environmentId));
  },
});

/** Flag config for one environment, from cache when warm. */
export function getEvaluationData(
  organizationId: string,
  environmentId: string,
): Promise<EvaluationData> {
  return cache.get(`${organizationId}:${environmentId}`);
}

// An ETag per cached config, memoized by the data instance: a warm cache returns
// the same object, so we hash the config once; an invalidation/reload yields a
// new instance and a fresh ETag. Config is sorted before hashing so identical
// config produces an identical ETag even across separate loads.
const etags = new WeakMap<EvaluationData, string>();

function computeEtag(data: EvaluationData): string {
  const flags = [...data.flags]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) => ({
      key: f.key,
      enabled: f.enabled,
      defaultVariantKey: f.defaultVariantKey,
      defaultServe: f.defaultServe,
      offVariantKey: f.offVariantKey,
      variants: f.variants.map((v) => ({ key: v.key, value: v.value })),
      rules: f.rules.map((r) => ({ conditions: r.conditions, serve: r.serve })),
    }));
  const segments = [...data.segments.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  const hash = createHash("sha1")
    .update(JSON.stringify({ flags, segments }))
    .digest("base64url")
    .slice(0, 27);
  return `"${hash}"`;
}

/**
 * Flag config for one environment, plus a strong ETag over that config. The
 * OFREP bulk endpoint returns the ETag and honors If-None-Match: because a
 * client polls with a static context, an unchanged config means unchanged
 * results, so a matching ETag is a safe 304.
 */
export async function getEvaluationDataWithEtag(
  organizationId: string,
  environmentId: string,
): Promise<{ data: EvaluationData; etag: string }> {
  const data = await getEvaluationData(organizationId, environmentId);
  let etag = etags.get(data);
  if (!etag) {
    etag = computeEtag(data);
    etags.set(data, etag);
  }
  return { data, etag };
}

/**
 * Drop this org's cached config so the next eval reloads. Call after any
 * management mutation that changes evaluation output (flag/rule/variant/segment
 * writes, per-env toggles). Best-effort cross-instance (see ttl-cache.ts): it
 * makes changes propagate instantly on the writing instance; other instances
 * still catch up within the TTL.
 */
export function invalidateEvalCache(organizationId: string): void {
  cache.invalidatePrefix(`${organizationId}:`);
}
