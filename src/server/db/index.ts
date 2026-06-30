/**
 * Database client. Uses postgres.js (works in Node on Vercel, locally, and in
 * the self-host Docker image). For an edge-runtime evaluation path we would
 * swap in @neondatabase/serverless; the schema and queries are identical.
 *
 * RLS: `withTenant(orgId, cb)` opens a transaction and sets the
 * `app.current_org` GUC for its lifetime, so policies in rls.sql isolate the
 * tenant. Auth tables are intentionally NOT under RLS (BetterAuth manages them
 * directly), so the plain `db` client is correct for auth + system queries.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

// Cache the postgres client on globalThis so it survives module re-evaluation.
// Without this, every dev HMR (and every hot edit) would open a brand-new pool
// and orphan the old one — connections leak until Postgres hits max_connections
// ("too many clients" / "Failed to get session"). In prod the module evaluates
// once, so this is simply a safe singleton.
const globalForDb = globalThis as unknown as {
  __flagonPgClient?: ReturnType<typeof postgres>;
};

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  // `prepare: false` keeps us compatible with transaction-pooling poolers
  // (Neon pooler, PgBouncer). One pool, reused across HMR.
  const client = (globalForDb.__flagonPgClient ??= postgres(connectionString, {
    max: 10,
    prepare: false,
  }));
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;

// Lazily connect on first use so importing this module (e.g. while Next collects
// route metadata at build time) never requires DATABASE_URL or opens a socket.
let instance: Db | undefined;
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    instance ??= createDb();
    const value = instance[prop as keyof Db];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(instance) : value;
  },
});

export type Database = Db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Run a callback inside a transaction scoped to a single tenant. All domain
 * tables under RLS will only expose rows for `orgId`.
 */
export function withTenant<T>(orgId: string, cb: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(setting, value, is_local=true) === SET LOCAL, scoped to the tx.
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    return cb(tx);
  });
}

export { schema };
