import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

/**
 * The console's runtime database client.
 *
 * Same Postgres instance and same role convention as the API (see
 * apps/api/src/db/client.ts): connect as the restricted APPLICATION role via
 * `APP_DATABASE_URL` so RLS is enforced once tenant tables carry it, falling
 * back to `DATABASE_URL` for single-role local dev. BetterAuth issues all of
 * its queries through this client.
 *
 * The postgres.js pool is cached on `globalThis` so Next's dev HMR reuses one
 * pool across module reloads instead of opening a fresh pool every reload (which
 * otherwise leaks connections until Postgres hits "too many clients"). In
 * production the module is evaluated once, so this is a plain singleton.
 *
 * `server-only` guards against this module ever being pulled into a client
 * bundle: it holds the connection string and must stay on the server.
 */
const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "APP_DATABASE_URL (or DATABASE_URL for local dev) is not set. Copy apps/app/.env.example to .env.local, or set it in the deploy environment.",
  );
}

const globalForDb = globalThis as unknown as {
  __flagonPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__flagonPg ??
  postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__flagonPg = client;
}

export const db = drizzle(client, { schema });
