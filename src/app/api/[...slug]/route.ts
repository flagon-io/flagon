/**
 * Catch-all for unknown /api/* paths. Ensures the API surface is JSON all the
 * way down - a missing endpoint returns a JSON 404 body, never an HTML
 * error page. Defined routes (v1, ofrep, auth) are more specific and win.
 */

import { json } from '@/server/api/http';

export const dynamic = 'force-dynamic';

function notFound(): Response {
  return json(
    { message: 'Not Found', documentation_url: 'https://flagon.io/docs/api' },
    { status: 404 },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
