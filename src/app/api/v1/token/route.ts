/**
 * POST /api/v1/token - exchange any credential (session cookie, user PAT, or org
 * token) for a short-lived signed JWT. This is the auth seam: clients/services
 * that want the stateless model call this, then send `Authorization: Bearer <jwt>`;
 * backends validate that JWT against the JWKS with no session/PAT logic.
 *
 * (A session can also be exchanged natively via the jwt plugin's /api/auth/token.)
 */

import { authenticatedPrincipal, isResponse, json } from '@/server/api/http';
import { signPrincipalJwt } from '@/server/auth/jwt';
import { JWT_TTL_SECONDS } from '@/server/auth/jwt-config';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const principal = await authenticatedPrincipal(req);
  if (isResponse(principal)) return principal;

  const token = await signPrincipalJwt(principal);
  return json({ token, token_type: 'Bearer', expires_in: JWT_TTL_SECONDS });
}
