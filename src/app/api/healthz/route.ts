import { apiJson } from "@/lib/api";
import { connectionIdentity } from "@/db/client";
import { getConfigStore } from "@/lib/config-store";
import { countDirtyConfigs } from "@/lib/config-publish.server";

/**
 * Liveness/readiness probe.
 *
 * Local:      GET http://localhost:3000/api/healthz
 * Production: GET https://api.flagon.io/healthz
 *
 * Reports WHICH database role the process is connected as, because that is the
 * one production property no amount of correct SQL can guarantee: policies are
 * proven by src/db/tenancy.test.ts, but a deploy connecting as the owner
 * bypasses all of them with no error and no symptom. This makes it checkable
 * from outside, at any time, without waiting for a request to fail.
 *
 * The role NAME is not sensitive - it appears in the migrations, which are in
 * the repo - and no connection string, host or password is exposed.
 *
 * It also reports the OFREP config store: whether one is wired (so a deploy
 * that dropped the R2 env vars shows up as `configured: false` rather than
 * silently falling back to the database), and how many orgs are dirty / STALE
 * (dirty longer than the reconcile window). `configStore.stale > 0` means
 * write-through is failing and R2 is diverging from the database - alert on it.
 *
 * The HTTP status (and the page-someone 503) is governed ONLY by the database
 * role invariant. A stale config store is an operational warning, not a reason
 * to fail a readiness probe and pull the instance from rotation, so it is
 * surfaced in the body for monitoring rather than folded into the status code.
 */
export const dynamic = "force-dynamic";

async function configStoreHealth() {
  const store = getConfigStore();
  if (!store) return { configured: false as const };
  try {
    const { total, stale } = await countDirtyConfigs();
    return {
      configured: true as const,
      adapter: store.name,
      dirty: total,
      stale,
      healthy: stale === 0,
    };
  } catch {
    // Configured, but its bookkeeping could not be read; report without
    // failing the probe.
    return {
      configured: true as const,
      adapter: store.name,
      error: "unavailable",
    };
  }
}

export async function GET() {
  const [identity, configStore] = await Promise.all([
    connectionIdentity(),
    configStoreHealth(),
  ]);
  const healthy =
    "role" in identity && !identity.bypassesRls && !identity.superuser;

  return apiJson(
    {
      status: healthy ? "ok" : "degraded",
      service: "flagon",
      version: process.env.npm_package_version ?? "0.1.0",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      database:
        "role" in identity
          ? {
              role: identity.role,
              // The two flags that decide whether RLS means anything. Both must
              // be false for tenant isolation to hold.
              bypassesRls: identity.bypassesRls,
              superuser: identity.superuser,
              enforcesRls: !identity.bypassesRls && !identity.superuser,
            }
          : { error: identity.error },
      configStore,
      timestamp: new Date().toISOString(),
    },
    // A probe that returns 200 while reporting a broken invariant will be
    // wired into a dashboard that stays green. 503 makes it page someone.
    { status: healthy ? 200 : 503 },
  );
}
