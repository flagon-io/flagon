import { sql } from "drizzle-orm";
import { db } from "./client";

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
 */
export async function withTenant<T>(
  orgId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // is_local = true -> reset at end of transaction; never leaks across the pool.
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
