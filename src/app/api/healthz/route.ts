import { apiJson } from "@/lib/api";
import { connectionIdentity } from "@/db/client";

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
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await connectionIdentity();
  const healthy = "role" in identity && !identity.bypassesRls && !identity.superuser;

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
      timestamp: new Date().toISOString(),
    },
    // A probe that returns 200 while reporting a broken invariant will be
    // wired into a dashboard that stays green. 503 makes it page someone.
    { status: healthy ? 200 : 503 },
  );
}
