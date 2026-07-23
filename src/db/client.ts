import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema as appSchema } from "./schema";
import * as authSchema from "./auth-schema";

// Sourced from schema.ts rather than re-listed: a table added there was
// silently missing from the query client for as long as the two lists drifted.
const schema = { ...appSchema, ...authSchema };

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

/**
 * REFUSE TO CONNECT WITH NO URL.
 *
 * This is the one configuration mistake that fails silently and catastrophically.
 * `postgres("")` does not error - it falls back to libpq's environment
 * defaults (PGHOST/PGUSER/PGPASSWORD/PGDATABASE), and the Neon integration
 * injects exactly those, pointing at the OWNER. So a production deploy missing
 * FLAGON_APP_PASSWORD would connect as the owner, bypass every RLS policy, and
 * behave completely normally: no error, no failed request, just every tenant
 * able to read every other tenant's data.
 *
 * Throwing here converts that into a deploy that refuses to boot. The one case
 * where an empty URL is legitimate is a build with no database at all (Vercel
 * collecting page data), which never opens a connection - so this is deferred
 * to first use rather than thrown at module scope.
 */
function assertConfigured(): void {
  if (connectionString) return;
  throw new Error(
    "No application database URL. Set DATABASE_URL_APP, or POSTGRES_URL + " +
      "FLAGON_APP_PASSWORD.\n" +
      "Refusing to fall back to libpq's PG* environment defaults: on a Neon/Vercel " +
      "deployment those are the OWNER role, which bypasses row-level security.",
  );
}

const pooled =
  process.env.DATABASE_POOLED === "1" || connectionString.includes("pooler");

/**
 * Cache the pool on globalThis in development: Next's hot reload re-evaluates
 * this module on every recompile, and without the cache each reload leaks a
 * fresh 10-connection pool until local Postgres runs out of slots.
 */
const globalForDb = globalThis as unknown as {
  __flagonPgClient?: ReturnType<typeof postgres>;
};

export const pgClient =
  globalForDb.__flagonPgClient ??
  postgres(connectionString, {
    max: 10,
    prepare: pooled ? false : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__flagonPgClient = pgClient;
}

export const db = drizzle(pgClient, { schema });

export type ConnectionIdentity = {
  role: string;
  database: string;
  /** True if this role can read past RLS. Must be false. */
  bypassesRls: boolean;
  superuser: boolean;
};

/**
 * Who we are actually connected as, asked of the database itself.
 *
 * Configuration can lie in both directions - a URL naming `flagon_app` whose
 * role was granted BYPASSRLS, a password swapped to the owner's, an env var
 * shadowed by another - and every one of those looks fine from the outside.
 * The only trustworthy answer comes from `pg_roles` on the live connection.
 */
async function readIdentity(): Promise<ConnectionIdentity> {
  const [row] = await pgClient<
    {
      role: string;
      database: string;
      bypassrls: boolean;
      superuser: boolean;
    }[]
  >`
    SELECT current_user AS role,
           current_database() AS database,
           rolbypassrls AS bypassrls,
           rolsuper AS superuser
    FROM pg_roles WHERE rolname = current_user
  `;
  return {
    role: row.role,
    database: row.database,
    bypassesRls: row.bypassrls,
    superuser: row.superuser,
  };
}

/** Memoised per process: one round trip per cold start, not per request. */
let identityCheck: Promise<ConnectionIdentity> | null = null;

/**
 * Assert that this process cannot bypass row-level security, and cache it.
 *
 * The failure this exists to catch is not a bug in a policy - the policies are
 * proven by src/db/tenancy.test.ts. It is a DEPLOY connecting as the wrong
 * role, which no amount of correct SQL protects against and which produces no
 * symptom at all: the app works, every query succeeds, and tenant isolation is
 * simply absent.
 *
 * Awaited on the tenant path (see ./tenant.ts), so a misconfigured deployment
 * fails on its first tenant query rather than serving cross-tenant data. A
 * rejected promise is not cached, so a transient connection error at boot does
 * not poison the process for its lifetime.
 */
export async function assertRestrictedRole(): Promise<ConnectionIdentity> {
  assertConfigured();
  identityCheck ??= readIdentity()
    .then((identity) => {
      if (identity.bypassesRls || identity.superuser) {
        throw new Error(
          `Database role "${identity.role}" can bypass row-level security ` +
            `(bypassrls=${identity.bypassesRls}, superuser=${identity.superuser}). ` +
            "Tenant isolation would be silently absent. Connect as the restricted " +
            "application role (flagon_app) instead.",
        );
      }
      return identity;
    })
    .catch((error) => {
      identityCheck = null;
      throw error;
    });
  return identityCheck;
}

/**
 * The connection's identity for reporting, without throwing.
 *
 * Used by the health probe so a deployment can be checked from outside rather
 * than by waiting for a tenant request to fail.
 */
export async function connectionIdentity(): Promise<
  ConnectionIdentity | { error: string }
> {
  try {
    assertConfigured();
    return await readIdentity();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unknown" };
  }
}

/** Close the underlying pool (used by tests / graceful shutdown). */
export const closePool = () => pgClient.end();

export type Database = typeof db;
export { schema };
