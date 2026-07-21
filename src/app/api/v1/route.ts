import { apiJson } from "@/lib/api";
import { brand } from "@/lib/brand";

/**
 * v1 API index - served at `api.flagon.io/v1` (locally `/api/v1`).
 * Discovery: lists resources, the OpenAPI document, and the human docs.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson({
    version: "v1",
    status: "ok",
    resources: ["/v1/user", "/v1/user/emails", "/v1/orgs", "/v1/orgs/{slug}/flags"],
    openapi: "/v1/openapi.json",
    docs: `${brand.url}/docs/api`,
  });
}
