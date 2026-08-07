import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import {
  incidents,
  incidentServices,
  incidentUpdates,
  incidentChecklistItems,
  incidentRccas,
  incidentActionItems,
  runbooks,
  projects,
  teams,
  type RccaSnapshot,
} from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager, nonMembers } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { attachRunbook, attachMatchingRunbooks, ensureDefaultRunbook } from "../../incidents/runbook-attach.js";
import { afterStatusChange, evaluateChecklist } from "../../incidents/checklist-eval.js";
import { ensureRccaTemplate } from "../../incidents/rcca-template.js";
import { getSeverityLevels, defaultKey } from "../../incidents/severity-levels.js";
import { computeDowntime } from "../../incidents/downtime.js";
import { attainmentForObjectives } from "../../incidents/objectives.js";

/**
 * Incidents — a declared reliability event affecting one or more catalog projects.
 * Mounted at /v1/orgs/:org/incidents. Any member reads; declaring, editing metadata,
 * and changing affected services is owner/admin; the operational actions (post an
 * update, acknowledge, resolve) are open to any member (a responder acting).
 * Everything runs inside withOrg() so RLS enforces tenancy.
 */
export const incidents_ = new Hono();
incidents_.use("*", authContext);

const TAG = "Incidents";
// The incident lifecycle (FireHydrant-style milestones). "resolved" ends impact;
// "retrospective" is the post-incident review phase (the RCCA is worked here, though
// it's editable throughout); "closed" is the terminal, filed state. Anything at or
// past "resolved" keeps `resolvedAt` set — see `resolvedAtFor`.
const STATUSES = [
  "open",
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "retrospective",
  "closed",
] as const;
const RESOLVED_OR_AFTER = new Set<string>(["resolved", "retrospective", "closed"]);

/**
 * The `resolvedAt` a status transition implies: stamped when first reaching resolved
 * (or any later milestone), preserved once set while at/after resolved, and cleared
 * only when an incident is REOPENED to a pre-resolution status.
 */
function resolvedAtFor(newStatus: string, current: Date | null): Date | null {
  if (RESOLVED_OR_AFTER.has(newStatus)) return current ?? new Date();
  return null;
}

// Severity is a free-form key validated per-org against the incident_severity_levels
// ladder (see incidents/severity-levels.ts), not a fixed enum: an org may name its
// levels P0..P4, sev1..sev4, etc. Omitted on declare = the org's default level.
const declareBody = z.object({
  title: z.string().trim().min(1).max(200),
  severity: z.string().trim().min(1).max(40).optional(),
  summary: z.string().trim().max(2000).optional(),
  affectedProjectKeys: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  ownerTeamKey: z.string().trim().min(1).max(100).optional(),
});
const updateBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    severity: z.string().trim().min(1).max(40).optional(),
    summary: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(STATUSES).optional(),
    ownerTeamKey: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();
const addUpdateBody = z.object({
  body: z.string().trim().min(1).max(5000),
  status: z.enum(STATUSES).optional(),
});
const addServiceBody = z.object({ projectKey: z.string().trim().min(1).max(100) });

