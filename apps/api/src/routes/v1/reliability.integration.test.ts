import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Reliability (Incidents + On-call) end-to-end over the real Hono app: on-call
 * schedules + current resolution, escalation policies, declaring an incident with
 * catalog blast radius + auto owner, the timeline / ack / resolve lifecycle, and
 * the escalation sweep advancing an unacked incident (and stopping on ack).
 *
 * Runs only with a migrated DB reachable. Seeds an isolated random org.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("reliability: incidents + on-call", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];
  let sweepEscalations: typeof import("../../incidents/escalate-sweep.js")["sweepEscalations"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const u1 = randomUUID();
  const u2 = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const put = (p: string, body: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PUT", headers: auth, body: JSON.stringify(body) });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));
    ({ sweepEscalations } = await import("../../incidents/escalate-sweep.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Acme", slug, plan: "pro" });
    await db.insert(authTables.users).values([
      { id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` },
      { id: u1, name: "Ana", email: `ana-${orgId}@example.com` },
      { id: u2, name: "Ben", email: `ben-${orgId}@example.com` },
    ]);
    await db.insert(authTables.members).values([
      { id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" },
      { id: randomUUID(), organizationId: orgId, userId: u1, role: "member" },
      { id: randomUUID(), organizationId: orgId, userId: u2, role: "member" },
    ]);
    await db.insert(authTables.accessTokens).values({ id: randomUUID(), type: "personal", name: "owner pat", tokenHash: hashToken(ownerToken), prefix: "flagon_pat", lastFour: ownerToken.slice(-4), userId: ownerId });

    // A team owning a project, with members (for team escalation targets).
    const teamId = randomUUID();
    await withOrg(orgId, async (tx) => {
      await tx.insert(schema.teams).values({ id: teamId, organizationId: orgId, key: "sre", name: "SRE" });
      await tx.insert(schema.teamMembers).values([
        { id: randomUUID(), organizationId: orgId, teamId, userId: u1, role: "maintainer" },
        { id: randomUUID(), organizationId: orgId, teamId, userId: u2, role: "member" },
      ]);
      await tx.insert(schema.projects).values({ organizationId: orgId, key: "web", name: "Web", ownerTeamId: teamId });
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(schema.incidents).where(eq(schema.incidents.organizationId, orgId));
      await tx.delete(schema.oncallEscalationPolicies).where(eq(schema.oncallEscalationPolicies.organizationId, orgId));
      await tx.delete(schema.oncallSchedules).where(eq(schema.oncallSchedules.organizationId, orgId));
      await tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
      await tx.delete(schema.teams).where(eq(schema.teams.organizationId, orgId));
    });
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await db.delete(authTables.users).where(eq(authTables.users.id, u1));
    await db.delete(authTables.users).where(eq(authTables.users.id, u2));
  });

  it("creates an on-call schedule and resolves who's on now", async () => {
    const created = await post("/oncall/schedules", { key: "primary", name: "Primary", teamKey: "sre", rotationIntervalHours: 168 });
    expect(created.status).toBe(201);
    expect((await put("/oncall/schedules/primary/members", { userIds: [u1, u2] })).status).toBe(200);
    const cur = await (await get("/oncall/schedules/primary/current")).json();
    expect(cur.current).toBe(u1); // first member at the fresh anchor
    const teamCur = await (await get("/oncall/teams/sre/current")).json();
    expect(teamCur.current).toBe(u1);
  });

  it("creates an escalation policy with ordered levels", async () => {
    expect((await post("/oncall/escalation-policies", { key: "sev1", name: "Sev1" })).status).toBe(201);
    const res = await put("/oncall/escalation-policies/sev1/levels", {
      levels: [
        { targetType: "schedule", targetRef: "primary", delayMinutes: 5 },
        { targetType: "user", targetRef: u2, delayMinutes: 0 },
      ],
    });
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.levels).toHaveLength(2);
    expect(detail.levels[0].targetType).toBe("schedule");
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

    // acknowledge + resolve
    expect((await post(`/incidents/${n}/acknowledge`, {})).status).toBe(200);
    detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.acknowledgedAt).not.toBeNull();
    expect((await post(`/incidents/${n}/resolve`, {})).status).toBe(200);
    detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.status).toBe("resolved");
    expect(detail.incident.resolvedAt).not.toBeNull();
  });

  it("escalates an unacked incident through its policy, and stops on ack", async () => {
    const declared = await post("/incidents", { title: "DB latency", severity: "sev2", affectedProjectKeys: ["web"], escalationPolicyKey: "sev1" });
    const n = (await declared.json()).incident.number;

    // Backdate the declare time so cumulative delays have elapsed (level 0 = 5 min).
    await withOrg(orgId, (tx) =>
      tx.update(schema.incidents).set({ startedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(schema.incidents.number, n)),
    );
    const sweep = await sweepEscalations();
    expect(sweep.paged).toBeGreaterThanOrEqual(1);
    let detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.escalatedLevel).toBe(1); // climbed to level 1

    // acknowledge -> a further sweep does not escalate again
    await post(`/incidents/${n}/acknowledge`, {});
    await sweepEscalations();
    detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.escalatedLevel).toBe(1);
  });

  it("rejects a non-member from on-call rotations, overrides, and user escalation targets", async () => {
    const stranger = randomUUID(); // a valid uuid that is NOT a member of this org
    expect((await put("/oncall/schedules/primary/members", { userIds: [u1, stranger] })).status).toBe(400);
    expect(
      (
        await post("/oncall/schedules/primary/overrides", {
          userId: stranger,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
      ).status,
    ).toBe(400);
    expect(
      (await put("/oncall/escalation-policies/sev1/levels", { levels: [{ targetType: "user", targetRef: stranger, delayMinutes: 0 }] })).status,
    ).toBe(400);
    // The real member still works (the levels were left intact by the rejected write).
    expect((await put("/oncall/schedules/primary/members", { userIds: [u1, u2] })).status).toBe(200);
  });

  it("guards destructive deletes: an in-use schedule target and an in-use policy return 409", async () => {
    const del = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { method: "DELETE", headers: auth });
    // "primary" is a level target of the sev1 policy (set earlier) -> can't delete it.
    expect((await del("/oncall/schedules/primary")).status).toBe(409);
    // An open incident using sev1 -> the policy can't be deleted out from under it.
    const declared = await post("/incidents", { title: "Guarded", severity: "sev3", escalationPolicyKey: "sev1" });
    expect(declared.status).toBe(201);
    expect((await del("/oncall/escalation-policies/sev1")).status).toBe(409);
    await post(`/incidents/${(await declared.json()).incident.number}/resolve`, {});
  });

  it("declare and the sweep fall back to the owner team when an escalation level resolves to nobody", async () => {
    await post("/oncall/schedules", { key: "ghost", name: "Ghost", rotationIntervalHours: 168 }); // no members
    await post("/oncall/escalation-policies", { key: "fb", name: "FB" });
    // level 0 = the empty schedule (declare pages it -> nobody -> owner-team fallback),
    // level 1 = a real user so the sweep also has a step to climb.
    await put("/oncall/escalation-policies/fb/levels", {
      levels: [
        { targetType: "schedule", targetRef: "ghost", delayMinutes: 5 },
        { targetType: "user", targetRef: u2, delayMinutes: 5 },
      ],
    });
    const declared = await post("/incidents", { title: "Ghost page", severity: "sev2", affectedProjectKeys: ["web"], escalationPolicyKey: "fb" });
    const body = await declared.json();
    // Declare's level-0 target (empty schedule) fell back to the owner team's on-call.
    expect(body.responderUserId).toBe(u1);
    const n = body.incident.number;

    await withOrg(orgId, (tx) =>
      tx.update(schema.incidents).set({ startedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(schema.incidents.number, n)),
    );
    const sweep = await sweepEscalations();
    expect(sweep.paged).toBeGreaterThanOrEqual(1); // the sweep advanced past the level, did not stall
    const detail = await (await get(`/incidents/${n}`)).json();
    expect(detail.incident.escalatedLevel).toBe(1);
    await post(`/incidents/${n}/resolve`, {});
  });
});
