import { sql } from "drizzle-orm";
import { db } from "./client.js";

/**
 * Run a unit of work scoped to ONE organization, with Postgres row-level
 * security enforcing the boundary.
 *
 * Every tenant table (starting with flags) carries an RLS policy that only
 * exposes rows whose `organization_id` matches the `app.current_org_id` setting.
 * This helper opens a transaction, sets that variable LOCAL to the transaction —
 * so it can never leak to another request sharing the pooled connection — and
 * hands the callback a transaction client `tx`. EVERY tenant query in the
 * callback must go through `tx`: a query on the bare `db`, with no org set, sees
 * nothing under FORCE RLS (fail closed), which is the point.
 *
 * This is DEFENSE IN DEPTH, not authorization. The caller must already have
 * established that the current identity is allowed to act for `organizationId`
 * (org token = that org; user/cookie = a verified membership). RLS is the
 * backstop that turns a forgotten `WHERE organization_id = ?` from a cross-tenant
 * leak into an empty result.
 */
export async function withOrg<T>(
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // is_local = true -> the setting lives only for this transaction, so it is
    // gone the moment the connection returns to the pool.
    await tx.execute(
      sql`select set_config('app.current_org_id', ${organizationId}, true)`,
    );
    return fn(tx);
  });
}

/** The transaction client handed to a withOrg callback. */
export type TenantTx = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