const ownerTeamSchema = z.object({ key: z.string(), name: z.string() }).nullable();
const incidentSchema = z.object({
  number: z.number(),
  title: z.string(),
  summary: z.string().nullable(),
  severity: z.string(),
  status: z.string(),
  ownerTeam: ownerTeamSchema,
  startedAt: z.string(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
const serviceSchema = z.object({ key: z.string(), name: z.string() });
const updateSchema = z.object({
  id: z.string(),
  body: z.string(),
  status: z.string().nullable(),
  createdAt: z.string(),
});
const checklistItemSchema = z.object({
  id: z.string(),
  runbookName: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  kind: z.string(),
  url: z.string().nullable(),
  provider: z.string().describe("Step-catalog provider ('core' for native steps)."),
  action: z.string().describe("Step-catalog action key."),
  conditions: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Execution conditions evaluated against the live incident."),
  state: z.enum(["pending", "active", "skipped"]).describe("Execution lifecycle state."),
  skippedReason: z.string().nullable(),
  done: z.boolean(),
});
registerComponentSchema("Incident", incidentSchema);
registerComponentSchema("IncidentListResponse", z.array(incidentSchema));
const rccaFieldSchema = z.object({ key: z.string(), label: z.string(), description: z.string().optional(), required: z.boolean().optional() });
const actionItemSchema = z.object({ id: z.string(), title: z.string(), description: z.string().nullable(), assigneeUserId: z.string().nullable(), status: z.string() });
registerComponentSchema(
  "IncidentResponse",
  z.object({
    incident: incidentSchema,
    services: z.array(serviceSchema),
    updates: z.array(updateSchema),
    checklist: z.array(checklistItemSchema),
    // RCCA: the org template fields + this incident's values + tracked actions.
    rccaRequired: z.boolean(),
    rccaTemplate: z.object({ requiredSeverities: z.array(z.string()), fields: z.array(rccaFieldSchema) }),
    rcca: z.object({ values: z.record(z.string(), z.string()) }),
    actionItems: z.array(actionItemSchema),
  }),
);

const CHECKLIST_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function checklistFor(tx: TenantTx, incidentId: string) {
  const rows = await tx
    .select({ id: incidentChecklistItems.id, runbookName: incidentChecklistItems.runbookName, title: incidentChecklistItems.title, body: incidentChecklistItems.body, kind: incidentChecklistItems.kind, url: incidentChecklistItems.url, provider: incidentChecklistItems.provider, action: incidentChecklistItems.action, conditions: incidentChecklistItems.conditions, state: incidentChecklistItems.state, skippedReason: incidentChecklistItems.skippedReason, done: incidentChecklistItems.done })
    .from(incidentChecklistItems)
    .where(eq(incidentChecklistItems.incidentId, incidentId))
    .orderBy(incidentChecklistItems.position);
  return rows;
}

/** A point-in-time copy of the org template, frozen onto an incident at declare. */
async function snapshotTemplate(tx: TenantTx, orgId: string): Promise<RccaSnapshot> {
  const t = await ensureRccaTemplate(tx, orgId);
  return { requiredSeverities: t.requiredSeverities, fields: t.fields };
}

/**
 * The RCCA block for an incident detail. The template is the SNAPSHOT frozen onto
 * this incident (so a later org-template edit never rewrites it); rows created
 * before the snapshot column fall back to the live template.
 */
async function rccaBlockFor(tx: TenantTx, orgId: string, incidentId: string, severity: string) {
  const rcca = await tx.select({ template: incidentRccas.template, values: incidentRccas.values }).from(incidentRccas).where(eq(incidentRccas.incidentId, incidentId)).limit(1).then((r) => r[0]);
  const template = rcca?.template ?? (await snapshotTemplate(tx, orgId));
  const actionItems = await tx
    .select({ id: incidentActionItems.id, title: incidentActionItems.title, description: incidentActionItems.description, assigneeUserId: incidentActionItems.assigneeUserId, status: incidentActionItems.status })
    .from(incidentActionItems)
    .where(eq(incidentActionItems.incidentId, incidentId))
    .orderBy(incidentActionItems.createdAt);
  return {
    rccaRequired: template.requiredSeverities.includes(severity),
    rccaTemplate: template,
    rcca: { values: rcca?.values ?? {} },
    actionItems,
  };
}

type IncidentRow = typeof incidents.$inferSelect;
function serialize(i: IncidentRow, ownerTeam: { key: string; name: string } | null) {
  return {
    number: i.number,
    title: i.title,
    summary: i.summary,
    severity: i.severity,
    status: i.status,
    ownerTeam,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

async function incidentByNumber(tx: TenantTx, number: number) {
  return tx.select().from(incidents).where(eq(incidents.number, number)).limit(1).then((r) => r[0] ?? null);
}
async function teamByKey(tx: TenantTx, key: string) {
  return tx.select({ id: teams.id, key: teams.key, name: teams.name }).from(teams).where(eq(teams.key, key)).limit(1).then((r) => r[0] ?? null);
}
async function ownerTeamFor(tx: TenantTx, teamId: string | null) {
  if (!teamId) return null;
  return tx.select({ key: teams.key, name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1).then((r) => r[0] ?? null);
}

// --- OpenAPI ----------------------------------------------------------------
const pParams = { org: "The organization slug." };
const nParams = { ...pParams, number: "The incident number." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/incidents", summary: "List incidents", description: "Every incident in the organization (filter with ?status=open|resolved). Visible to any member.", tags: [TAG], auth: true, paramDescriptions: pParams, responses: { 200: { description: "Incidents.", schemaName: "IncidentListResponse" } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/incidents/{number}", summary: "Get an incident", description: "One incident with its affected services, timeline, and runbook checklist.", tags: [TAG], auth: true, paramDescriptions: nParams, responses: { 200: { description: "The incident.", schemaName: "IncidentResponse" }, 404: { description: "No such incident." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents", summary: "Declare an incident", description: "Declare an incident and attach affected services. Owner auto-derives from the first affected service's team when not given. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: pParams, request: { body: declareBody }, responses: { 201: { description: "Declared.", schemaName: "IncidentResponse" }, 400: { description: "Unknown team or service." }, 422: { description: "Validation failed." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/incidents/{number}", summary: "Update an incident", description: "Edit an incident's metadata (title/severity/status/summary/owner). Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: nParams, request: { body: updateBody }, responses: { 200: { description: "Updated.", schemaName: "IncidentResponse" }, 404: { description: "No such incident." }, 422: { description: "Validation failed." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents/{number}/updates", summary: "Post an incident update", description: "Append an update to the timeline, optionally changing status. Any member.", tags: [TAG], auth: true, paramDescriptions: nParams, request: { body: addUpdateBody }, responses: { 201: { description: "Posted.", schemaName: "DeleteAck" }, 404: { description: "No such incident." }, 422: { description: "Validation failed." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents/{number}/resolve", summary: "Resolve an incident", description: "Mark the incident resolved. Any member.", tags: [TAG], auth: true, paramDescriptions: nParams, responses: { 200: { description: "Resolved.", schemaName: "DeleteAck" }, 404: { description: "No such incident." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents/{number}/services", summary: "Attach a service", description: "Add an affected service (project) to the incident. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: nParams, request: { body: addServiceBody }, responses: { 201: { description: "Attached.", schemaName: "DeleteAck" }, 400: { description: "Unknown service." }, 404: { description: "No such incident." }, 409: { description: "Already attached." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/incidents/{number}/services/{projectKey}", summary: "Detach a service", description: "Remove an affected service from the incident. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: { ...nParams, projectKey: "The project key." }, responses: { 200: { description: "Detached.", schemaName: "DeleteAck" }, 404: { description: "No such incident or service." } } });

function parseNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A Postgres unique-violation (23505) on the incident number index — the signal
 *  to retry number allocation. Checks the error and its cause; the driver surfaces
 *  the SQLSTATE as `.code`. */
function isNumberConflict(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return (
    e?.code === "23505" ||
    e?.cause?.code === "23505" ||
    (typeof e?.message === "string" && e.message.includes("incidents_org_number_key"))
  );
}

// --- List / get -------------------------------------------------------------
incidents_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const status = c.req.query("status");
  const projectKey = c.req.query("project");
  return c.json(
    await withOrg(ctx.orgId, async (tx) => {
      const conds = [];
      if (status === "open") conds.push(sql`${incidents.status} <> 'resolved'`);
      else if (status === "resolved") conds.push(eq(incidents.status, "resolved"));
      // Filter to incidents affecting a given catalog service.
      if (projectKey) {
        const p = await tx.select({ id: projects.id }).from(projects).where(eq(projects.key, projectKey)).limit(1).then((r) => r[0]);
        if (!p) return [];
        const svc = await tx.select({ incidentId: incidentServices.incidentId }).from(incidentServices).where(eq(incidentServices.projectId, p.id));
        const ids = svc.map((s) => s.incidentId);
        if (ids.length === 0) return [];
        conds.push(inArray(incidents.id, ids));
      }
      const where = conds.length ? and(...conds) : undefined;
      const rows = await tx
        .select({ incident: incidents, teamKey: teams.key, teamName: teams.name })
        .from(incidents)
        .leftJoin(teams, eq(teams.id, incidents.ownerTeamId))
        .where(where)
        .orderBy(desc(incidents.number));
      return rows.map((r) =>
        serialize(
          r.incident,
          r.teamKey && r.teamName ? { key: r.teamKey, name: r.teamName } : null,
        ),
      );
    }),
  );
});

// --- Uptime & weighted downtime (any member) -------------------------------
const projectUptimeSchema = z.object({ projectKey: z.string(), name: z.string(), uptimePct: z.number(), weightedDowntimeSeconds: z.number(), incidentCount: z.number() });
const objectiveAttainmentSchema = z.object({ key: z.string(), name: z.string(), label: z.string(), scopeType: z.string(), scopeProjectKey: z.string().nullable(), targetPct: z.number(), windowDays: z.number(), measuredUptimePct: z.number(), attained: z.boolean(), errorBudgetPct: z.number(), errorBudgetConsumedPct: z.number(), errorBudgetRemainingPct: z.number(), errorBudgetBurnedRatio: z.number() });
const uptimeReportSchema = z.object({ windowStart: z.string(), windowEnd: z.string(), windowSeconds: z.number(), totalServices: z.number(), perProject: z.array(projectUptimeSchema), totals: z.object({ uptimePct: z.number(), weightedDowntimeSeconds: z.number(), incidentCount: z.number() }), objectives: z.array(objectiveAttainmentSchema) });
registerComponentSchema("UptimeReport", uptimeReportSchema);
registerRoute({ method: "get", path: "/v1/orgs/{org}/incidents/uptime", summary: "Uptime & weighted downtime", description: "Per-project weighted uptime over a rolling window (severity `downtime_weight` weights each incident), plus attainment + error budget for any reliability objectives. Query params: `window` (days, default 30) and `project` (a project key to scope to).", tags: [TAG], auth: true, paramDescriptions: { org: "The organization slug." }, responses: { 200: { description: "The uptime report.", schemaName: "UptimeReport" } } });

incidents_.get("/uptime", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rawWindow = c.req.query("window");
  const parsedWindow = rawWindow ? parseInt(rawWindow.replace(/d$/i, ""), 10) : 30;
  const windowDays = Number.isFinite(parsedWindow) ? parsedWindow : 30;
  const projectKey = c.req.query("project") || undefined;
  const report = await withOrg(ctx.orgId, async (tx) => {
    const dt = await computeDowntime(tx, ctx.orgId, { windowDays, projectKey });
    const objectives = await attainmentForObjectives(tx, ctx.orgId);
    return { ...dt, objectives };
  });
  return c.json(report);
});

incidents_.get("/:number", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const result = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return null;
    const ownerTeam = await ownerTeamFor(tx, incident.ownerTeamId);
    const services = await tx
      .select({ key: projects.key, name: projects.name })
      .from(incidentServices)
      .innerJoin(projects, eq(projects.id, incidentServices.projectId))
      .where(eq(incidentServices.incidentId, incident.id))
      .orderBy(projects.name);
    const updates = await tx
      .select({ id: incidentUpdates.id, body: incidentUpdates.body, status: incidentUpdates.status, createdAt: incidentUpdates.createdAt })
      .from(incidentUpdates)
      .where(eq(incidentUpdates.incidentId, incident.id))
      .orderBy(desc(incidentUpdates.createdAt));
    return {
      incident: serialize(incident, ownerTeam),
      services,
      updates: updates.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
      checklist: await checklistFor(tx, incident.id),
      ...(await rccaBlockFor(tx, ctx.orgId, incident.id, incident.severity)),
    };
  });
  if (!result) return jsonError(c, 404, "Incident not found.");
  return c.json(result);
});

// --- Declare (manager) ------------------------------------------------------
incidents_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = declareBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { title, severity, summary, affectedProjectKeys, ownerTeamKey } = parsed.data;

  const declareOnce = () => withOrg(ctx.orgId, async (tx) => {
    // Resolve severity against the org's configured ladder; default when omitted.
    const levels = await getSeverityLevels(tx, ctx.orgId);
    const sev = severity ?? defaultKey(levels) ?? undefined;
    if (!sev || !levels.some((l) => l.key === sev)) return { error: "unknown_severity" } as const;
    // Resolve affected services first (so owner can auto-derive from the first).
    const serviceRows: { id: string }[] = [];
    for (const key of affectedProjectKeys ?? []) {
      const p = await tx.select({ id: projects.id }).from(projects).where(eq(projects.key, key)).limit(1).then((r) => r[0]);
      if (!p) return { error: `unknown_service:${key}` } as const;
      serviceRows.push(p);
    }
    let ownerTeamId: string | null = null;
    if (ownerTeamKey) {
      const team = await teamByKey(tx, ownerTeamKey);
      if (!team) return { error: "unknown_team" } as const;
      ownerTeamId = team.id;
    } else if (serviceRows.length > 0) {
      const [first] = await tx.select({ ownerTeamId: projects.ownerTeamId }).from(projects).where(eq(projects.id, serviceRows[0].id)).limit(1);
      ownerTeamId = first?.ownerTeamId ?? null;
    }
    const [{ max } = { max: 0 }] = await tx.select({ max: sql<number>`coalesce(max(${incidents.number}), 0)` }).from(incidents);
    const number = Number(max) + 1;

    const [incident] = await tx
      .insert(incidents)
      .values({ organizationId: ctx.orgId, number, title, severity: sev, summary: summary ?? null, ownerTeamId, declaredByUserId: ctx.actorUserId })
      .returning();
    for (const s of serviceRows) {
      await tx.insert(incidentServices).values({ organizationId: ctx.orgId, incidentId: incident.id, projectId: s.id });
    }
    // Attach the playbook: seed the org's Default runbook if it has none, then
    // attach every runbook whose conditions match this incident (empty = all).
    await ensureDefaultRunbook(tx, ctx.orgId);
    await attachMatchingRunbooks(tx, ctx.orgId, incident.id, incident.severity, incident.status);
    // Freeze the RCCA template onto this incident now, so a later template edit
    // never rewrites this incident's postmortem form.
    await tx.insert(incidentRccas).values({ organizationId: ctx.orgId, incidentId: incident.id, template: await snapshotTemplate(tx, ctx.orgId) }).onConflictDoNothing();
    return { incident } as const;
  });

  // `number` is allocated as max()+1 under a unique (org, number) index. Two truly
  // concurrent declares in the same org can pick the same number; the loser hits the
  // unique violation — retry (re-reading max) a few times instead of 500ing during
  // exactly the busy moment incidents get declared.
  let result: Awaited<ReturnType<typeof declareOnce>> | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      result = await declareOnce();
      break;
    } catch (err) {
      if (attempt < 3 && isNumberConflict(err)) continue;
      throw err;
    }
  }
  if (!result) return jsonError(c, 409, "Could not allocate an incident number, please retry.");

  if ("error" in result) {
    if (result.error === "unknown_team") return jsonError(c, 400, "That owning team does not exist.");
    if (result.error === "unknown_severity") return jsonError(c, 400, "That severity level does not exist.");
    return jsonError(c, 400, "One of the affected services does not exist.");
  }

  const detail = await withOrg(ctx.orgId, async (tx) => {
    const ownerTeam = await ownerTeamFor(tx, result.incident.ownerTeamId);
    const services = await tx.select({ key: projects.key, name: projects.name }).from(incidentServices).innerJoin(projects, eq(projects.id, incidentServices.projectId)).where(eq(incidentServices.incidentId, result.incident.id));
    return { incident: serialize(result.incident, ownerTeam), services, updates: [], checklist: await checklistFor(tx, result.incident.id), ...(await rccaBlockFor(tx, ctx.orgId, result.incident.id, result.incident.severity)) };
  });
  return c.json(detail, 201);
});

// --- Update metadata (manager) ---------------------------------------------
incidents_.patch("/:number", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { ownerTeamKey, ...rest } = parsed.data;

  const result = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return "not_found" as const;
    if (rest.severity !== undefined) {
      const levels = await getSeverityLevels(tx, ctx.orgId);
      if (!levels.some((l) => l.key === rest.severity)) return "unknown_severity" as const;
    }
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (rest.status) set.resolvedAt = resolvedAtFor(rest.status, incident.resolvedAt);
    if (ownerTeamKey !== undefined) {
      if (ownerTeamKey === null) set.ownerTeamId = null;
      else {
        const team = await teamByKey(tx, ownerTeamKey);
        if (!team) return "unknown_team" as const;
        set.ownerTeamId = team.id;
      }
    }
    const [row] = await tx.update(incidents).set(set).where(eq(incidents.id, incident.id)).returning();
    // A severity change can newly match a runbook (dynamic attach), so re-attach for
    // the fresh severity; a status change fires milestone-gated steps + starts the
    // retro. Both re-evaluate the checklist (idempotent).
    if (rest.severity && rest.severity !== incident.severity) {
      await attachMatchingRunbooks(tx, ctx.orgId, incident.id, row.severity, row.status);
    }
    if (rest.status && rest.status !== incident.status) {
      await afterStatusChange(tx, ctx.orgId, { incidentId: incident.id, severity: row.severity, status: row.status });
    }
    const ownerTeam = await ownerTeamFor(tx, row.ownerTeamId);
    return { incident: serialize(row, ownerTeam) };
  });
  if (result === "not_found") return jsonError(c, 404, "Incident not found.");
  if (result === "unknown_team") return jsonError(c, 400, "That owning team does not exist.");
  if (result === "unknown_severity") return jsonError(c, 400, "That severity level does not exist.");
  return c.json(result);
});

