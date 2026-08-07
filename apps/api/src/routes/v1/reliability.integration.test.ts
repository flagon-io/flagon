import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Reliability (Incidents) end-to-end over the real Hono app: declaring an incident
 * with catalog blast radius + auto-derived owner team, and the timeline → resolve
 * lifecycle. Runs only with a migrated DB reachable. Seeds an isolated random org.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("reliability: incidents", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const u1 = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });

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
      { id: u1, name: "Ana", email: `ana-${orgId}@example.com` },
    ]);
    await db.insert(authTables.members).values([
      { id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" },
      { id: randomUUID(), organizationId: orgId, userId: u1, role: "member" },
    ]);
    await db.insert(authTables.accessTokens).values({ id: randomUUID(), type: "personal", name: "owner pat", tokenHash: hashToken(ownerToken), prefix: "flagon_pat", lastFour: ownerToken.slice(-4), userId: ownerId });

    // A team owning a project, so an incident's owner can auto-derive from the service.
    const teamId = randomUUID();
    await withOrg(orgId, async (tx) => {
      await tx.insert(schema.teams).values({ id: teamId, organizationId: orgId, key: "sre", name: "SRE" });
      await tx.insert(schema.teamMembers).values({ id: randomUUID(), organizationId: orgId, teamId, userId: u1, role: "maintainer" });
      await tx.insert(schema.projects).values({ organizationId: orgId, key: "web", name: "Web", ownerTeamId: teamId });
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(schema.incidents).where(eq(schema.incidents.organizationId, orgId));
      await tx.delete(schema.runbooks).where(eq(schema.runbooks.organizationId, orgId));
      await tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
      await tx.delete(schema.teams).where(eq(schema.teams.organizationId, orgId));
    });
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await db.delete(authTables.users).where(eq(authTables.users.id, u1));
  });

  it("declares an incident with blast radius and auto owner, then runs the lifecycle", async () => {
    const declared = await post("/incidents", { title: "API is down", severity: "sev1", affectedProjectKeys: ["web"] });
    expect(declared.status).toBe(201);
    const body = await declared.json();
    expect(body.incident.number).toBeGreaterThan(0);
    expect(body.incident.ownerTeam?.key).toBe("sre"); // auto-derived from the affected service
    expect(body.services.map((s: { key: string }) => s.key)).toContain("web");
    const n = body.incident.number;

    // timeline + status change
    expect((await post(`/incidents/${n}/updates`, { body: "Investigating", status: "investigating" })).status).toBe(201);
    let detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.status).toBe("investigating");
    expect(detail.updates).toHaveLength(1);

    // resolve
    expect((await post(`/incidents/${n}/resolve`, {})).status).toBe(200);
    detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.status).toBe("resolved");
    expect(detail.incident.resolvedAt).not.toBeNull();
  });
});
