import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { reliabilityObjectives, projects } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Reliability OBJECTIVES — an org's OPTIONAL SLO/SLA targets. Fully opt-in: an org that
 * defines none simply sees measured uptime with no target framing. Each objective is a
 * target uptime % over a rolling window, scoped org-wide or to one project, labelled
 * however the org frames it ("SLO", "SLA", ...). Mounted at /v1/orgs/:org/objectives.
 * Any member reads; owner/admin writes. Attainment + error budget are computed by the
 * uptime endpoint (see incidents/objectives.ts), not stored here.
 */
export const objectives_ = new Hono();
objectives_.use("*", authContext);

const TAG = "Incidents";

const scope = z.enum(["org", "project"]);
const createBody = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9_-]+$/i, "letters, numbers, dashes, underscores").min(1).max(60),
    name: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(20).default("SLO"),
    scopeType: scope.default("org"),
    projectKey: z.string().trim().min(1).max(100).nullish(),
    targetPct: z.number().min(0).max(100),
    windowDays: z.number().int().min(1).max(365).default(30),
    enabled: z.boolean().default(true),
  })
  .strict();
const patchBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(20).optional(),
    scopeType: scope.optional(),
    projectKey: z.string().trim().min(1).max(100).nullish(),
    targetPct: z.number().min(0).max(100).optional(),
    windowDays: z.number().int().min(1).max(365).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const objectiveSchema = z.object({
  key: z.string(),
  name: z.string(),
  label: z.string(),
  scopeType: z.string(),
  scopeProjectKey: z.string().nullable(),
  targetPct: z.number(),
  windowDays: z.number(),
  enabled: z.boolean(),
});
registerComponentSchema("ReliabilityObjective", objectiveSchema);
registerComponentSchema("ReliabilityObjectives", z.object({ objectives: z.array(objectiveSchema) }));

const p = { org: "The organization slug." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/objectives", summary: "List reliability objectives", description: "The org's SLO/SLA objectives (empty if none defined).", tags: [TAG], auth: true, paramDescriptions: p, responses: { 200: { description: "The objectives.", schemaName: "ReliabilityObjectives" } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/objectives", summary: "Create a reliability objective", description: "Define an SLO or SLA: a target uptime % over a rolling window, org-wide or scoped to one project. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: p, request: { body: createBody }, responses: { 201: { description: "Created.", schemaName: "ReliabilityObjective" }, 400: { description: "Invalid scope." }, 409: { description: "Key already exists." }, 422: { description: "Validation failed." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/objectives/{key}", summary: "Update a reliability objective", description: "Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: { ...p, key: "The objective key." }, request: { body: patchBody }, responses: { 200: { description: "Updated.", schemaName: "ReliabilityObjective" }, 400: { description: "Invalid scope." }, 404: { description: "Not found." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/objectives/{key}", summary: "Delete a reliability objective", description: "Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: { ...p, key: "The objective key." }, responses: { 200: { description: "Deleted." }, 404: { description: "Not found." } } });

type ObjectiveRow = typeof reliabilityObjectives.$inferSelect;
function serialize(o: ObjectiveRow, scopeProjectKey: string | null) {
  return { key: o.key, name: o.name, label: o.label, scopeType: o.scopeType, scopeProjectKey, targetPct: o.targetPct, windowDays: o.windowDays, enabled: o.enabled };
}

objectives_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx
      .select({ o: reliabilityObjectives, projectKey: projects.key })
      .from(reliabilityObjectives)
      .leftJoin(projects, eq(projects.id, reliabilityObjectives.scopeProjectId))
      .where(eq(reliabilityObjectives.organizationId, ctx.orgId))
      .orderBy(reliabilityObjectives.name),
  );
  return c.json({ objectives: rows.map((r) => serialize(r.o, r.projectKey)) });
});

