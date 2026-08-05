import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Regression proof: a SCIM bearer token must STOP authenticating once its org is
 * soft-deleted (a deleted org provisions nothing via an external IdP). Mirrors the
 * OFREP client-key soft-delete gate. DB-gated; seeds a throwaway org + token.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("SCIM token soft-delete gate (integration)", () => {
  let db: (typeof import("../../db/client"))["db"];
  let schema: typeof import("../../db/schema");
  let authenticateScimToken: (typeof import("./token"))["authenticateScimToken"];
  let hashToken: (typeof import("../token-hash"))["hashToken"];

  const orgId = randomUUID();
  const slug = `scim-${orgId.slice(0, 8)}`;
  const token = `flagon_scim_${randomUUID().replace(/-/g, "")}`;

  beforeAll(async () => {
    ({ db } = await import("../../db/client"));
    schema = await import("../../db/schema");
    ({ authenticateScimToken } = await import("./token"));
    ({ hashToken } = await import("../token-hash"));

    // SCIM is a paid capability with the switch on.
    await db.insert(schema.organizations).values({
      id: orgId,
      name: "Scim",
      slug,
      plan: "pro",
      scimEnabled: true,
    });
    await db.insert(schema.scimTokens).values({
      organizationId: orgId,
      name: "e2e",
      tokenHash: hashToken(token),
      lastFour: token.slice(-4),
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.scimTokens).where(eq(schema.scimTokens.organizationId, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  });

  it("authenticates while the org is live", async () => {
    expect(await authenticateScimToken(token)).toEqual({ organizationId: orgId });
  });

  it("DENIES once the org is soft-deleted", async () => {
    await db
      .update(schema.organizations)
      .set({ deletedAt: new Date() })
      .where(eq(schema.organizations.id, orgId));
    expect(await authenticateScimToken(token)).toBeNull();
  });
});
