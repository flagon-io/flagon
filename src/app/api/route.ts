/**
 * GET /api - the API root. Self-documenting: a flat map of named URLs you can
 * follow. Reachable at api.flagon.io and localhost:3000/api.
 */

import { apiBaseUrl, json } from '@/server/api/http';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const base = apiBaseUrl(req);
  return json({
    name: 'Flagon API',
    description: 'The open-source developer platform. Catalog primitives today, capabilities soon.',
    documentation_url: 'https://flagon.io/docs',
    status: 'operational',
    versions: ['v1'],
    current_version_url: `${base}/v1`,
    health_url: `${base}/v1/health`,
    openapi_url: `${base}/openapi.json`,
  });
}
