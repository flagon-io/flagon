/**
 * JWT seam constants, in their own module so both the BetterAuth config
 * (which mints) and verifyJwt (which validates) agree — and so neither pulls in
 * the other (avoids an import cycle through `auth`).
 */
export const JWT_AUDIENCE = 'flagon-api';
export const JWT_ISSUER = process.env.BETTER_AUTH_URL ?? 'https://flagon.io';
export const JWT_EXPIRATION = '15m';
export const JWT_TTL_SECONDS = 900;
