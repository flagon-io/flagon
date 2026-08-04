import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * RCCA end-to-end: the org template (standard default + customization), writing an
 * incident's RCCA values, tracked corrective actions, the required-severity flag,
 * and the incident-by-project filter. Seeds an isolated org.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("RCCA + incident-by-project", () => {
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
  const patch = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PATCH", headers: auth, body: JSON.stringify(body) });
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
      await tx.delete(schema.rccaTemplates).where(eq(schema.rccaTemplates.organizationId, orgId));
      await tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
    });
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
  });

  it("serves a standard RCCA template by default and lets the org customize it", async () => {
    const def = await (await get("/rcca-template")).json();
    expect(def.requiredSeverities).toEqual(["sev1", "sev2"]);
    expect(def.fields.map((f: { key: string }) => f.key)).toContain("root_cause");

    const res = await put("/rcca-template", { requiredSeverities: ["sev1"], fields: [{ key: "summary", label: "Summary", required: true }, { key: "five_whys", label: "Five whys" }] });
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t.requiredSeverities).toEqual(["sev1"]);
    expect(t.fields.map((f: { key: string }) => f.key)).toEqual(["summary", "five_whys"]);
  });

  it("writes an incident's RCCA and tracks corrective actions", async () => {
    const declared = await post("/incidents", { title: "Outage", severity: "sev1", affectedProjectKeys: ["web"] });
    const body = await declared.json();
    const n = body.incident.number;
    expect(body.rccaRequired).toBe(true); // sev1 is in requiredSeverities
    expect(body.rccaTemplate.fields.map((f: { key: string }) => f.key)).toEqual(["summary", "five_whys"]);

    expect((await put(`/incidents/${n}/rcca`, { values: { summary: "DB failover was slow", five_whys: "..." } })).status).toBe(200);
    let detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.rcca.values.summary).toBe("DB failover was slow");

    // corrective action lifecycle
    expect((await post(`/incidents/${n}/action-items`, { title: "Add failover alarm" })).status).toBe(201);
    detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.actionItems).toHaveLength(1);
    const itemId = detail.actionItems[0].id;
    expect((await patch(`/incidents/${n}/action-items/${itemId}`, { status: "done" })).status).toBe(200);
    detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.actionItems[0].status).toBe("done");
  });

  it("filters incidents by affected service", async () => {
    const affecting = await (await get("/incidents?project=web")).json();
    expect(affecting.length).toBeGreaterThanOrEqual(1);
    const none = await (await get("/incidents?project=does-not-exist")).json();
    expect(none).toEqual([]);
  });

  it("freezes the template snapshot per incident, so template edits never corrupt a past RCCA", async () => {
    const keys = (t: { fields: { key: string }[] }) => t.fields.map((f) => f.key);

    // A known template, declare against it, and write a value.
    await put("/rcca-template", { requiredSeverities: ["sev1"], fields: [{ key: "root_cause", label: "Root cause", required: true }, { key: "impact", label: "Impact" }] });
    const declared = await (await post("/incidents", { title: "Frozen", severity: "sev1", affectedProjectKeys: ["web"] })).json();
    const n = declared.incident.number;
    expect(keys(declared.rccaTemplate)).toEqual(["root_cause", "impact"]);
    expect(declared.rccaRequired).toBe(true);
    expect((await put(`/incidents/${n}/rcca`, { values: { root_cause: "cache stampede", impact: "checkout 5xx" } })).status).toBe(200);

    // Radically change the org template AFTER the incident was declared.
    await put("/rcca-template", { requiredSeverities: ["sev2"], fields: [{ key: "timeline", label: "Timeline" }] });

    // The past incident keeps its frozen fields, values, and required flag.
    const detail = await (await get(`/incidents/${n}`)).json();
    expect(keys(detail.rccaTemplate)).toEqual(["root_cause", "impact"]);
    expect(detail.rcca.values.root_cause).toBe("cache stampede");
    expect(detail.rccaRequired).toBe(true); // snapshot required sev1; the live template no longer does

    // Only NEW incidents pick up the changed template.
    const next = await (await post("/incidents", { title: "After change", severity: "sev2", affectedProjectKeys: ["web"] })).json();
    expect(keys(next.rccaTemplate)).toEqual(["timeline"]);
  });
});
