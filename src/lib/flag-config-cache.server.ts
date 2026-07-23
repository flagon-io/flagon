import {
  ArtifactError,
  buildArtifact,
  parseArtifact,
} from "@/lib/config-artifact";
import { getConfigStore, type ConfigStore } from "@/lib/config-store";
import { listFlags, type FeatureFlag } from "@/lib/flags.server";
import { listSegments, type Segment } from "@/lib/segments.server";

/** An org's full evaluation input: every flag and every segment it can reference. */
export type FlagConfig = { flags: FeatureFlag[]; segments: Segment[] };

/** What a successful store write produced, for the caller's bookkeeping. */
export type PublishResult = { version: string; checksum: string; etag: string };

type Deps = {
  /** Authoritative read from the database (the source of truth). */
  fetchFromDb: (orgId: string) => Promise<FlagConfig>;
  /** The derived cache in front of the database, or null to always read the database. */
  store: ConfigStore | null;
  /** Store-write retry budget (writes are rare and correctness-bearing). */
  writeAttempts?: number;
  /**
   * How long a database *fallback* read is reused (ms). This bounds database
   * load when the store cannot serve - an R2 outage, a misconfigured store, or
   * a cold instance before an org's first publish - so a degraded store never
   * turns into an uncached read on every evaluation. It has NO effect on the
   * healthy path, which serves the verified store artifact. 0 disables it.
   */
  fallbackTtlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
};

export type FlagConfigCache = {
  /** Evaluation input for an org: the store artifact (verified), or the database on any miss. */
  load: (orgId: string) => Promise<FlagConfig>;
  /** Rebuild the artifact from the database and write it to the store; returns its version/checksum. */
  writeArtifact: (orgId: string) => Promise<PublishResult | null>;
  /** Drop the in-memory copy (tests / direct invalidation). */
  clear: (orgId?: string) => void;
};

type Entry = { etag: string; config: FlagConfig };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * OFREP evaluation reads flags and segments from the ConfigStore (R2 in
 * production, a local file self-hosted) instead of the database on the hot
 * path. Reads are conditional on the ETag this process already holds and every
 * artifact is checksum-verified, so a change is picked up the moment the store
 * object changes and a corrupt or torn object is treated as a miss rather than
 * served.
 *
 * The database is the source of truth. Every store interaction is best-effort:
 * an absent object, an integrity failure, or a thrown error all fall back to a
 * direct database read, and a store hiccup never fails the caller. Absent or
 * corrupt objects also trigger a background repair (rewrite from the database),
 * which fixes store-side corruption even when nothing in the database changed.
 *
 * This module owns the store bytes and the in-memory copy only. Durable
 * publication tracking (the dirty marker, version columns, the reconcile sweep)
 * lives in config-publish.server.ts, which drives `writeArtifact`.
 */
