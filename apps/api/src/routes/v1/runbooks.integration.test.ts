import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Runbooks end-to-end: define a runbook (steps + covered services + severity
 * trigger), declare an incident and confirm the matching runbook's steps
 * materialize onto the incident's checklist, toggle an item, and confirm severity
 * gating (a below-threshold incident doesn't attach). Seeds an isolated org.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("runbooks + incident checklist", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (p: string, body?: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "POST", headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  const put = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PUT", headers: auth, body: JSON.stringify(body) });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Acme", slug, plan: "pro" });
    await db.insert(authTables.users).values({ id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` });
    await db.insert(authTables.members).values({ id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" });
    await db.insert(authTables.accessTokens).values({ id: randomUUID(), type: "personal", name: "owner pat", tokenHash: hashToken(ownerToken), prefix: "flagon_pat", lastFour: ownerToken.slice(-4), userId: ownerId });
    await withOrg(orgId, (tx) => tx.insert(schema.projects).values({ organizationId: orgId, key: "web", name: "Web" }));
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(schema.incidents).where(eq(schema.incidents.organizationId, orgId));
      await tx.delete(schema.runbooks).where(eq(schema.runbooks.organizationId, orgId));
      await tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
    });
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
  });

  it("creates a runbook with steps + covered services", async () => {
    expect((await post("/runbooks", { key: "db-outage", name: "DB outage", triggerSeverity: "sev2" })).status).toBe(201);
    expect((await put("/runbooks/db-outage/steps", { steps: [
      { title: "Check replica lag", body: "Run `SELECT * FROM pg_stat_replication`", kind: "task" },
      { title: "Grafana dashboard", kind: "link", url: "https://grafana.example.com/db" },
    ] })).status).toBe(200);
    const svc = await put("/runbooks/db-outage/services", { projectKeys: ["web"] });
    expect(svc.status).toBe(200);
    const detail = await svc.json();
    expect(detail.runbook.stepCount).toBe(2);
    expect(detail.runbook.services.map((s: { key: string }) => s.key)).toContain("web");
  });

  it("materializes the runbook onto a matching incident's checklist", async () => {
    // sev1 on web: matches by service AND by severity threshold (sev2 covers sev1).
    const declared = await post("/incidents", { title: "DB down", severity: "sev1", affectedProjectKeys: ["web"] });
    expect(declared.status).toBe(201);
    const body = await declared.json();
    expect(body.checklist).toHaveLength(2);
    expect(body.checklist[0].runbookName).toBe("DB outage");
    expect(body.checklist.map((i: { title: string }) => i.title)).toContain("Grafana dashboard");

    // toggle the first item done
    const id = body.checklist[0].id;
    expect((await post(`/incidents/${body.incident.number}/checklist/${id}/toggle`)).status).toBe(200);
    const after = await (await get(`/incidents/${body.incident.number}`)).json();
    expect(after.checklist.find((i: { id: string }) => i.id === id).done).toBe(true);
  });

  it("does NOT attach a runbook below its severity threshold with no service match", async () => {
    // sev4, no affected services -> the sev2-trigger runbook must not attach.
    const declared = await post("/incidents", { title: "Minor blip", severity: "sev4" });
    const body = await declared.json();
    expect(body.checklist).toHaveLength(0);
  });
});
