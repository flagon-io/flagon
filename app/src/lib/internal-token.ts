// The shared app<->API secret. With it plus an X-Flagon-User-Id header, a caller
// can act as ANY user, so production has no default: an unset token is a hard
// error at the first call that needs it (never a silent empty token). In
// development only, it falls back to the same public value the API uses in its
// development mode, so a fresh checkout works with zero setup.
//
// Read lazily (a function, not a module constant): builds and pages that never
// talk to the API must not need the secret.
export const DEV_INTERNAL_TOKEN = "dev-internal-token";

export function internalToken(): string {
  const token = process.env.FLAGON_INTERNAL_TOKEN?.trim();
  if (token) return token;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FLAGON_INTERNAL_TOKEN is required in production (it must match the API's FLAGON_INTERNAL_TOKEN).",
    );
  }
  return DEV_INTERNAL_TOKEN;
}