// --- Timeline update (any member) ------------------------------------------
incidents_.post("/:number/updates", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const parsed = addUpdateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    await tx.insert(incidentUpdates).values({ organizationId: ctx.orgId, incidentId: incident.id, body: parsed.data.body, status: parsed.data.status ?? null, createdByUserId: ctx.actorUserId });
    if (parsed.data.status && parsed.data.status !== incident.status) {
      await tx
        .update(incidents)
        .set({ status: parsed.data.status, resolvedAt: resolvedAtFor(parsed.data.status, incident.resolvedAt), updatedAt: new Date() })
        .where(eq(incidents.id, incident.id));
      await afterStatusChange(tx, ctx.orgId, { incidentId: incident.id, severity: incident.severity, status: parsed.data.status });
    }
    return true;
  });
  if (!ok) return jsonError(c, 404, "Incident not found.");
  return c.json({ ok: true }, 201);
});

// --- Resolve (any member) --------------------------------------------------
incidents_.post("/:number/resolve", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    await tx.update(incidents).set({ status: "resolved", resolvedAt: incident.resolvedAt ?? new Date(), updatedAt: new Date() }).where(eq(incidents.id, incident.id));
    if (incident.status !== "resolved") {
      await afterStatusChange(tx, ctx.orgId, { incidentId: incident.id, severity: incident.severity, status: "resolved" });
    }
    return true;
  });
  if (!ok) return jsonError(c, 404, "Incident not found.");
  return c.json({ ok: true });
});

