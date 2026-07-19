import { apiJson } from "@/lib/api";

/**
 * Liveness/readiness probe.
 *
 * Local:      GET http://localhost:3000/api/healthz
 * Production: GET https://api.flagon.io/healthz
 */
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson({
    status: "ok",
    service: "flagon",
    version: process.env.npm_package_version ?? "0.1.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
  });
}
