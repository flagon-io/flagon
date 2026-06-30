/**
 * OFREP configuration: GET /api/ofrep/v1/configuration
 * Provider capability discovery (caching/polling + supported types). In
 * production this path is served under api.flagon.io via host routing.
 */

import { getConfiguration } from '@/server/ofrep/handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return getConfiguration(req);
}
