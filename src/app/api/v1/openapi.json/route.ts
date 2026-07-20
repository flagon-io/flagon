import { apiJson } from "@/lib/api";
import { openApiSpec } from "@/lib/openapi";

/**
 * The machine-readable API contract - import it into Postman/Insomnia, feed
 * it to codegen, or browse it rendered at www.flagon.io/docs/api.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(openApiSpec, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
