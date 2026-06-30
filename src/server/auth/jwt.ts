/**
 * The JWT seam. `signPrincipalJwt` mints a short-lived JWT from a directly-resolved
 * principal; `verifyJwt` validates a JWT against the published JWKS using jose only
 * — no session, no PAT table, no `auth` internals. That verify function is exactly
 * what a future split-out API/data-plane imports: when services are separated, they
 * deal with JWT and nothing else. (Here it reads the JWKS in-process via
 * `auth.api.getJwks()`; a standalone service would swap in `createRemoteJWKSet`.)
 */

import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import { auth } from '@/server/auth';
import { JWT_AUDIENCE, JWT_ISSUER } from './jwt-config';
import { principalClaims, type JwtClaims, type Principal } from './principal';

/** Mint a 15-minute JWT for a session/PAT/org-token principal. */
export async function signPrincipalJwt(principal: Principal): Promise<string> {
  const payload = await principalClaims(principal);
  const { token } = await auth.api.signJWT({ body: { payload } });
  return token;
}

// Cache the key set briefly; jose verifies offline once we have the public keys.
let cachedKeySet: ReturnType<typeof createLocalJWKSet> | null = null;
let cachedAt = 0;

async function keySet() {
  if (!cachedKeySet || Date.now() - cachedAt > 5 * 60_000) {
    const jwks = (await auth.api.getJwks()) as JSONWebKeySet;
    cachedKeySet = createLocalJWKSet(jwks);
    cachedAt = Date.now();
  }
  return cachedKeySet;
}

/** Verify a Flagon JWT and return its claims, or null if invalid/expired/tampered. */
export async function verifyJwt(token: string): Promise<JwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, await keySet(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as unknown as JwtClaims;
  } catch {
    return null;
  }
}
