// Resolves database URLs from either our explicit vars or the vars injected by
// the Neon/Vercel integration (POSTGRES_*). Shared by the migrate + provision
// scripts; src/db/client.ts mirrors resolveAppUrl for the app runtime.

/** Owner connection (DDL: migrations + role provisioning). Prefers a DIRECT
 * (non-pooling) endpoint. */
export function resolveOwnerUrl(env = process.env) {
  return (
    env.DATABASE_URL_OWNER ??
    env.POSTGRES_URL_NON_POOLING ??
    env.POSTGRES_URL ??
    env.DATABASE_URL_UNPOOLED ??
    env.DATABASE_URL ??
    null
  );
}

/** App connection as the restricted flagon_app role. Either set explicitly via
 * DATABASE_URL_APP, or derived from the pooled owner URL by swapping in
 * flagon_app + FLAGON_APP_PASSWORD. */
export function resolveAppUrl(env = process.env) {
  if (env.DATABASE_URL_APP) return env.DATABASE_URL_APP;

  const base = env.POSTGRES_URL ?? env.DATABASE_URL;
  const password = env.FLAGON_APP_PASSWORD;
  if (base && password) {
    const url = new URL(base);
    url.username = "flagon_app";
    url.password = password;
    return url.toString();
  }
  return null;
}