// --- Affected services (manager) -------------------------------------------
incidents_.post("/:number/services", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const parsed = addServiceBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return "not_found" as const;
    const p = await tx.select({ id: projects.id }).from(projects).where(eq(projects.key, parsed.data.projectKey)).limit(1).then((r) => r[0]);
    if (!p) return "unknown_service" as const;
    const existing = await tx.select({ id: incidentServices.id }).from(incidentServices).where(and(eq(incidentServices.incidentId, incident.id), eq(incidentServices.projectId, p.id))).limit(1).then((r) => r[0]);
    if (existing) return "conflict" as const;
    await tx.insert(incidentServices).values({ organizationId: ctx.orgId, incidentId: incident.id, projectId: p.id });
    return "ok" as const;
  });
  if (result === "not_found") return jsonError(c, 404, "Incident not found.");
  if (result === "unknown_service") return jsonError(c, 400, "That service does not exist.");
  if (result === "conflict") return jsonError(c, 409, "That service is already attached.");
  return c.json({ ok: true }, 201);
});

incidents_.delete("/:number/services/:projectKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const result = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return "not_found" as const;
    const p = await tx.select({ id: projects.id }).from(projects).where(eq(projects.key, c.req.param("projectKey"))).limit(1).then((r) => r[0]);
    if (!p) return "not_found" as const;
    const [row] = await tx.delete(incidentServices).where(and(eq(incidentServices.incidentId, incident.id), eq(incidentServices.projectId, p.id))).returning({ id: incidentServices.id });
    return row ? ("ok" as const) : ("not_found" as const);
  });
  if (result === "not_found") return jsonError(c, 404, "That service is not attached to the incident.");
  return c.json({ ok: true });
});

