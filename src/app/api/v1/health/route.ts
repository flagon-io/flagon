/**
 * GET /api/v1/health - unauthenticated liveness probe. Used by Docker, uptime
 * checks, and load balancers.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'flagon',
    version: process.env.npm_package_version ?? '0.1.0',
    time: new Date().toISOString(),
  });
}
