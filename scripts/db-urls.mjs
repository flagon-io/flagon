// Resolves database URLs from either our explicit vars or the vars injected by
// the Neon/Vercel integration (POSTGRES_*). Shared by the migrate + provision
// scripts; src/db/client.ts mirrors resolveAppUrl for the app runtime.

/**
 * Names an owner URL can arrive under, in precedence order.
 *
 * Exported so a script can report WHICH one it used. The names differ between
 * our own setup and the Neon/Vercel integration, and that difference bites in
 * one specific way: a `DATABASE_URL_OWNER` in .env.local outranks a
 * `POSTGRES_URL` supplied for a one-off production run, so the script connects
 * to the developer's laptop while appearing to have been pointed elsewhere.
 * Printing the source variable turns that from a silent wrong answer into an
 * obvious one.
 */
export const OWNER_URL_VARS = [
  "DATABASE_URL_OWNER",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
];

/** Owner connection (DDL: migrations + role provisioning). Prefers a DIRECT
 * (non-pooling) endpoint. */
export function resolveOwnerUrl(env = process.env) {
  return OWNER_URL_VARS.map((name) => env[name]).find(Boolean) ?? null;
}

/** Which variable resolveOwnerUrl took its value from, or null. */
export function resolveOwnerUrlSource(env = process.env) {
  return OWNER_URL_VARS.find((name) => env[name]) ?? null;
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