// --- Runbook checklist ------------------------------------------------------
const attachRunbookBody = z.object({ runbookKey: z.string().trim().min(1).max(100) });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents/{number}/runbooks", summary: "Attach a runbook", description: "Materialize a runbook's steps onto the incident's checklist. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: nParams, request: { body: attachRunbookBody }, responses: { 201: { description: "Attached.", schemaName: "DeleteAck" }, 400: { description: "Unknown runbook." }, 404: { description: "No such incident." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents/{number}/checklist/{itemId}/toggle", summary: "Toggle a checklist item", description: "Mark a runbook checklist item done or not done. Any member.", tags: [TAG], auth: true, paramDescriptions: { ...nParams, itemId: "The checklist item id." }, responses: { 200: { description: "Toggled.", schemaName: "DeleteAck" }, 404: { description: "No such item." } } });

incidents_.post("/:number/runbooks", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const parsed = attachRunbookBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return "not_found" as const;
    const rb = await tx.select().from(runbooks).where(eq(runbooks.key, parsed.data.runbookKey)).limit(1).then((r) => r[0]);
    if (!rb) return "unknown_runbook" as const;
    await attachRunbook(tx, ctx.orgId, incident.id, rb);
    // Fire whatever is already eligible given the incident's current state.
    await evaluateChecklist(tx, ctx.orgId, { incidentId: incident.id, severity: incident.severity, status: incident.status });
    return "ok" as const;
  });
  if (result === "not_found") return jsonError(c, 404, "Incident not found.");
  if (result === "unknown_runbook") return jsonError(c, 400, "That runbook does not exist.");
  return c.json({ ok: true }, 201);
});

