import { Hono } from "hono";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import {
  oncallSchedules,
  oncallScheduleMembers,
  oncallOverrides,
  oncallEscalationPolicies,
  oncallEscalationLevels,
  incidents,
  teams,
} from "../../db/schema.js";
import { users } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager, nonMembers } from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { resolveOnCall } from "../../oncall/schedule.js";

/**
 * On-call — rotations (team-bound or standalone), one-off overrides, and
 * escalation policies. Mounted at /v1/orgs/:org/oncall. Any member reads; owner/
 * admin writes. All under withOrg() (RLS).
 */
export const oncall_ = new Hono();
oncall_.use("*", authContext);

const TAG = "On-call";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_TYPES = ["schedule", "team", "user"] as const;

const scheduleCreate = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  teamKey: z.string().trim().min(1).max(100).optional(),
  rotationIntervalHours: z.number().int().min(1).max(8760).default(168),
  anchorAt: z.string().datetime().optional(),
});
const scheduleUpdate = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    teamKey: z.string().trim().min(1).max(100).nullable().optional(),
    rotationIntervalHours: z.number().int().min(1).max(8760).optional(),
    anchorAt: z.string().datetime().optional(),
  })
  .strict();
const membersBody = z.object({ userIds: z.array(z.string().uuid()).max(100) });
const overrideBody = z.object({
  userId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
const policyCreate = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  repeatCount: z.number().int().min(0).max(10).default(0),
});
const policyUpdate = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    repeatCount: z.number().int().min(0).max(10).optional(),
  })
  .strict();
const levelsBody = z.object({
  levels: z
    .array(
      z.object({
        targetType: z.enum(TARGET_TYPES),
        targetRef: z.string().trim().min(1).max(100),
        delayMinutes: z.number().int().min(0).max(1440).default(0),
      }),
    )
    .max(20),
});

// --- OpenAPI component schemas ---------------------------------------------
const scheduleSchema = z.object({
  key: z.string(),
  name: z.string(),
  team: z.object({ key: z.string(), name: z.string() }).nullable(),
  rotationIntervalHours: z.number(),
  anchorAt: z.string(),
  memberCount: z.number(),
});
const currentSchema = z.object({ current: z.string().nullable(), next: z.string().nullable(), until: z.string().nullable() });
registerComponentSchema("OncallSchedule", scheduleSchema);
registerComponentSchema("OncallScheduleListResponse", z.array(scheduleSchema));
registerComponentSchema(
  "OncallScheduleResponse",
  z.object({
    schedule: scheduleSchema,
    members: z.array(z.object({ userId: z.string(), name: z.string(), email: z.string(), position: z.number() })),
    overrides: z.array(z.object({ id: z.string(), userId: z.string(), startsAt: z.string(), endsAt: z.string() })),
    current: currentSchema,
  }),
);
registerComponentSchema("OncallCurrentResponse", currentSchema);
const policySchema = z.object({ key: z.string(), name: z.string(), repeatCount: z.number() });
const levelSchema = z.object({
  position: z.number(),
  targetType: z.string(),
  // `targetKey` round-trips into the PUT levels body (schedule/team key, or the
  // user id for a user target); `targetLabel` is a display name.
  targetKey: z.string(),
  targetLabel: z.string(),
  delayMinutes: z.number(),
});
registerComponentSchema("OncallEscalationPolicy", policySchema);
registerComponentSchema("OncallEscalationPolicyListResponse", z.array(policySchema));
registerComponentSchema("OncallEscalationPolicyResponse", z.object({ policy: policySchema, levels: z.array(levelSchema) }));

