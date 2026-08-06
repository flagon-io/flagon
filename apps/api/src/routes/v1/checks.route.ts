import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { checks, checkResults, projects, type Check } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { isValidSlug } from "../../lib/slug.js";
import { probe } from "../../checks/probe.js";
import { applyProbeResult } from "../../checks/apply.js";

/**
 * Checks — synthetic monitors attached to a catalog project. Mounted at
 * /v1/orgs/:org/projects/:project/checks. Reading is org-wide; creating/editing/running
 * is owner/admin. Everything runs in withOrg() so RLS enforces tenancy. A check probes
 * on a schedule (the cron sweep) or on demand (run-now here); its state machine and
 * actions live in src/checks.
 */
export const checks_ = new Hono();
checks_.use("*", authContext);

const TAG = "Checks";
const TYPES = ["http", "keyword", "tls_expiry", "tcp", "heartbeat"] as const;
const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;

const targetSchema = z.object({
  url: z.string().url().max(2000).optional(),
  method: z.string().max(10).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(10000).optional(),
  followRedirects: z.boolean().optional(),
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});
const assertionsSchema = z.object({
  expectedStatusMin: z.number().int().min(100).max(599).optional(),
  expectedStatusMax: z.number().int().min(100).max(599).optional(),
  keyword: z.string().max(500).optional(),
  keywordAbsent: z.boolean().optional(),
  maxLatencyMs: z.number().int().positive().max(120000).optional(),
  tlsMinDaysRemaining: z.number().int().nonnegative().max(365).optional(),
  heartbeatGraceSeconds: z.number().int().nonnegative().max(86400).optional(),
});
const incidentActionSchema = z.object({
  severity: z.enum(SEVERITIES),
  escalationPolicyKey: z.string().max(100).nullable().optional(),
  ownerTeamKey: z.string().max(100).nullable().optional(),
  runbookKey: z.string().max(100).nullable().optional(),
  autoResolve: z.boolean().optional(),
});
const actionSchema = z.object({
  mode: z.enum(["track", "notify", "incident"]).optional(),
  channelKeys: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
  incident: incidentActionSchema.optional(),
});

const createBody = z.object({
  key: z.string().trim().min(1).max(48),
  name: z.string().trim().min(1).max(80),
  type: z.enum(TYPES),
  target: targetSchema.optional(),
  assertions: assertionsSchema.optional(),
  intervalSeconds: z.number().int().min(30).max(86400).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  failureThreshold: z.number().int().min(1).max(10).optional(),
  recoveryThreshold: z.number().int().min(1).max(10).optional(),
  action: actionSchema.optional(),
  enabled: z.boolean().optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    target: targetSchema.optional(),
    assertions: assertionsSchema.optional(),
    intervalSeconds: z.number().int().min(30).max(86400).optional(),
    timeoutMs: z.number().int().min(1000).max(60000).optional(),
    failureThreshold: z.number().int().min(1).max(10).optional(),
    recoveryThreshold: z.number().int().min(1).max(10).optional(),
    action: actionSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
const pauseBody = z.object({ paused: z.boolean() });

const checkSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  enabled: z.boolean(),
  paused: z.boolean(),
  intervalSeconds: z.number(),
  lastCheckedAt: z.string().nullable(),
  lastStatusChangedAt: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
  hasOpenIncident: z.boolean(),
});
registerComponentSchema("Check", checkSchema);
registerComponentSchema("CheckListResponse", z.array(checkSchema));