export function createFlagConfigCache(deps: Deps): FlagConfigCache {
  const attempts = deps.writeAttempts ?? 3;
  const fallbackTtlMs = deps.fallbackTtlMs ?? 10_000;
  const now = deps.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<FlagConfig>>();
  const repairing = new Set<string>();
  const fallback = new Map<string, { config: FlagConfig; expires: number }>();
  const fallbackInflight = new Map<string, Promise<FlagConfig>>();

  /**
   * A database read used only when the store cannot serve, reused for a short
   * window so a store outage or a cold start does not read the database on every
   * evaluation. Single-flight, and never caches a failed read.
   */
  function fetchFallback(orgId: string): Promise<FlagConfig> {
    const hit = fallback.get(orgId);
    if (hit && hit.expires > now()) return Promise.resolve(hit.config);
    const existing = fallbackInflight.get(orgId);
    if (existing) return existing;
    const pending = deps
      .fetchFromDb(orgId)
      .then((config) => {
        if (fallbackTtlMs > 0)
          fallback.set(orgId, { config, expires: now() + fallbackTtlMs });
        return config;
      })
      .finally(() => fallbackInflight.delete(orgId));
    fallbackInflight.set(orgId, pending);
    return pending;
  }

  async function writeArtifact(orgId: string): Promise<PublishResult | null> {
    if (!deps.store) return null;
    const config = await deps.fetchFromDb(orgId);
    const artifact = buildArtifact(orgId, config);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const etag = await deps.store.write(orgId, artifact.body);
        entries.set(orgId, { etag, config });
        return { version: artifact.version, checksum: artifact.checksum, etag };
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) await sleep(100 * (attempt + 1));
      }
    }
    throw lastError;
  }

  /** Best-effort, de-duplicated background rewrite of a missing/corrupt object. */
  function repair(orgId: string) {
    if (!deps.store || repairing.has(orgId)) return;
    repairing.add(orgId);
    void writeArtifact(orgId)
      .catch(() => {})
      .finally(() => repairing.delete(orgId));
  }

  async function loadViaStore(
    orgId: string,
    store: ConfigStore,
  ): Promise<FlagConfig> {
    const cached = entries.get(orgId);
    let object;
    try {
      object = await store.read(orgId, cached?.etag ?? null);
    } catch {
      return cached?.config ?? fetchFallback(orgId);
    }

    if (object.status === "not-modified") {
      if (cached) return cached.config;
      try {
        object = await store.read(orgId, null); // lost the body; re-read fully
      } catch {
        return fetchFallback(orgId);
      }
    }

    if (object.status === "modified") {
      try {
        const { config } = parseArtifact(object.body);
        entries.set(orgId, { etag: object.etag, config });
        return config;
      } catch (error) {
        // Corrupt/tampered/torn artifact: serve the truth and repair the store.
        if (error instanceof ArtifactError) repair(orgId);
        return fetchFallback(orgId);
      }
    }

    // Absent: never published (or deleted). Serve the database and populate.
    repair(orgId);
    return fetchFallback(orgId);
  }

  function load(orgId: string): Promise<FlagConfig> {
    if (!deps.store) return fetchFallback(orgId);
    const existing = inflight.get(orgId);
    if (existing) return existing;
    const pending = loadViaStore(orgId, deps.store).finally(() =>
      inflight.delete(orgId),
    );
    inflight.set(orgId, pending);
    return pending;
  }

  function clear(orgId?: string) {
    if (orgId) {
      entries.delete(orgId);
      fallback.delete(orgId);
    } else {
      entries.clear();
      fallback.clear();
    }
  }

  return { load, writeArtifact, clear };
}

const globalForConfigCache = globalThis as typeof globalThis & {
  __flagonFlagConfigCache?: FlagConfigCache;
};

const cache =
  globalForConfigCache.__flagonFlagConfigCache ??
  createFlagConfigCache({
    fetchFromDb: async (orgId) => {
      const [flags, segments] = await Promise.all([
        listFlags(orgId),
        listSegments(orgId),
      ]);
      return { flags, segments };
    },
    store: getConfigStore(),
  });
if (process.env.NODE_ENV !== "production")
  globalForConfigCache.__flagonFlagConfigCache = cache;

/**
 * An org's flag + segment configuration for the evaluation hot path, served
 * from the ConfigStore (checksum-verified) with a database fallback. Steady
 * state costs one conditional store read and zero database round-trips.
 */
export const loadFlagConfig = (orgId: string): Promise<FlagConfig> =>
  cache.load(orgId);

/**
 * Rebuild an org's artifact from the database and write it through to the
 * store, returning its version and checksum (null when no store is configured).
 * Retries the write; the caller records the result and clears the dirty marker.
 */
export const writeConfigArtifact = (
  orgId: string,
): Promise<PublishResult | null> => cache.writeArtifact(orgId);

/** Drop a cached org (or all orgs); for tests and direct invalidation. */
export const clearFlagConfigCache = (orgId?: string): void => cache.clear(orgId);