// --- OpenAPI routes ---------------------------------------------------------
const p = { org: "The organization slug." };
const sk = { ...p, key: "The schedule key." };
const pk = { ...p, key: "The escalation policy key." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/oncall/schedules", summary: "List on-call schedules", tags: [TAG], auth: true, paramDescriptions: p, responses: { 200: { description: "Schedules.", schemaName: "OncallScheduleListResponse" } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/oncall/schedules", summary: "Create an on-call schedule", description: "Create a rotation, team-bound (teamKey) or standalone. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: p, request: { body: scheduleCreate }, responses: { 201: { description: "Created.", schemaName: "OncallScheduleResponse" }, 400: { description: "Invalid key or unknown team." }, 409: { description: "Key taken." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/oncall/schedules/{key}", summary: "Get an on-call schedule", description: "The schedule with members, overrides, and who's on-call now/next.", tags: [TAG], auth: true, paramDescriptions: sk, responses: { 200: { description: "The schedule.", schemaName: "OncallScheduleResponse" }, 404: { description: "No such schedule." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/oncall/schedules/{key}", summary: "Update an on-call schedule", tags: [TAG], auth: true, paramDescriptions: sk, request: { body: scheduleUpdate }, responses: { 200: { description: "Updated.", schemaName: "OncallScheduleResponse" }, 404: { description: "No such schedule." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/oncall/schedules/{key}", summary: "Delete an on-call schedule", tags: [TAG], auth: true, paramDescriptions: sk, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such schedule." } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/oncall/schedules/{key}/members", summary: "Set schedule members", description: "Replace the ordered rotation participants (any users). Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: sk, request: { body: membersBody }, responses: { 200: { description: "Set.", schemaName: "DeleteAck" }, 404: { description: "No such schedule." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/oncall/schedules/{key}/overrides", summary: "Add an override", description: "A user covers the schedule for a window (wins over the rotation). Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: sk, request: { body: overrideBody }, responses: { 201: { description: "Added.", schemaName: "DeleteAck" }, 404: { description: "No such schedule." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/oncall/schedules/{key}/overrides/{id}", summary: "Remove an override", tags: [TAG], auth: true, paramDescriptions: { ...sk, id: "The override id." }, responses: { 200: { description: "Removed.", schemaName: "DeleteAck" }, 404: { description: "No such override." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/oncall/schedules/{key}/current", summary: "Who's on-call", description: "The current and next responder for a schedule.", tags: [TAG], auth: true, paramDescriptions: sk, responses: { 200: { description: "Current on-call.", schemaName: "OncallCurrentResponse" }, 404: { description: "No such schedule." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/oncall/escalation-policies", summary: "List escalation policies", tags: [TAG], auth: true, paramDescriptions: p, responses: { 200: { description: "Policies.", schemaName: "OncallEscalationPolicyListResponse" } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/oncall/escalation-policies", summary: "Create an escalation policy", tags: [TAG], auth: true, paramDescriptions: p, request: { body: policyCreate }, responses: { 201: { description: "Created.", schemaName: "OncallEscalationPolicyResponse" }, 409: { description: "Key taken." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/oncall/escalation-policies/{key}", summary: "Get an escalation policy", tags: [TAG], auth: true, paramDescriptions: pk, responses: { 200: { description: "The policy with its levels.", schemaName: "OncallEscalationPolicyResponse" }, 404: { description: "No such policy." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/oncall/escalation-policies/{key}", summary: "Rename an escalation policy", tags: [TAG], auth: true, paramDescriptions: pk, request: { body: policyUpdate }, responses: { 200: { description: "Updated.", schemaName: "OncallEscalationPolicyResponse" }, 404: { description: "No such policy." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/oncall/escalation-policies/{key}", summary: "Delete an escalation policy", tags: [TAG], auth: true, paramDescriptions: pk, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such policy." } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/oncall/escalation-policies/{key}/levels", summary: "Set escalation levels", description: "Replace the ordered levels (target = schedule/team key or user id, delayMinutes). Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: pk, request: { body: levelsBody }, responses: { 200: { description: "Set.", schemaName: "OncallEscalationPolicyResponse" }, 400: { description: "Unknown target." }, 404: { description: "No such policy." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/oncall/teams/{team}/current", summary: "A team's current on-call", tags: [TAG], auth: true, paramDescriptions: { ...p, team: "The team key." }, responses: { 200: { description: "Current on-call.", schemaName: "OncallCurrentResponse" }, 404: { description: "No schedule for that team." } } });

// --- helpers ----------------------------------------------------------------
async function scheduleByKey(tx: TenantTx, key: string) {
  return tx.select().from(oncallSchedules).where(eq(oncallSchedules.key, key)).limit(1).then((r) => r[0] ?? null);
}
async function policyByKey(tx: TenantTx, key: string) {
  return tx.select().from(oncallEscalationPolicies).where(eq(oncallEscalationPolicies.key, key)).limit(1).then((r) => r[0] ?? null);
}
async function teamRef(tx: TenantTx, teamId: string | null) {
  if (!teamId) return null;
  return tx.select({ key: teams.key, name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1).then((r) => r[0] ?? null);
}
async function loadRotation(tx: TenantTx, scheduleId: string) {
  const members = await tx.select({ userId: oncallScheduleMembers.userId, position: oncallScheduleMembers.position }).from(oncallScheduleMembers).where(eq(oncallScheduleMembers.scheduleId, scheduleId)).orderBy(oncallScheduleMembers.position);
  const overrides = await tx.select({ id: oncallOverrides.id, userId: oncallOverrides.userId, startsAt: oncallOverrides.startsAt, endsAt: oncallOverrides.endsAt }).from(oncallOverrides).where(eq(oncallOverrides.scheduleId, scheduleId)).orderBy(desc(oncallOverrides.createdAt));
  return { members, overrides };
}
type ScheduleRow = typeof oncallSchedules.$inferSelect;
async function scheduleDetail(tx: TenantTx, sched: ScheduleRow) {
  const { members, overrides } = await loadRotation(tx, sched.id);
  const memberIds = members.map((m) => m.userId);
  const identRows = memberIds.length
    ? await tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, memberIds))
    : [];
  const identBy = new Map(identRows.map((r) => [r.id, r]));
  const now = new Date();
  const resolution = resolveOnCall({ rotationIntervalHours: sched.rotationIntervalHours, anchorAt: sched.anchorAt }, members, overrides, now);
  const team = await teamRef(tx, sched.teamId);
  return {
    schedule: { key: sched.key, name: sched.name, team, rotationIntervalHours: sched.rotationIntervalHours, anchorAt: sched.anchorAt.toISOString(), memberCount: members.length },
    members: members.map((m) => ({ userId: m.userId, name: identBy.get(m.userId)?.name ?? "", email: identBy.get(m.userId)?.email ?? "", position: m.position })),
    overrides: overrides.map((o) => ({ id: o.id, userId: o.userId, startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() })),
    current: { current: resolution.current, next: resolution.next, until: resolution.until?.toISOString() ?? null },
  };
}

// --- Schedules --------------------------------------------------------------
oncall_.get("/schedules", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json(
    await withOrg(ctx.orgId, async (tx) => {
      const rows = await tx.select().from(oncallSchedules).orderBy(desc(oncallSchedules.createdAt));
      const out = [];
      for (const s of rows) {
        const team = await teamRef(tx, s.teamId);
        const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(oncallScheduleMembers).where(eq(oncallScheduleMembers.scheduleId, s.id));
        out.push({ key: s.key, name: s.name, team, rotationIntervalHours: s.rotationIntervalHours, anchorAt: s.anchorAt.toISOString(), memberCount: Number(n) });
      }
      return out;
    }),
  );
});

oncall_.post("/schedules", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = scheduleCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { key, name, teamKey, rotationIntervalHours, anchorAt } = parsed.data;
  if (!isValidSlug(key)) return jsonError(c, 400, "Choose a different schedule key (letters, numbers, dashes).");

  const result = await withOrg(ctx.orgId, async (tx) => {
    if (await scheduleByKey(tx, key)) return "conflict" as const;
    let teamId: string | null = null;
    if (teamKey) {
      const t = await tx.select({ id: teams.id }).from(teams).where(eq(teams.key, teamKey)).limit(1).then((r) => r[0]);
      if (!t) return "unknown_team" as const;
      teamId = t.id;
    }
    const [sched] = await tx.insert(oncallSchedules).values({ organizationId: ctx.orgId, key, name, teamId, rotationIntervalHours, anchorAt: anchorAt ? new Date(anchorAt) : new Date() }).returning();
    return { detail: await scheduleDetail(tx, sched) };
  });
  if (result === "conflict") return jsonError(c, 409, `A schedule named "${key}" already exists.`);
  if (result === "unknown_team") return jsonError(c, 400, "That team does not exist.");
  return c.json(result.detail, 201);
});

oncall_.get("/schedules/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return null;
    return scheduleDetail(tx, sched);
  });
  if (!result) return jsonError(c, 404, "Schedule not found.");
  return c.json(result);
});

