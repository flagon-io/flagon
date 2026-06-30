/**
 * Proxy (Next 16's renamed middleware) - two jobs:
 *
 * 1. CORS. The whole /api surface is meant to be called cross-origin (SDKs in
 *    browsers, other sites, our own apps), so we set permissive CORS on every
 *    API response and answer preflight (OPTIONS) here, uniformly. Allow-Origin
 *    is `*`; we do NOT send Allow-Credentials, so session-cookie endpoints stay
 *    safe (browsers block credentialed cross-origin against a wildcard origin)
 *    while bearer-token (SDK key) calls work everywhere.
 *
 * 2. Host-based routing (production only - a no-op locally where everything is
 *    on localhost):
 *      flagon.io       -> marketing (app/)
 *      app.flagon.io   -> dashboard (app/app/*)        [/* -> /app/*]
 *      sudo.flagon.io  -> internal admin (app/sudo/*)  [/* -> /sudo/*]
 *      api.flagon.io   -> API (app/api/*)              [/* -> /api/*]
 *    On app/sudo subdomains, /api requests pass through so same-origin API
 *    calls aren't rewritten into the surface's route group.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag',
  'Access-Control-Max-Age': '86400',
};

function applyCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const host = (req.headers.get('host') ?? '').split(':')[0]!;
  const sub =
    root && host.endsWith(root)
      ? host.slice(0, Math.max(0, host.length - root.length)).replace(/\.$/, '')
      : '';

  // Surface isolation (prod): the apex (marketing) must NOT serve the product
  // surfaces — those live only on their subdomains. So flagon.io/api/v1 is dead,
  // and flagon.io/app|/sudo bounce to the right subdomain.
  if (root && (sub === '' || sub === 'www')) {
    if (url.pathname.startsWith('/api')) {
      return applyCors(
        new NextResponse(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url.pathname.startsWith('/app')) {
      return NextResponse.redirect(
        `https://app.${root}${url.pathname.replace(/^\/app/, '') || '/'}${url.search}`,
      );
    }
    if (url.pathname.startsWith('/sudo')) {
      return NextResponse.redirect(
        `https://sudo.${root}${url.pathname.replace(/^\/sudo/, '') || '/'}${url.search}`,
      );
    }
  }

  // Resolve any subdomain rewrite (prod only; `sub` is '' locally).
  const passthrough = url.pathname.startsWith('/api');
  let rewriteTo: string | null = null;
  if (sub === 'api' && !url.pathname.startsWith('/api')) rewriteTo = `/api${url.pathname}`;
  else if (sub === 'app' && !passthrough && !url.pathname.startsWith('/app'))
    rewriteTo = `/app${url.pathname}`;
  else if (sub === 'sudo' && !passthrough && !url.pathname.startsWith('/sudo'))
    rewriteTo = `/sudo${url.pathname}`;

  const isApi = (rewriteTo ?? url.pathname).startsWith('/api');

  // Answer CORS preflight for any API path before it hits a route.
  if (isApi && req.method === 'OPTIONS') {
    return applyCors(new NextResponse(null, { status: 204 }));
  }

  let res: NextResponse;
  if (rewriteTo) {
    url.pathname = rewriteTo;
    res = NextResponse.rewrite(url);
  } else {
    res = NextResponse.next();
  }

  return isApi ? applyCors(res) : res;
}

export const config = {
  // Skip Next internals and static assets; everything else (pages + /api) runs.
  matcher: ['/((?!_next/|.well-known/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|txt)$).*)'],
};
