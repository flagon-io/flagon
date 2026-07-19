import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { organizations, projects } from "./schema";
import * as authSchema from "./auth-schema";

const schema = { organizations, projects, ...authSchema };

/**
 * Base database client, connecting as the RESTRICTED `flagon_app` role
 * (DATABASE_URL_APP). Every query through this client is subject to row-level
 * security. Do NOT read tenant data through `db` directly without a tenant
 * context - use `withTenant` from ./tenant so the org GUC is set. Without it,
 * RLS denies by default (zero rows).
 *
 * DATABASE_URL_APP is deliberately separate from any provider-injected
 * DATABASE_URL / POSTGRES_URL (which point at the owner) so the app never
 * connects as the owner. On a pooled endpoint (Neon PgBouncer) prepared
 * statements are disabled automatically (host contains "pooler") or via
 * DATABASE_POOLED=1.
 */
function resolveAppUrl(): string {
  if (process.env.DATABASE_URL_APP) return process.env.DATABASE_URL_APP;

  const base = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  const password = process.env.FLAGON_APP_PASSWORD;
  if (base && password) {
    const url = new URL(base);
    url.username = "flagon_app";
    url.password = password;
    return url.toString();
  }
  return "";
}

const connectionString = resolveAppUrl();

const pooled =
  process.env.DATABASE_POOLED === "1" || connectionString.includes("pooler");

const client = postgres(connectionString, {
  max: 10,
  prepare: pooled ? false : undefined,
});

export const db = drizzle(client, { schema });

/** Close the underlying pool (used by tests / graceful shutdown). */
export const closePool = () => client.end();

export type Database = typeof db;
export { schema };