oncall_.patch("/schedules/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = scheduleUpdate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { teamKey, anchorAt, ...rest } = parsed.data;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return "not_found" as const;
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (anchorAt !== undefined) set.anchorAt = new Date(anchorAt);
    if (teamKey !== undefined) {
      if (teamKey === null) set.teamId = null;
      else {
        const t = await tx.select({ id: teams.id }).from(teams).where(eq(teams.key, teamKey)).limit(1).then((r) => r[0]);
        if (!t) return "unknown_team" as const;
        set.teamId = t.id;
      }
    }
    const [row] = await tx.update(oncallSchedules).set(set).where(eq(oncallSchedules.id, sched.id)).returning();
    return { detail: await scheduleDetail(tx, row) };
  });
  if (result === "not_found") return jsonError(c, 404, "Schedule not found.");
  if (result === "unknown_team") return jsonError(c, 400, "That team does not exist.");
  return c.json(result.detail);
});

oncall_.delete("/schedules/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return "not_found" as const;
    // A schedule is a polymorphic escalation target (no FK). Refuse to delete one
    // that a policy still points at, or the level would dangle and page nobody.
    const [ref] = await tx
      .select({ id: oncallEscalationLevels.id })
      .from(oncallEscalationLevels)
      .where(and(eq(oncallEscalationLevels.targetType, "schedule"), eq(oncallEscalationLevels.targetId, sched.id)))
      .limit(1);
    if (ref) return "in_use" as const;
    await tx.delete(oncallSchedules).where(eq(oncallSchedules.id, sched.id));
    return "ok" as const;
  });
  if (result === "not_found") return jsonError(c, 404, "Schedule not found.");
  if (result === "in_use") return jsonError(c, 409, "This schedule is an escalation target. Remove it from the policy's levels first.");
  return c.json({ ok: true });
});

