import "server-only";

/**
 * Boot-time environment validation for the console.
 *
 * The console signs every session and token with BETTER_AUTH_SECRET. A deploy
 * that boots without it — or with the dev placeholder — would silently sign
 * with a weak or generated key, so we fail fast and loud here instead of
 * limping up in a compromised state. This module is imported by the auth
 * instance, which every request path pulls in, so the check runs at startup.
 *
 * Kept dependency-free on purpose: env validation should have nothing that can
 * itself misbehave.
 */
const DEV_PLACEHOLDER_SECRET = "dev-secret-change-me";

const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProduction = NODE_ENV === "production";

function fail(message: string): never {
  throw new Error(`Invalid console environment: ${message}`);
}

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!BETTER_AUTH_SECRET || BETTER_AUTH_SECRET.trim() === "") {
  fail("BETTER_AUTH_SECRET is required. See apps/app/.env.example.");
}
if (BETTER_AUTH_SECRET.length < 16) {
  fail(
    "BETTER_AUTH_SECRET is too short; use a long random value (e.g. 32 bytes of hex).",
  );
}
if (isProduction && BETTER_AUTH_SECRET === DEV_PLACEHOLDER_SECRET) {
  fail(
    "BETTER_AUTH_SECRET is still the dev placeholder in production. Generate a real secret before deploying.",
  );
}

const DATABASE_URL = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  fail(
    "A database connection string is required: set APP_DATABASE_URL (or DATABASE_URL for local dev).",
  );
}

/** Validated, typed server environment. Importing this module runs the check. */
export const env = {
  NODE_ENV,
  isProduction,
  BETTER_AUTH_SECRET,
  DATABASE_URL,
} as const;