incidents_.post("/:number/checklist/:itemId/toggle", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  const itemId = c.req.param("itemId");
  if (number === null || !CHECKLIST_UUID_RE.test(itemId)) return jsonError(c, 404, "Checklist item not found.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    const item = await tx.select({ id: incidentChecklistItems.id, done: incidentChecklistItems.done, state: incidentChecklistItems.state }).from(incidentChecklistItems).where(and(eq(incidentChecklistItems.id, itemId), eq(incidentChecklistItems.incidentId, incident.id))).limit(1).then((r) => r[0]);
    if (!item) return false;
    // Only a live (active) step can be checked off — pending/skipped aren't actionable.
    if (item.state !== "active") return "not_actionable" as const;
    const done = !item.done;
    await tx.update(incidentChecklistItems).set({ done, doneByUserId: done ? ctx.actorUserId : null, doneAt: done ? new Date() : null }).where(eq(incidentChecklistItems.id, itemId));
    // Completing a step can satisfy a `previous_step` condition downstream.
    await evaluateChecklist(tx, ctx.orgId, { incidentId: incident.id, severity: incident.severity, status: incident.status });
    return true;
  });
  if (ok === "not_actionable") return jsonError(c, 409, "That step isn't active yet.");
  if (!ok) return jsonError(c, 404, "Checklist item not found.");
  return c.json({ ok: true });
});

