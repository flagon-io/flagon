import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema.js";

/**
 * The runtime database client.
 *
 * Connects as the APPLICATION role via `APP_DATABASE_URL` — the non-owner,
 * non-BYPASSRLS role, so once tenant tables carry RLS it is actually enforced
 * on every query the API makes. This is the one connection string added by
 * hand: managed Postgres typically provisions only the OWNER role's strings
 * (`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` direct), never a restricted
 * app role. Use the restricted role on the POOLED endpoint, since the API runs
 * as short-lived serverless invocations.
 *
 * Falls back to `DATABASE_URL` so single-role local dev (compose Postgres)
 * needs no extra config. Migrations run as the owner via a different string
 * entirely (see migrate.ts).
 *
 * The postgres.js client is created once per process (module singleton) so a
 * warm serverless instance reuses its connections instead of opening a new one
 * per request.
 */
const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "APP_DATABASE_URL (or DATABASE_URL for local dev) is not set. Copy apps/api/.env.example to .env, or set it in the deploy environment.",
  );
}

// A production instance must never fall back to the owner connection.
if (!process.env.APP_DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error(
    "APP_DATABASE_URL is required in production; refusing to run without the restricted RLS role.",
  );
}

const client = postgres(url, {
  // Keep the pool small: serverless invocations are single-request, and Neon's
  // pooler multiplexes anyway. A large per-instance pool just wastes Neon slots.
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
});

export const db = drizzle(client, { schema });
