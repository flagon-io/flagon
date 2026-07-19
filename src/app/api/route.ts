import { apiJson } from "@/lib/api";

/**
 * API root - served at `api.flagon.io/` (locally `/api`).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson({
    name: "flagon-api",
    status: "ok",
    versions: { v1: "/v1" },
    health: "/healthz",
  });
}