const pParams = { org: "The organization slug.", project: "The project key." };
const kParams = { ...pParams, checkKey: "The check key." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/projects/{project}/checks", summary: "List checks", description: "Synthetic monitors on a project, with current status.", tags: [TAG], auth: true, paramDescriptions: pParams, responses: { 200: { description: "Checks.", schemaName: "CheckListResponse" }, 404: { description: "No such project." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/projects/{project}/checks", summary: "Create a check", description: "Create a monitor. http/keyword need target.url; tcp needs host+port; tls_expiry needs a url or host. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: pParams, request: { body: createBody }, responses: { 201: { description: "Created.", schemaName: "Check" }, 400: { description: "Invalid key/target." }, 404: { description: "No such project." }, 409: { description: "Key taken." }, 422: { description: "Validation failed." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/projects/{project}/checks/{checkKey}", summary: "Get a check", description: "A check with uptime, latency, and recent results.", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "The check.", schemaName: "CheckDetailResponse" }, 404: { description: "No such check." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/projects/{project}/checks/{checkKey}", summary: "Update a check", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: updateBody }, responses: { 200: { description: "Updated.", schemaName: "Check" }, 404: { description: "No such check." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/projects/{project}/checks/{checkKey}", summary: "Delete a check", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such check." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/projects/{project}/checks/{checkKey}/pause", summary: "Pause or resume a check", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: pauseBody }, responses: { 200: { description: "Updated.", schemaName: "Check" }, 404: { description: "No such check." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/projects/{project}/checks/{checkKey}/run", summary: "Run a check now", description: "Probe the check immediately and record the result. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Probe result.", schemaName: "CheckRunResponse" }, 404: { description: "No such check." } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/projects/{project}/checks/{checkKey}/results", summary: "List a check's results", description: "The recent heartbeat log (most recent first).", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Results.", schemaName: "CheckResultListResponse" }, 404: { description: "No such check." } } });
registerComponentSchema("CheckDetailResponse", checkSchema.extend({ target: z.record(z.string(), z.unknown()), assertions: z.record(z.string(), z.unknown()), action: z.record(z.string(), z.unknown()), timeoutMs: z.number(), failureThreshold: z.number(), recoveryThreshold: z.number(), uptime24h: z.number().nullable(), uptime7d: z.number().nullable(), avgLatencyMs: z.number().nullable(), pingUrl: z.string().nullable(), recent: z.array(z.object({ ranAt: z.string(), ok: z.boolean(), statusCode: z.number().nullable(), responseMs: z.number().nullable(), error: z.string().nullable() })) }));
registerComponentSchema("CheckRunResponse", z.object({ ok: z.boolean(), statusCode: z.number().nullable(), responseMs: z.number().nullable(), error: z.string().nullable(), status: z.string() }));
registerComponentSchema("CheckResultListResponse", z.array(z.object({ ranAt: z.string(), ok: z.boolean(), statusCode: z.number().nullable(), responseMs: z.number().nullable(), error: z.string().nullable() })));

function serialize(ch: Check) {
  return {
    key: ch.key,
    name: ch.name,
    type: ch.type,
    status: ch.paused ? "paused" : ch.status,
    enabled: ch.enabled,
    paused: ch.paused,
    intervalSeconds: ch.intervalSeconds,
    lastCheckedAt: ch.lastCheckedAt?.toISOString() ?? null,
    lastStatusChangedAt: ch.lastStatusChangedAt?.toISOString() ?? null,
    lastLatencyMs: ch.lastLatencyMs,
    hasOpenIncident: Boolean(ch.activeIncidentId),
  };
}

async function projectByKey(tx: TenantTx, key: string) {
  return tx.select({ id: projects.id, key: projects.key }).from(projects).where(eq(projects.key, key)).limit(1).then((r) => r[0] ?? null);
}
async function checkByKey(tx: TenantTx, projectId: string, checkKey: string) {
  return tx.select().from(checks).where(and(eq(checks.projectId, projectId), eq(checks.key, checkKey))).limit(1).then((r) => r[0] ?? null);
}

/** Per-type target sanity, matched to what the probes require. */
function validateTarget(type: string, target: { url?: string; host?: string; port?: number }): string | null {
  if (type === "http" || type === "keyword") {
    if (!target.url) return "This check type needs a target url.";
  } else if (type === "tls_expiry") {
    if (!target.url && !target.host) return "A TLS check needs a url or a host.";
  } else if (type === "tcp") {
    if (!target.host || !target.port) return "A TCP check needs a host and a port.";
  }
  return null;
}

checks_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return null;
    const rows = await tx.select().from(checks).where(eq(checks.projectId, project.id)).orderBy(desc(checks.createdAt));
    return rows.map(serialize);
  });
  if (!result) return jsonError(c, 404, "Project not found.");
  return c.json(result);
});

