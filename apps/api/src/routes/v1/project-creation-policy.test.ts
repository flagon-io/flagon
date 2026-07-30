import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The org base permission for project creation (GitHub-style). Owners/admins may
 * always create; ordinary members only when the org's policy is 'members'.
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("project creation policy", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const memberToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;

  const createProject = (token: string) =>
    app.request(`/v1/orgs/${slug}/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "proj",
        key: `proj-${randomBytes(4).toString("hex")}`,
      }),
    });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Acme", slug, plan: "pro" });
    await db.insert(authTables.users).values([
      { id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` },
      { id: memberId, name: "Member", email: `member-${orgId}@example.com` },
    ]);
    await db.insert(authTables.members).values([
      { id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" },
      { id: randomUUID(), organizationId: orgId, userId: memberId, role: "member" },
    ]);
    await db.insert(authTables.accessTokens).values([
      {
        id: randomUUID(),
        type: "personal",
        name: "owner pat",
        tokenHash: hashToken(ownerToken),
        prefix: "flagon_pat",
        lastFour: ownerToken.slice(-4),
        userId: ownerId,
      },
      {
        id: randomUUID(),
        type: "personal",
        name: "member pat",
        tokenHash: hashToken(memberToken),
        prefix: "flagon_pat",
        lastFour: memberToken.slice(-4),
        userId: memberId,
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId)),
    );
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, memberId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await db.delete(authTables.users).where(eq(authTables.users.id, memberId));
  });

  it("blocks a non-manager member under the default 'managers' policy", async () => {
    const res = await createProject(memberToken);
    expect(res.status).toBe(403);
  });

  it("always allows an owner", async () => {
    const res = await createProject(ownerToken);
    expect(res.status).toBe(201);
  });

  it("allows a member once the org opens creation to 'members'", async () => {
    await db
      .update(authTables.organizations)
      .set({ projectCreationPolicy: "members" })
      .where(eq(authTables.organizations.id, orgId));

    const res = await createProject(memberToken);
    expect(res.status).toBe(201);
  });
});
