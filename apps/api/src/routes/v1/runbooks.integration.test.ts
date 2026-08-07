import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Runbooks end-to-end against the incident.io-style attachment model: a runbook
 * auto-attaches to matching incidents (empty conditions = every incident), unless
 * it's manual-only; attachment is re-checked as the incident escalates; and the
 * attached steps execute by their own conditions. Seeds an isolated org.
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
  const patch = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PATCH", headers: auth, body: JSON.stringify(body) });
  const put = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PUT", headers: auth, body: JSON.stringify(body) });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  const item = (checklist: Array<{ title: string }>, title: string) =>
    checklist.find((i) => i.title === title) as {
      id: string; title: string; state: string; skippedReason: string | null; done: boolean;
    };

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
      await tx.delete(schema.orgIntegrations).where(eq(schema.orgIntegrations.organizationId, orgId));
      await tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
    });
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
  });

  it("auto-attaches a severity-matched runbook, and skips a non-matching incident", async () => {
    // A runbook scoped to SEV1 incidents.
    expect((await post("/runbooks", { key: "db-outage", name: "DB outage", attachConditions: [{ type: "severity", values: ["sev1"] }] })).status).toBe(201);
    expect((await put("/runbooks/db-outage/steps", { steps: [
      { title: "Check replica lag", body: "Run `SELECT * FROM pg_stat_replication`" },
      { title: "Grafana dashboard", kind: "link", url: "https://grafana.example.com/db" },
    ] })).status).toBe(200);
    const detail = await (await get("/runbooks/db-outage")).json();
    expect(detail.runbook.stepCount).toBe(2);
    expect(detail.runbook.manualOnly).toBe(false);
    expect(detail.runbook.attachConditions).toEqual([{ type: "severity", values: ["sev1"] }]);

    // sev1 -> attaches.
    const sev1 = await (await post("/incidents", { title: "DB down", severity: "sev1" })).json();
    expect(sev1.checklist.map((i: { title: string }) => i.title)).toContain("Check replica lag");
    const id = item(sev1.checklist, "Check replica lag").id;
    expect((await post(`/incidents/${sev1.incident.number}/checklist/${id}/toggle`)).status).toBe(200);

    // sev4 -> does NOT attach (no other runbook matches either).
    const sev4 = await (await post("/incidents", { title: "Minor blip", severity: "sev4" })).json();
    expect(sev4.checklist).toHaveLength(0);
  });

  it("skips an integration step when its provider isn't connected, activates it when it is", async () => {
    // Manual-only so it never auto-attaches; we attach it explicitly.
    await post("/runbooks", { key: "chat-flow", name: "Chat flow", manualOnly: true });
    await put("/runbooks/chat-flow/steps", { steps: [{ title: "Ping Slack", provider: "slack", action: "chat-notify" }] });

    const inc1 = await (await post("/incidents", { title: "No slack yet", severity: "sev3" })).json();
    expect((await post(`/incidents/${inc1.incident.number}/runbooks`, { runbookKey: "chat-flow" })).status).toBe(201);
    const c1 = await (await get(`/incidents/${inc1.incident.number}`)).json();
    expect(item(c1.checklist, "Ping Slack").state).toBe("skipped");
    expect(item(c1.checklist, "Ping Slack").skippedReason).toMatch(/slack/i);

    await withOrg(orgId, (tx) => tx.insert(schema.orgIntegrations).values({ organizationId: orgId, provider: "slack", secretCiphertext: "x" }));
    const inc2 = await (await post("/incidents", { title: "Slack connected", severity: "sev3" })).json();
    await post(`/incidents/${inc2.incident.number}/runbooks`, { runbookKey: "chat-flow" });
    const c2 = await (await get(`/incidents/${inc2.incident.number}`)).json();
    expect(item(c2.checklist, "Ping Slack").state).toBe("active");
  });

  it("fires status-gated steps on transition, starts the retro, and honors previous_step", async () => {
    await post("/runbooks", { key: "retro-flow", name: "Retro flow", manualOnly: true });
    await put("/runbooks/retro-flow/steps", { steps: [
      { title: "Investigate", provider: "core", action: "task" },
      { title: "Start retro", provider: "core", action: "start-retro", conditions: [{ type: "milestone", values: ["resolved"] }] },
      { title: "Post to Discord", provider: "discord", action: "chat-notify", conditions: [{ type: "milestone", values: ["resolved"] }] },
      { title: "Wrap up", provider: "core", action: "task", conditions: [{ type: "previous_step" }] },
    ] });

    const inc = await (await post("/incidents", { title: "Retro please", severity: "sev3" })).json();
    const num = inc.incident.number;
    await post(`/incidents/${num}/runbooks`, { runbookKey: "retro-flow" });

    const before = await (await get(`/incidents/${num}`)).json();
    expect(item(before.checklist, "Investigate").state).toBe("active");
    expect(item(before.checklist, "Start retro").state).toBe("pending");
    expect(item(before.checklist, "Post to Discord").state).toBe("pending");
    expect((await post(`/incidents/${num}/checklist/${item(before.checklist, "Start retro").id}/toggle`)).status).toBe(409);

    expect((await post(`/incidents/${num}/resolve`)).status).toBe(200);
    const after = await (await get(`/incidents/${num}`)).json();
    expect(item(after.checklist, "Start retro").state).toBe("active");
    expect(item(after.checklist, "Post to Discord").state).toBe("skipped");
    expect(item(after.checklist, "Wrap up").state).toBe("active");

    const incRow = await withOrg(orgId, (tx) =>
      tx.select({ id: schema.incidents.id }).from(schema.incidents).where(eq(schema.incidents.number, num)).limit(1),
    );
    const rcca = await withOrg(orgId, (tx) =>
      tx.select({ startedAt: schema.incidentRccas.startedAt }).from(schema.incidentRccas).where(eq(schema.incidentRccas.incidentId, incRow[0].id)).limit(1),
    );
    expect(rcca[0].startedAt).not.toBeNull();
  });

  // Runs LAST: an always-attach (empty conditions) runbook auto-attaches to EVERY
  // incident from here on, so it must not precede the isolation-sensitive tests above.
  it("attaches an always-on runbook to every incident, and a conditional one dynamically on escalation", async () => {
    await post("/runbooks", { key: "always-on", name: "Always on", attachConditions: [] });
    await put("/runbooks/always-on/steps", { steps: [{ title: "Always step", provider: "core", action: "task" }] });

    // Declared at sev3: the always-on runbook lands; the SEV1 db-outage runbook doesn't.
    const inc = await (await post("/incidents", { title: "Escalating", severity: "sev3" })).json();
    const num = inc.incident.number;
    expect(inc.checklist.map((i: { title: string }) => i.title)).toContain("Always step");
    expect(inc.checklist.map((i: { title: string }) => i.title)).not.toContain("Check replica lag");

    // Escalate to sev1: the SEV1 runbook attaches dynamically.
    expect((await patch(`/incidents/${num}`, { severity: "sev1" })).status).toBe(200);
    const after = await (await get(`/incidents/${num}`)).json();
    expect(after.checklist.map((i: { title: string }) => i.title)).toContain("Always step");
    expect(after.checklist.map((i: { title: string }) => i.title)).toContain("Check replica lag");
  });
});
