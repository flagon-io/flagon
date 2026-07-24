import { describe, expect, it } from "vitest";
import { countDirtyConfigs } from "@/lib/config-publish.server";

/**
 * A real-database smoke test for the config-publication bookkeeping. The
 * unit tests in src/lib exercise the caching logic with a fake store, so they
 * never run the actual drizzle-generated SQL - which is how a query that only
 * fails against a live database (a JS Date bound as a raw sql() parameter that
 * postgres-js cannot serialize) reached production. This runs the real query.
 */
describe("config publication bookkeeping (real database)", () => {
  it("counts dirty and stale orgs without a parameter serialization error", async () => {
    const { total, stale } = await countDirtyConfigs();
    expect(total).toBeGreaterThanOrEqual(0);
    expect(stale).toBeGreaterThanOrEqual(0);
    expect(stale).toBeLessThanOrEqual(total);
  });

  it("accepts a custom staleness window", async () => {
    const { total, stale } = await countDirtyConfigs(60 * 60_000);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(stale).toBeLessThanOrEqual(total);
  });
});