checks_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { key, name, type } = parsed.data;
  if (!isValidSlug(key)) return jsonError(c, 400, "Choose a different check key (letters, numbers, dashes).");
  const target = parsed.data.target ?? {};
  const targetError = validateTarget(type, target);
  if (targetError) return jsonError(c, 400, targetError);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return "no_project" as const;
    if (await checkByKey(tx, project.id, key)) return "conflict" as const;
    const [row] = await tx
      .insert(checks)
      .values({
        organizationId: ctx.orgId,
        projectId: project.id,
        key,
        name,
        type,
        target,
        assertions: parsed.data.assertions ?? {},
        action: parsed.data.action ?? {},
        intervalSeconds: parsed.data.intervalSeconds,
        timeoutMs: parsed.data.timeoutMs,
        failureThreshold: parsed.data.failureThreshold,
        recoveryThreshold: parsed.data.recoveryThreshold,
        enabled: parsed.data.enabled ?? true,
        // Heartbeat checks get a secret token for their inbound ping URL.
        pingToken: type === "heartbeat" ? randomBytes(24).toString("hex") : undefined,
        createdByUserId: ctx.actorUserId,
      })
      .returning();
    return { row };
  });
  if (result === "no_project") return jsonError(c, 404, "Project not found.");
  if (result === "conflict") return jsonError(c, 409, "A check with that key already exists.");
  return c.json(serialize(result.row), 201);
});

checks_.get("/:checkKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return null;
    const ch = await checkByKey(tx, project.id, (c.req.param("checkKey") ?? ""));
    if (!ch) return null;
    const now = Date.now();
    const day = new Date(now - 24 * 3600 * 1000);
    const week = new Date(now - 7 * 24 * 3600 * 1000);
    const [agg] = await tx
      .select({
        total24: sql<number>`count(*) filter (where ${checkResults.ranAt} >= ${day})`,
        ok24: sql<number>`count(*) filter (where ${checkResults.ranAt} >= ${day} and ${checkResults.ok})`,
        total7: sql<number>`count(*) filter (where ${checkResults.ranAt} >= ${week})`,
        ok7: sql<number>`count(*) filter (where ${checkResults.ranAt} >= ${week} and ${checkResults.ok})`,
        avgLatency: sql<number | null>`avg(${checkResults.responseMs}) filter (where ${checkResults.ranAt} >= ${day})`,
      })
      .from(checkResults)
      .where(and(eq(checkResults.checkId, ch.id), gte(checkResults.ranAt, week)));
    const recent = await tx
      .select({ ranAt: checkResults.ranAt, ok: checkResults.ok, statusCode: checkResults.statusCode, responseMs: checkResults.responseMs, error: checkResults.error })
      .from(checkResults)
      .where(eq(checkResults.checkId, ch.id))
      .orderBy(desc(checkResults.ranAt))
      .limit(100);
    const pct = (ok: number, total: number) => (total > 0 ? Math.round((ok / total) * 10000) / 100 : null);
    return {
      ...serialize(ch),
      target: ch.target,
      assertions: ch.assertions,
      action: ch.action,
      timeoutMs: ch.timeoutMs,
      failureThreshold: ch.failureThreshold,
      recoveryThreshold: ch.recoveryThreshold,
      uptime24h: pct(Number(agg?.ok24 ?? 0), Number(agg?.total24 ?? 0)),
      uptime7d: pct(Number(agg?.ok7 ?? 0), Number(agg?.total7 ?? 0)),
      avgLatencyMs: agg?.avgLatency != null ? Math.round(Number(agg.avgLatency)) : null,
      // The inbound ping URL for heartbeat checks (secret token in the path).
      pingUrl: ch.type === "heartbeat" && ch.pingToken ? `${new URL(c.req.url).origin}/ingest/heartbeat/${ctx.orgSlug}/${ch.pingToken}` : null,
      recent: recent.map((r) => ({ ranAt: r.ranAt.toISOString(), ok: r.ok, statusCode: r.statusCode, responseMs: r.responseMs, error: r.error })),
    };
  });
  if (!result) return jsonError(c, 404, "Check not found.");
  return c.json(result);
});