// --- RCCA (root cause & corrective actions) ---------------------------------
const ACTION_STATUS = ["open", "in_progress", "done"] as const;
const rccaValuesBody = z.object({ values: z.record(z.string(), z.string().max(10000)) });
const addActionBody = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  assigneeUserId: z.string().uuid().optional(),
});
const patchActionBody = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    status: z.enum(ACTION_STATUS).optional(),
  })
  .strict();

registerRoute({ method: "put", path: "/v1/orgs/{org}/incidents/{number}/rcca", summary: "Write the RCCA", description: "Save the incident's RCCA field values (keyed to the org template). Any member.", tags: [TAG], auth: true, paramDescriptions: nParams, request: { body: rccaValuesBody }, responses: { 200: { description: "Saved.", schemaName: "DeleteAck" }, 404: { description: "No such incident." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/incidents/{number}/action-items", summary: "Add a corrective action", tags: [TAG], auth: true, paramDescriptions: nParams, request: { body: addActionBody }, responses: { 201: { description: "Added.", schemaName: "DeleteAck" }, 404: { description: "No such incident." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/incidents/{number}/action-items/{itemId}", summary: "Update a corrective action", tags: [TAG], auth: true, paramDescriptions: { ...nParams, itemId: "The action item id." }, request: { body: patchActionBody }, responses: { 200: { description: "Updated.", schemaName: "DeleteAck" }, 404: { description: "No such item." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/incidents/{number}/action-items/{itemId}", summary: "Delete a corrective action", tags: [TAG], auth: true, paramDescriptions: { ...nParams, itemId: "The action item id." }, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such item." } } });

incidents_.put("/:number/rcca", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const parsed = rccaValuesBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    const existing = await tx.select({ id: incidentRccas.id, template: incidentRccas.template }).from(incidentRccas).where(eq(incidentRccas.incidentId, incident.id)).limit(1).then((r) => r[0]);
    // Persist ONLY values keyed to the incident's frozen template fields — drop
    // unknown keys so the jsonb can't be inflated with arbitrary keys (the template
    // caps field count) and never renders junk.
    const template = existing?.template ?? (await snapshotTemplate(tx, ctx.orgId));
    const allowed = new Set(template.fields.map((f) => f.key));
    const values = Object.fromEntries(Object.entries(parsed.data.values).filter(([k]) => allowed.has(k)));
    if (existing) {
      await tx.update(incidentRccas).set({ values, updatedByUserId: ctx.actorUserId, updatedAt: new Date() }).where(eq(incidentRccas.id, existing.id));
    } else {
      // Legacy incident with no snapshot yet: freeze the current template as we save.
      await tx.insert(incidentRccas).values({ organizationId: ctx.orgId, incidentId: incident.id, template, values, updatedByUserId: ctx.actorUserId });
    }
    return true;
  });
  if (!ok) return jsonError(c, 404, "Incident not found.");
  return c.json({ ok: true });
});