oncall_.put("/schedules/:key/members", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = membersBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const bad = await nonMembers(ctx.orgId, parsed.data.userIds);
  if (bad.length) return jsonError(c, 400, "Every rotation member must be a member of this organization.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return false;
    await tx.delete(oncallScheduleMembers).where(eq(oncallScheduleMembers.scheduleId, sched.id));
    const seen = new Set<string>();
    let position = 0;
    for (const userId of parsed.data.userIds) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      await tx.insert(oncallScheduleMembers).values({ organizationId: ctx.orgId, scheduleId: sched.id, userId, position: position++ });
    }
    return true;
  });
  if (!ok) return jsonError(c, 404, "Schedule not found.");
  return c.json({ ok: true });
});

oncall_.post("/schedules/:key/overrides", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = overrideBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  if (new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) return jsonError(c, 422, "The override must end after it starts.");
  if ((await nonMembers(ctx.orgId, [parsed.data.userId])).length) return jsonError(c, 400, "The override user must be a member of this organization.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return false;
    await tx.insert(oncallOverrides).values({ organizationId: ctx.orgId, scheduleId: sched.id, userId: parsed.data.userId, startsAt: new Date(parsed.data.startsAt), endsAt: new Date(parsed.data.endsAt), createdByUserId: ctx.actorUserId });
    return true;
  });
  if (!ok) return jsonError(c, 404, "Schedule not found.");
  return c.json({ ok: true }, 201);
});

oncall_.delete("/schedules/:key/overrides/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return jsonError(c, 404, "Override not found.");
  const result = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return "not_found" as const;
    const [row] = await tx.delete(oncallOverrides).where(and(eq(oncallOverrides.id, id), eq(oncallOverrides.scheduleId, sched.id))).returning({ id: oncallOverrides.id });
    return row ? ("ok" as const) : ("not_found" as const);
  });
  if (result === "not_found") return jsonError(c, 404, "Override not found.");
  return c.json({ ok: true });
});

