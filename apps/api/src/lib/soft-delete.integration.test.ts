import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Regression proof for the org SOFT-DELETE gate: a soft-deleted org must become
 * completely inaccessible. Specifically the two paths an adversarial review flagged
 * as leaks — the OFREP client-key resolution (a deleted org must serve no flags /
 * bill no events) and slug-based org resolution — must both deny once deleted_at is
 * set, and resume nothing (the row stays, just hidden).
 *
 * DB-gated (CI or local DATABASE_URL); seeds a throwaway org and cleans up.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("org soft-delete access gate (integration)", () => {
  let db: (typeof import("../db/client.js"))["db"];
  let authTables: typeof import("../db/auth-tables.js");
  let t: typeof import("../db/schema.js");
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let resolveClientKey: (typeof import("../flags/client-key.js"))["resolveClientKey"];
  let orgIdBySlug: (typeof import("./org-context.js"))["orgIdBySlug"];
  let hashToken: (typeof import("./token-hash.js"))["hashToken"];

  const orgId = randomUUID();
  const slug = `sd-${orgId.slice(0, 8)}`;
  const token = `flagon_client_${randomUUID().replace(/-/g, "")}`;

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    authTables = await import("../db/auth-tables.js");
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ resolveClientKey } = await import("../flags/client-key.js"));
    ({ orgIdBySlug } = await import("./org-context.js"));
    ({ hashToken } = await import("./token-hash.js"));

    await db.insert(authTables.organizations).values({
      id: orgId,
      name: "Soft Delete",
      slug,
      plan: "hobby",
    });
    const envId = await withOrg(orgId, async (tx) => {
      const [env] = await tx
        .insert(t.environments)
        .values({ organizationId: orgId, key: "production", name: "Production" })
        .returning();
      return env.id;
    });
    await db.insert(t.clientKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "e2e",
      keyHash: hashToken(token),
      prefix: "flagon_client",
      lastFour: token.slice(-4),
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.clientKeys).where(eq(t.clientKeys.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("resolves the client key + slug while the org is live", async () => {
    const identity = await resolveClientKey(token);
    expect(identity?.organizationId).toBe(orgId);
    expect(await orgIdBySlug(slug)).toBe(orgId);
  });

  it("DENIES the client key + slug once the org is soft-deleted", async () => {
    await db
      .update(authTables.organizations)
      .set({ deletedAt: new Date() })
      .where(eq(authTables.organizations.id, orgId));

    // The OFREP hot path must resolve nothing: no flag evaluation, no billable events.
    expect(await resolveClientKey(token)).toBeNull();
    // Slug resolution 404s everywhere it's used.
    expect(await orgIdBySlug(slug)).toBeNull();

    // The row is retained (soft, not hard): still present, just hidden.
    const [row] = await db
      .select({ id: authTables.organizations.id, deletedAt: authTables.organizations.deletedAt })
      .from(authTables.organizations)
      .where(eq(authTables.organizations.id, orgId))
      .limit(1);
    expect(row?.id).toBe(orgId);
    expect(row?.deletedAt).not.toBeNull();
  });
});
