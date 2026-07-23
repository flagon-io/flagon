import { getConfigStore } from "@/lib/config-store";
import { loadFlagConfig } from "@/lib/flag-config-cache.server";
import { configurationVersion } from "@/lib/ofrep.server";

/**
 * Configuration-change detection for the OFREP `/events` stream, by polling the
 * ConfigStore rather than a PostgreSQL LISTEN/NOTIFY channel. A serverless
 * function cannot hold a live LISTEN connection across freezes, and a change
 * already propagates through the store on write (see `republishConfig`), so the
 * store's ETag is the authoritative "did the configuration change" signal.
 *
 * Each subscriber runs its own lightweight poll: an SSE connection is already a
 * long-lived, per-request thing, and the streams are few. Where no store is
 * configured, we fall back to hashing the database configuration version.
 */
const DEFAULT_POLL_MS = 5_000;

function pollIntervalMs(): number {
  const raw = Number(process.env.FLAGON_CONFIG_STORE_WATCH_MS);
  return Number.isFinite(raw) && raw >= 1_000 ? raw : DEFAULT_POLL_MS;
}

/** A cheap, opaque token that changes whenever the org's configuration changes. */
async function currentVersion(orgId: string): Promise<string> {
  const store = getConfigStore();
  if (store) {
    const head = await store.head(orgId, null);
    return head.status === "absent" ? "absent" : head.etag;
  }
  const { flags, segments } = await loadFlagConfig(orgId);
  return configurationVersion(flags, segments);
}

/**
 * Invoke `onChange` whenever the org's configuration version changes. Returns an
 * unsubscribe function that stops the poll. Named for the previous LISTEN-based
 * implementation so the `/events` route is unchanged.
 */
export async function subscribeToConfiguration(
  orgId: string,
  onChange: () => void,
) {
  // Establish the baseline before returning so the first real change - not the
  // initial state - triggers a notification. A failure here is non-fatal: treat
  // the baseline as unknown and let the first successful poll settle it.
  let last = await currentVersion(orgId).catch(() => "");

  const timer = setInterval(() => {
    void (async () => {
      try {
        const next = await currentVersion(orgId);
        if (next !== last) {
          last = next;
          onChange();
        }
      } catch {
        // Transient store/database error; retry on the next tick.
      }
    })();
  }, pollIntervalMs());

  // Don't let the poll timer hold the process open on shutdown.
  (timer as unknown as { unref?: () => void }).unref?.();

  return () => clearInterval(timer);
}