oncall_.get("/schedules/:key/current", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const sched = await scheduleByKey(tx, c.req.param("key"));
    if (!sched) return null;
    const { members, overrides } = await loadRotation(tx, sched.id);
    return resolveOnCall({ rotationIntervalHours: sched.rotationIntervalHours, anchorAt: sched.anchorAt }, members, overrides, new Date());
  });
  if (!result) return jsonError(c, 404, "Schedule not found.");
  return c.json({ current: result.current, next: result.next, until: result.until?.toISOString() ?? null });
});

oncall_.get("/teams/:team/current", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const t = await tx.select({ id: teams.id }).from(teams).where(eq(teams.key, c.req.param("team"))).limit(1).then((r) => r[0]);
    if (!t) return null;
    const [sched] = await tx.select().from(oncallSchedules).where(eq(oncallSchedules.teamId, t.id)).limit(1);
    if (!sched) return { current: null, next: null, until: null };
    const { members, overrides } = await loadRotation(tx, sched.id);
    const r = resolveOnCall({ rotationIntervalHours: sched.rotationIntervalHours, anchorAt: sched.anchorAt }, members, overrides, new Date());
    return { current: r.current, next: r.next, until: r.until?.toISOString() ?? null };
  });
  if (!result) return jsonError(c, 404, "No schedule for that team.");
  return c.json(result);
});

// --- Escalation policies ----------------------------------------------------
type PolicyRow = typeof oncallEscalationPolicies.$inferSelect;
async function policyDetail(tx: TenantTx, policy: PolicyRow) {
  const policyId = policy.id;
  const rows = await tx.select({ position: oncallEscalationLevels.position, targetType: oncallEscalationLevels.targetType, targetId: oncallEscalationLevels.targetId, delayMinutes: oncallEscalationLevels.delayMinutes }).from(oncallEscalationLevels).where(eq(oncallEscalationLevels.policyId, policyId)).orderBy(oncallEscalationLevels.position);
  const levels = [];
  for (const r of rows) {
    // Resolve the stored uuid target back to a key + label the console can render
    // and re-submit (user target: the key IS the user id).
    let targetKey = r.targetId;
    let targetLabel = "";
    if (r.targetType === "schedule") {
      const s = await tx.select({ key: oncallSchedules.key, name: oncallSchedules.name }).from(oncallSchedules).where(eq(oncallSchedules.id, r.targetId)).limit(1).then((x) => x[0]);
      if (s) { targetKey = s.key; targetLabel = s.name; }
    } else if (r.targetType === "team") {
      const t = await tx.select({ key: teams.key, name: teams.name }).from(teams).where(eq(teams.id, r.targetId)).limit(1).then((x) => x[0]);
      if (t) { targetKey = t.key; targetLabel = t.name; }
    } else {
      const u = await tx.select({ name: users.name }).from(users).where(eq(users.id, r.targetId)).limit(1).then((x) => x[0]);
      targetLabel = u?.name ?? "";
    }
    levels.push({ position: r.position, targetType: r.targetType, targetKey, targetLabel, delayMinutes: r.delayMinutes });
  }
  return { policy: { key: policy.key, name: policy.name, repeatCount: policy.repeatCount }, levels };
}

oncall_.get("/escalation-policies", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json(
    await withOrg(ctx.orgId, (tx) => tx.select({ key: oncallEscalationPolicies.key, name: oncallEscalationPolicies.name }).from(oncallEscalationPolicies).orderBy(oncallEscalationPolicies.name)),
  );
});

oncall_.post("/escalation-policies", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = policyCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  if (!isValidSlug(parsed.data.key)) return jsonError(c, 400, "Choose a different policy key (letters, numbers, dashes).");
  const result = await withOrg(ctx.orgId, async (tx) => {
    if (await policyByKey(tx, parsed.data.key)) return "conflict" as const;
    const [pol] = await tx.insert(oncallEscalationPolicies).values({ organizationId: ctx.orgId, key: parsed.data.key, name: parsed.data.name, repeatCount: parsed.data.repeatCount }).returning();
    return { detail: await policyDetail(tx, pol) };
  });
  if (result === "conflict") return jsonError(c, 409, "A policy with that key already exists.");
  return c.json(result.detail, 201);
});