incidents_.post("/:number/action-items", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  if (number === null) return jsonError(c, 404, "Incident not found.");
  const parsed = addActionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  if (parsed.data.assigneeUserId && (await nonMembers(ctx.orgId, [parsed.data.assigneeUserId])).length) return jsonError(c, 400, "The assignee must be a member of this organization.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    await tx.insert(incidentActionItems).values({ organizationId: ctx.orgId, incidentId: incident.id, title: parsed.data.title, description: parsed.data.description ?? null, assigneeUserId: parsed.data.assigneeUserId ?? null, createdByUserId: ctx.actorUserId });
    return true;
  });
  if (!ok) return jsonError(c, 404, "Incident not found.");
  return c.json({ ok: true }, 201);
});

incidents_.patch("/:number/action-items/:itemId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  const itemId = c.req.param("itemId");
  if (number === null || !CHECKLIST_UUID_RE.test(itemId)) return jsonError(c, 404, "Action item not found.");
  const parsed = patchActionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  if (parsed.data.assigneeUserId && (await nonMembers(ctx.orgId, [parsed.data.assigneeUserId])).length) return jsonError(c, 400, "The assignee must be a member of this organization.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    const [row] = await tx.update(incidentActionItems).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(incidentActionItems.id, itemId), eq(incidentActionItems.incidentId, incident.id))).returning({ id: incidentActionItems.id });
    return Boolean(row);
  });
  if (!ok) return jsonError(c, 404, "Action item not found.");
  return c.json({ ok: true });
});

incidents_.delete("/:number/action-items/:itemId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const number = parseNumber(c.req.param("number"));
  const itemId = c.req.param("itemId");
  if (number === null || !CHECKLIST_UUID_RE.test(itemId)) return jsonError(c, 404, "Action item not found.");
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const incident = await incidentByNumber(tx, number);
    if (!incident) return false;
    const [row] = await tx.delete(incidentActionItems).where(and(eq(incidentActionItems.id, itemId), eq(incidentActionItems.incidentId, incident.id))).returning({ id: incidentActionItems.id });
    return Boolean(row);
  });
  if (!ok) return jsonError(c, 404, "Action item not found.");
  return c.json({ ok: true });
});
