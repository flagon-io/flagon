/**
 * GET /api/openapi.json - the generated OpenAPI 3.1 document describing the
 * whole API. Powers the built-in viewer at /docs/api and any external client
 * generators. The `servers` URL is derived from the request so the spec is
 * correct on api.flagon.io and locally alike.
 */

import { apiBaseUrl, json } from '@/server/api/http';
import { buildOpenApiDocument } from '@/server/openapi/spec';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  // CORS is applied centrally in src/proxy.ts.
  return json(buildOpenApiDocument(apiBaseUrl(req)));
}