oncall_.get("/escalation-policies/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const pol = await policyByKey(tx, c.req.param("key"));
    if (!pol) return null;
    return policyDetail(tx, pol);
  });
  if (!result) return jsonError(c, 404, "Policy not found.");
  return c.json(result);
});

oncall_.patch("/escalation-policies/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = policyUpdate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const pol = await policyByKey(tx, c.req.param("key"));
    if (!pol) return null;
    const [row] = await tx.update(oncallEscalationPolicies).set({ ...parsed.data, updatedAt: new Date() }).where(eq(oncallEscalationPolicies.id, pol.id)).returning();
    return policyDetail(tx, row);
  });
  if (!result) return jsonError(c, 404, "Policy not found.");
  return c.json(result);
});

oncall_.delete("/escalation-policies/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const pol = await policyByKey(tx, c.req.param("key"));
    if (!pol) return "not_found" as const;
    // Deleting a policy an open incident uses would SET NULL its escalationPolicyId
    // and silently drop it out of the escalation sweep. Refuse while it's in use.
    const [inUse] = await tx
      .select({ id: incidents.id })
      .from(incidents)
      .where(and(eq(incidents.escalationPolicyId, pol.id), ne(incidents.status, "resolved")))
      .limit(1);
    if (inUse) return "in_use" as const;
    await tx.delete(oncallEscalationPolicies).where(eq(oncallEscalationPolicies.id, pol.id));
    return "ok" as const;
  });
  if (result === "not_found") return jsonError(c, 404, "Policy not found.");
  if (result === "in_use") return jsonError(c, 409, "This policy is in use by an open incident. Resolve or reassign it first.");
  return c.json({ ok: true });
});

oncall_.put("/escalation-policies/:key/levels", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = levelsBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  // A user escalation target must be an org member (same identity/paging leak as a
  // rotation member). Validate before touching the DB; malformed uuids fall through
  // to the in-tx "unknown_target" check.
  const userRefs = parsed.data.levels.filter((l) => l.targetType === "user" && UUID_RE.test(l.targetRef)).map((l) => l.targetRef);
  if ((await nonMembers(ctx.orgId, userRefs)).length) return jsonError(c, 400, "A user escalation target must be a member of this organization.");
  const result = await withOrg(ctx.orgId, async (tx) => {
    const pol = await policyByKey(tx, c.req.param("key"));
    if (!pol) return "not_found" as const;
    // Resolve each target ref to a uuid target_id.
    const resolved: { targetType: string; targetId: string; delayMinutes: number }[] = [];
    for (const lvl of parsed.data.levels) {
      let targetId: string | null = null;
      if (lvl.targetType === "user") {
        if (!UUID_RE.test(lvl.targetRef)) return "unknown_target" as const;
        targetId = lvl.targetRef;
      } else if (lvl.targetType === "schedule") {
        const s = await scheduleByKey(tx, lvl.targetRef);
        if (!s) return "unknown_target" as const;
        targetId = s.id;
      } else {
        const t = await tx.select({ id: teams.id }).from(teams).where(eq(teams.key, lvl.targetRef)).limit(1).then((r) => r[0]);
        if (!t) return "unknown_target" as const;
        targetId = t.id;
      }
      resolved.push({ targetType: lvl.targetType, targetId, delayMinutes: lvl.delayMinutes });
    }
    await tx.delete(oncallEscalationLevels).where(eq(oncallEscalationLevels.policyId, pol.id));
    let position = 0;
    for (const r of resolved) {
      await tx.insert(oncallEscalationLevels).values({ organizationId: ctx.orgId, policyId: pol.id, position: position++, targetType: r.targetType, targetId: r.targetId, delayMinutes: r.delayMinutes });
    }
    return { detail: await policyDetail(tx, pol) };
  });
  if (result === "not_found") return jsonError(c, 404, "Policy not found.");
  if (result === "unknown_target") return jsonError(c, 400, "An escalation target does not exist.");
  return c.json(result.detail);
});