objectives_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const b = parsed.data;

  const result = await withOrg(ctx.orgId, async (tx) => {
    let scopeProjectId: string | null = null;
    let scopeProjectKey: string | null = null;
    if (b.scopeType === "project") {
      if (!b.projectKey) return "project_required" as const;
      const proj = await tx.select({ id: projects.id, key: projects.key }).from(projects).where(eq(projects.key, b.projectKey)).limit(1).then((r) => r[0]);
      if (!proj) return "unknown_project" as const;
      scopeProjectId = proj.id;
      scopeProjectKey = proj.key;
    }
    const exists = await tx.select({ id: reliabilityObjectives.id }).from(reliabilityObjectives).where(and(eq(reliabilityObjectives.organizationId, ctx.orgId), eq(reliabilityObjectives.key, b.key))).limit(1).then((r) => r[0]);
    if (exists) return "conflict" as const;
    const [row] = await tx
      .insert(reliabilityObjectives)
      .values({ organizationId: ctx.orgId, key: b.key, name: b.name, label: b.label, scopeType: b.scopeType, scopeProjectId, targetPct: b.targetPct, windowDays: b.windowDays, enabled: b.enabled, createdByUserId: ctx.actorUserId })
      .returning();
    return { row, scopeProjectKey };
  });
  if (result === "project_required") return jsonError(c, 400, "A project-scoped objective needs a projectKey.");
  if (result === "unknown_project") return jsonError(c, 400, "That project does not exist.");
  if (result === "conflict") return jsonError(c, 409, "An objective with that key already exists.");
  return c.json(serialize(result.row, result.scopeProjectKey), 201);
});

objectives_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key");
  const parsed = patchBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const b = parsed.data;

  const result = await withOrg(ctx.orgId, async (tx) => {
    const existing = await tx.select().from(reliabilityObjectives).where(and(eq(reliabilityObjectives.organizationId, ctx.orgId), eq(reliabilityObjectives.key, key))).limit(1).then((r) => r[0]);
    if (!existing) return "not_found" as const;
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (b.name !== undefined) set.name = b.name;
    if (b.label !== undefined) set.label = b.label;
    if (b.targetPct !== undefined) set.targetPct = b.targetPct;
    if (b.windowDays !== undefined) set.windowDays = b.windowDays;
    if (b.enabled !== undefined) set.enabled = b.enabled;

    // Scope changes: resolve the effective (type, project) from the patch on top of the
    // current row, then re-validate so we never end up project-scoped without a project.
    const nextScopeType = b.scopeType ?? existing.scopeType;
    let scopeProjectId = existing.scopeProjectId;
    if (b.scopeType !== undefined || b.projectKey !== undefined) {
      if (nextScopeType === "org") {
        scopeProjectId = null;
      } else {
        const wantKey = b.projectKey ?? undefined;
        if (wantKey) {
          const proj = await tx.select({ id: projects.id }).from(projects).where(eq(projects.key, wantKey)).limit(1).then((r) => r[0]);
          if (!proj) return "unknown_project" as const;
          scopeProjectId = proj.id;
        }
        if (!scopeProjectId) return "project_required" as const;
      }
      set.scopeType = nextScopeType;
      set.scopeProjectId = scopeProjectId;
    }
    const [row] = await tx.update(reliabilityObjectives).set(set).where(eq(reliabilityObjectives.id, existing.id)).returning();
    const projectKey = row.scopeProjectId
      ? (await tx.select({ key: projects.key }).from(projects).where(eq(projects.id, row.scopeProjectId)).limit(1).then((r) => r[0]?.key ?? null))
      : null;
    return { row, projectKey };
  });
  if (result === "not_found") return jsonError(c, 404, "Objective not found.");
  if (result === "project_required") return jsonError(c, 400, "A project-scoped objective needs a projectKey.");
  if (result === "unknown_project") return jsonError(c, 400, "That project does not exist.");
  return c.json(serialize(result.row, result.projectKey));
});

objectives_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key");
  const deleted = await withOrg(ctx.orgId, async (tx) => {
    const rows = await tx.delete(reliabilityObjectives).where(and(eq(reliabilityObjectives.organizationId, ctx.orgId), eq(reliabilityObjectives.key, key))).returning({ id: reliabilityObjectives.id });
    return rows.length > 0;
  });
  if (!deleted) return jsonError(c, 404, "Objective not found.");
  return c.json({ ok: true });
});
