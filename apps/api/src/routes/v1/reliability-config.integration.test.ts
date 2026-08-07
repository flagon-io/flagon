import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Reliability CONFIG end-to-end over the real Hono app: the configurable severity
 * ladder (seeded defaults, custom replace, archival, validation on declare), optional
 * SLO/SLA objectives (CRUD), and the uptime endpoint including the service-vs-platform
 * decoupling (a proportional severity dents one service more than the platform total).
 *
 * Runs only with a migrated DB reachable. Seeds an isolated random org with two projects.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("reliability: severity + uptime + objectives", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `rel-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const put = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PUT", headers: auth, body: JSON.stringify(body) });
  const patch = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PATCH", headers: auth, body: JSON.stringify(body) });
  const del = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { method: "DELETE", headers: auth });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Rel", slug, plan: "pro" });
    await db.insert(authTables.users).values({ id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` });
    await db.insert(authTables.members).values({ id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" });
    await db.insert(authTables.accessTokens).values({ id: randomUUID(), type: "personal", name: "owner pat", tokenHash: hashToken(ownerToken), prefix: "flagon_pat", lastFour: ownerToken.slice(-4), userId: ownerId });
    await withOrg(orgId, async (tx) => {
      await tx.insert(schema.projects).values([
        { organizationId: orgId, key: "web", name: "Web" },
        { organizationId: orgId, key: "api", name: "API" },
      ]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(schema.incidents).where(eq(schema.incidents.organizationId, orgId));
      await tx.delete(schema.reliabilityObjectives).where(eq(schema.reliabilityObjectives.organizationId, orgId));
      await tx.delete(schema.incidentSeverityLevels).where(eq(schema.incidentSeverityLevels.organizationId, orgId));
      await tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
    });
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
  });

  it("seeds the standard SEV1-4 ladder with sane defaults on first read", async () => {
    const res = await get("/severity-levels");
    expect(res.status).toBe(200);
    const { levels } = await res.json();
    expect(levels.map((l: { key: string }) => l.key)).toEqual(["sev1", "sev2", "sev3", "sev4"]);
    expect(levels.filter((l: { isDefault: boolean }) => l.isDefault)).toHaveLength(1);
    const sev1 = levels.find((l: { key: string }) => l.key === "sev1");
    expect(sev1.platformMode).toBe("full");
    expect(sev1.downtimeWeight).toBe(1);
    const sev3 = levels.find((l: { key: string }) => l.key === "sev3");
    expect(sev3.platformMode).toBe("none");
    expect(sev3.downtimeWeight).toBe(0);
  });

  it("replaces the ladder with a custom one, archiving the old keys", async () => {
    const res = await put("/severity-levels", {
      levels: [
        { key: "p0", name: "P0", rank: 0, color: "#ef4444", downtimeWeight: 1, platformMode: "full", isDefault: false },
        { key: "p1", name: "P1", rank: 1, color: "#f97316", downtimeWeight: 1, platformMode: "proportional", isDefault: true },
      ],
    });
    expect(res.status).toBe(200);
    const after = await (await get("/severity-levels")).json();
    expect(after.levels.map((l: { key: string }) => l.key)).toEqual(["p0", "p1"]);
  });

  it("rejects an unknown/archived severity on declare, accepts a live one", async () => {
    const archived = await post("/incidents", { title: "old sev", severity: "sev1", affectedProjectKeys: ["web"] });
    expect(archived.status).toBe(400);
    const ok = await post("/incidents", { title: "real", severity: "p1", affectedProjectKeys: ["web"] });
    expect(ok.status).toBe(201);
  });

  it("enforces exactly one default", async () => {
    const two = await put("/severity-levels", {
      levels: [
        { key: "p0", name: "P0", rank: 0, color: "#ef4444", downtimeWeight: 1, platformMode: "full", isDefault: true },
        { key: "p1", name: "P1", rank: 1, color: "#f97316", downtimeWeight: 1, platformMode: "proportional", isDefault: true },
      ],
    });
    expect(two.status).toBe(400);
  });

  it("decouples service impact from the platform total in uptime", async () => {
    // Declare a proportional (P1) incident on ONE of the two services, backdate its
    // start an hour, leave it open. The affected service should be dinged more than the
    // platform total (platform only counts its 1/2 share).
    const declared = await post("/incidents", { title: "web slow", severity: "p1", affectedProjectKeys: ["web"] });
    expect(declared.status).toBe(201);
    const { incident } = await declared.json();
    await withOrg(orgId, async (tx) => {
      await tx
        .update(schema.incidents)
        .set({ startedAt: new Date(Date.now() - 3_600_000), resolvedAt: null })
        .where(and(eq(schema.incidents.organizationId, orgId), eq(schema.incidents.number, incident.number)));
    });

    const report = await (await get("/incidents/uptime?window=30")).json();
    expect(report.totalServices).toBe(2);
    const web = report.perProject.find((p: { projectKey: string }) => p.projectKey === "web");
    const api = report.perProject.find((p: { projectKey: string }) => p.projectKey === "api");
    expect(api.uptimePct).toBe(100); // unaffected service
    expect(web.uptimePct).toBeLessThan(100); // service dinged
    // Platform total is affected LESS than the single worst service (only its share).
    expect(report.totals.uptimePct).toBeGreaterThan(web.uptimePct);
    expect(report.totals.uptimePct).toBeLessThan(100);
  });

  it("manages optional objectives and surfaces attainment on the uptime report", async () => {
    const created = await post("/objectives", { key: "web-slo", name: "Web availability", label: "SLO", scopeType: "project", projectKey: "web", targetPct: 99.9, windowDays: 30 });
    expect(created.status).toBe(201);
    const list = await (await get("/objectives")).json();
    expect(list.objectives).toHaveLength(1);
    expect(list.objectives[0].scopeProjectKey).toBe("web");

    const report = await (await get("/incidents/uptime?window=30")).json();
    expect(report.objectives).toHaveLength(1);
    expect(report.objectives[0].key).toBe("web-slo");
    expect(report.objectives[0]).toHaveProperty("errorBudgetRemainingPct");

    expect((await patch("/objectives/web-slo", { targetPct: 99.5 })).status).toBe(200);
    expect((await del("/objectives/web-slo")).status).toBe(200);
    expect((await (await get("/objectives")).json()).objectives).toHaveLength(0);
  });
});
