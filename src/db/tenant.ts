import { sql } from "drizzle-orm";
import { assertRestrictedRole, db } from "./client";

/**
 * Run a callback inside a transaction scoped to a single tenant.
 *
 * Sets the transaction-local `app.current_org_id` GUC that every RLS policy
 * reads, then hands you a transaction-bound client. All reads and writes inside
 * are automatically confined to `orgId`; there is no way to reach another
 * tenant's rows because `flagon_app` cannot bypass RLS.
 *
 *   const projects = await withTenant(orgId, (tx) =>
 *     tx.select().from(schema.projects),
 *   );
 *
 * That last sentence is an ASSUMPTION about deployment, not a property of this
 * code, so it is checked rather than trusted: every tenant transaction is
 * gated on assertRestrictedRole(). It costs one query per cold start (the
 * result is memoised) and turns "connected as the owner in production" from an
 * invisible, total loss of isolation into a loud failure on the first request.
 */
export async function withTenant<T>(
  orgId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  await assertRestrictedRole();
  return db.transaction(async (tx) => {
    // is_local = true -> reset at end of transaction; never leaks across the pool.
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
    );
    return fn(tx);
  });
}
