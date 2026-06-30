/**
 * OFREP bulk evaluation: POST /api/ofrep/v1/evaluate/flags
 * Supports conditional requests via If-None-Match against the bundle etag.
 */

import { evaluateBulk } from '@/server/ofrep/handler';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return evaluateBulk(req);
}
