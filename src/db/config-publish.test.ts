import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { countDirtyConfigs, publishConfig } from "@/lib/config-publish.server";

/**
 * Real-database tests for the config-publication bookkeeping. The src/lib unit
 * tests exercise the caching logic with a fake store, so they never run the
 * actual drizzle-generated SQL - which is how two production incidents slipped
 * through, both the same shape: a JS Date bound into a raw sql() template, which
 * postgres-js cannot serialize (and which, even serialized, would never match
 * now()'s microsecond precision so the marker would never clear). These run the
 * real SQL against the database.
 */
describe("config publication bookkeeping (real database)", () => {
  it("counts dirty and stale orgs without a parameter serialization error", async () => {
    const { total, stale } = await countDirtyConfigs();
    expect(total).toBeGreaterThanOrEqual(0);
    expect(stale).toBeGreaterThanOrEqual(0);
    expect(stale).toBeLessThanOrEqual(total);
  });

  it("publishConfig records bookkeeping and clears the dirty marker", async () => {
    const slug = `cfgpub-${Date.now().toString(36)}`;
    const [org] = await db
      .insert(organizations)
      .values({ slug, name: slug })
      .returning({ id: organizations.id });
    try {
      // Mark dirty the way a mutation does - now() in SQL, microsecond precision.
      await db.execute(
        sql`UPDATE organizations SET config_pending_at = now() WHERE id = ${org.id}`,
      );

      const result = await publishConfig(org.id);
      if (result === null) return; // no config store in this environment; nothing to assert

      const [row] = await db
        .select({
          pendingAt: organizations.configPendingAt,
          version: organizations.configVersion,
          publishedAt: organizations.configPublishedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, org.id));

      expect(row.pendingAt).toBeNull(); // cleared despite microsecond precision
      expect(row.version).toBe(result.version);
      expect(row.publishedAt).not.toBeNull();
    } finally {
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
