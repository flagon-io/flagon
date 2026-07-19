import { apiJson } from "@/lib/api";

/**
 * v1 API index - served at `api.flagon.io/v1` (locally `/api/v1`).
 * Resource endpoints will hang off this segment (e.g. /v1/orgs, /v1/flags).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson({
    version: "v1",
    status: "ok",
    resources: [],
  });
}