checks_.patch("/:checkKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return null;
    const ch = await checkByKey(tx, project.id, (c.req.param("checkKey") ?? ""));
    if (!ch) return null;
    if (parsed.data.target) {
      const targetError = validateTarget(ch.type, parsed.data.target);
      if (targetError) return { ok: false as const, error: targetError };
    }
    const [row] = await tx.update(checks).set({ ...parsed.data, updatedAt: new Date() }).where(eq(checks.id, ch.id)).returning();
    return { ok: true as const, row };
  });
  if (!result) return jsonError(c, 404, "Check not found.");
  if (!result.ok) return jsonError(c, 400, result.error);
  return c.json(serialize(result.row));
});

checks_.delete("/:checkKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return false;
    const ch = await checkByKey(tx, project.id, (c.req.param("checkKey") ?? ""));
    if (!ch) return false;
    await tx.delete(checks).where(eq(checks.id, ch.id));
    return true;
  });
  if (!ok) return jsonError(c, 404, "Check not found.");
  return c.json({ ok: true });
});

checks_.post("/:checkKey/pause", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = pauseBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return null;
    const ch = await checkByKey(tx, project.id, (c.req.param("checkKey") ?? ""));
    if (!ch) return null;
    const [row] = await tx.update(checks).set({ paused: parsed.data.paused, updatedAt: new Date() }).where(eq(checks.id, ch.id)).returning();
    return { row };
  });
  if (!result) return jsonError(c, 404, "Check not found.");
  return c.json(serialize(result.row));
});

checks_.post("/:checkKey/run", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const ch = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return null;
    return checkByKey(tx, project.id, (c.req.param("checkKey") ?? ""));
  });
  if (!ch) return jsonError(c, 404, "Check not found.");
  // Probe now (no tx held) and record through the same path the sweep uses.
  const result = await probe(ch);
  const { status } = await applyProbeResult(ctx.orgId, ctx.orgSlug, ch, result);
  return c.json({ ok: result.ok, statusCode: result.statusCode ?? null, responseMs: result.responseMs ?? null, error: result.error ?? null, status });
});

checks_.get("/:checkKey/results", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100), 1), 500);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const project = await projectByKey(tx, (c.req.param("project") ?? ""));
    if (!project) return null;
    const ch = await checkByKey(tx, project.id, (c.req.param("checkKey") ?? ""));
    if (!ch) return null;
    const rows = await tx
      .select({ ranAt: checkResults.ranAt, ok: checkResults.ok, statusCode: checkResults.statusCode, responseMs: checkResults.responseMs, error: checkResults.error })
      .from(checkResults)
      .where(eq(checkResults.checkId, ch.id))
      .orderBy(desc(checkResults.ranAt))
      .limit(limit);
    return rows.map((r) => ({ ranAt: r.ranAt.toISOString(), ok: r.ok, statusCode: r.statusCode, responseMs: r.responseMs, error: r.error }));
  });
  if (!result) return jsonError(c, 404, "Check not found.");
  return c.json(result);
});

/**
 * Org-level checks overview — every check across all services, for the Reliability →
 * Checks board ("is everything green?"). Mounted at /v1/orgs/:org/checks. Read-only;
 * management stays on the project-scoped routes above.
 */
export const orgChecks_ = new Hono();
orgChecks_.use("*", authContext);

const orgCheckSchema = checkSchema.extend({ projectKey: z.string(), projectName: z.string() });
registerComponentSchema("OrgCheckListResponse", z.array(orgCheckSchema));
registerRoute({ method: "get", path: "/v1/orgs/{org}/checks", summary: "List all checks", description: "Every check across the org's services, with current status (the reliability overview).", tags: [TAG], auth: true, paramDescriptions: { org: "The organization slug." }, responses: { 200: { description: "Checks.", schemaName: "OrgCheckListResponse" } } });

orgChecks_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json(
    await withOrg(ctx.orgId, async (tx) => {
      const rows = await tx
        .select({ check: checks, projectKey: projects.key, projectName: projects.name })
        .from(checks)
        .innerJoin(projects, eq(projects.id, checks.projectId))
        .orderBy(desc(checks.createdAt));
      return rows.map((r) => ({ ...serialize(r.check), projectKey: r.projectKey, projectName: r.projectName }));
    }),
  );
});
