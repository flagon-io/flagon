import { listFlags, type FeatureFlag } from "@/lib/flags.server";
import { listSegments, type Segment } from "@/lib/segments.server";
import { subscribeToConfiguration } from "@/lib/ofrep-events.server";

/** An org's full evaluation input: every flag and every segment it can reference. */
export type FlagConfig = { flags: FeatureFlag[]; segments: Segment[] };

type Deps = {
  fetch: (orgId: string) => Promise<FlagConfig>;
  subscribe: (orgId: string, onChange: () => void) => Promise<() => void>;
  ttlMs: number;
  now: () => number;
};

type Entry = { config: Promise<FlagConfig>; expires: number };

export type FlagConfigCache = {
  load: (orgId: string) => Promise<FlagConfig>;
  clear: (orgId?: string) => void;
};

/**
 * The steady-state hot path for evaluation reads flags and segments from this
 * process-local cache instead of the two `withTenant` transactions it used to
 * run on every request.
 *
 * The `flagon_configuration_changed` LISTEN channel is the PRIMARY invalidator:
 * a flag or segment change fires a DB trigger that `pg_notify`s every listening
 * connection, so a change propagates to every process in ~milliseconds. The TTL
 * is only a backstop that bounds staleness if a notification is ever missed
 * (e.g. the listener connection dropped between the mutation and now), mirroring
 * the fail-safe posture of the plan cache in `usage-events.server.ts`.
 */
const DEFAULT_TTL_MS = 30_000;

/**
 * Factory so the caching semantics can be driven with injected dependencies and
 * a controllable clock in tests, without a database or a live LISTEN
 * connection. Production uses the single instance wired below.
 */
export function createFlagConfigCache(deps: Deps): FlagConfigCache {
  const entries = new Map<string, Entry>();
  const subscribed = new Set<string>();

  async function ensureSubscribed(orgId: string) {
    if (subscribed.has(orgId)) return;
    // Claim the slot synchronously so a burst of concurrent misses subscribes
    // exactly once rather than opening a fan-out entry per request.
    subscribed.add(orgId);
    try {
      await deps.subscribe(orgId, () => entries.delete(orgId));
    } catch {
      // The LISTEN-backed invalidation could not be established. Drop the claim
      // so a later request retries, and rely on the TTL backstop until then.
      subscribed.delete(orgId);
    }
  }

  function load(orgId: string): Promise<FlagConfig> {
    const cached = entries.get(orgId);
    if (cached && cached.expires > deps.now()) return cached.config;

    // Single-flight: a burst of concurrent misses for the same org shares one
    // read rather than stampeding the database on a cold entry.
    const config = deps.fetch(orgId);
    const entry: Entry = { config, expires: deps.now() + deps.ttlMs };
    entries.set(orgId, entry);
    // Never cache a failed read: evict on rejection, but only if this exact
    // entry is still the current one (a newer load may already have replaced it).
    config.catch(() => {
      if (entries.get(orgId) === entry) entries.delete(orgId);
    });
    void ensureSubscribed(orgId);
    return config;
  }

  function clear(orgId?: string) {
    if (orgId) entries.delete(orgId);
    else entries.clear();
  }

  return { load, clear };
}

const globalForConfigCache = globalThis as typeof globalThis & {
  __flagonFlagConfigCache?: FlagConfigCache;
};

const cache =
  globalForConfigCache.__flagonFlagConfigCache ??
  createFlagConfigCache({
    fetch: async (orgId) => {
      const [flags, segments] = await Promise.all([
        listFlags(orgId),
        listSegments(orgId),
      ]);
      return { flags, segments };
    },
    subscribe: subscribeToConfiguration,
    ttlMs: DEFAULT_TTL_MS,
    now: () => Date.now(),
  });
// Survive HMR in dev the same way the OFREP event hub does; a fresh instance
// per reload would leak LISTEN subscriptions.
if (process.env.NODE_ENV !== "production")
  globalForConfigCache.__flagonFlagConfigCache = cache;

/**
 * An org's flag + segment configuration for the evaluation hot path, served
 * from the shared NOTIFY-invalidated cache. Steady state costs zero database
 * round-trips; a config change invalidates the entry before the next request.
 */
export const loadFlagConfig = (orgId: string): Promise<FlagConfig> =>
  cache.load(orgId);

/** Drop a cached org (or all orgs); for tests and direct invalidation. */
export const clearFlagConfigCache = (orgId?: string): void => cache.clear(orgId);
