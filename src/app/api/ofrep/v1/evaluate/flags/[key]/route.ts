/**
 * OFREP single-flag evaluation: POST /api/ofrep/v1/evaluate/flags/{key}
 * In production this path is served under api.flagon.io via host routing.
 */

import { evaluateSingle } from '@/server/ofrep/handler';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  return evaluateSingle(req, key);
}
