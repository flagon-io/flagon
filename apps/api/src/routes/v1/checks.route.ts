import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager, orgPlan } from "../../lib/org-context.js";
import {
  planAllowsIncidentAutomation,
  planIncludedUptimeMonitors,
  planUptimeHardCaps,
} from "../../lib/plans.js";
import { activeUptimeMonitorCount } from "../../lib/billing.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { withOrg } from "../../db/tenant.js";
import { checks, checkResults, projects, type Check, type CheckResult } from "../../db/schema.js";
import { getMonitorType, listMonitorTypes } from "../../checks/monitors/index.js";
import { FREQUENCY_SECONDS } from "../../checks/monitors/types.js";
import { executeInline } from "../../checks/execute.js";

/**
 * The Checks product API. Mounted under /v1/orgs/:org/checks. A check is a scheduled
 * probe of one monitor TYPE (URL, browser, …); the type-specific config is validated
 * by that type's adapter (checks/monitors). One shared impl — the console and API
 * consumers both create/manage checks here (API-first parity).
 */
export const checks_ = new Hono();

checks_.use("*", authContext);

// --- serialization -----------------------------------------------------------

function serializeCheck(row: Check) {
  return {
    key: row.key,
    name: row.name,
    type: row.type,
    family: row.family,
    config: row.config,
    frequencySeconds: row.frequencySeconds,
    locations: row.locations,
    activated: row.activated,
    muted: row.muted,
    currentStatus: row.currentStatus,
    consecutiveFailures: row.consecutiveFailures,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    nextRunAt: row.nextRunAt.toISOString(),
    lastStatusChangeAt: row.lastStatusChangeAt ? row.lastStatusChangeAt.toISOString() : null,
    alertTrigger: row.alertTrigger,
    alertOnDegraded: row.alertOnDegraded,
    alertEmails: row.alertEmails,
    alertChannelIds: row.alertChannelIds,
    incidentAutomation: row.incidentAutomation,
    linkedProjectId: row.linkedProjectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeResult(row: CheckResult) {
  return {
    id: row.id,
    runStartedAt: row.runStartedAt.toISOString(),
    status: row.status,
    latencyMs: row.latencyMs,
    httpStatus: row.httpStatus,
    location: row.location,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    assertions: row.assertions,
    detail: row.detail,
  };
}

/** name -> a url-safe key, when the caller doesn't supply one. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "check";
}

// --- request validation ------------------------------------------------------

const alertTriggerSchema = z.union([
  z.object({
    type: z.literal("run_count"),
    runs: z.number().int().min(1).max(5),
    reminderMinutes: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("time_based"),
    minutes: z.number().int().min(1),
    reminderMinutes: z.number().int().positive().optional(),
  }),
]);

const baseFields = {
  frequencySeconds: z
    .number()
    .int()
    .refine((n) => (FREQUENCY_SECONDS as readonly number[]).includes(n), {
      message: `Must be one of the supported frequencies: ${FREQUENCY_SECONDS.join(", ")}.`,
    })
    .optional(),
  locations: z.array(z.string()).min(1).optional(),
  activated: z.boolean().optional(),
  muted: z.boolean().optional(),
  alertEmails: z.array(z.string().email()).optional(),
  alertChannelIds: z.array(z.string().uuid()).optional(),
  alertTrigger: alertTriggerSchema.optional(),
  alertOnDegraded: z.boolean().optional(),
  incidentAutomation: z.boolean().optional(),
  linkedProjectKey: z.string().nullable().optional(),
};

const createSchema = z.object({
  key: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200),
  type: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  ...baseFields,
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  ...baseFields,
});

// --- OpenAPI -----------------------------------------------------------------

const TAG = "Checks";
const params = { org: "The organization slug.", key: "The check key." };

const checkSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  family: z.enum(["uptime", "synthetic"]),
  config: z.record(z.string(), z.unknown()),
  frequencySeconds: z.number().int(),
  locations: z.array(z.string()),
  activated: z.boolean(),
  muted: z.boolean(),
  currentStatus: z.enum(["unknown", "passing", "degraded", "failing"]),
  consecutiveFailures: z.number().int(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string(),
  lastStatusChangeAt: z.string().nullable(),
  alertTrigger: z.record(z.string(), z.unknown()),
  alertOnDegraded: z.boolean(),
  alertEmails: z.array(z.string()),
  alertChannelIds: z.array(z.string()),
  incidentAutomation: z.boolean(),
  linkedProjectId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
registerComponentSchema("Check", checkSchema);
registerComponentSchema("CheckList", z.object({ checks: z.array(checkSchema) }));
registerComponentSchema("CheckResponse", z.object({ check: checkSchema }));

const monitorTypeSchema = z.object({
  key: z.string(),
  label: z.string(),
  summary: z.string(),
  family: z.enum(["uptime", "synthetic"]),
  runner: z.enum(["inline", "browser", "agent"]),
  supportsDegraded: z.boolean(),
  defaults: z.record(z.string(), z.unknown()),
  configSchema: z.record(z.string(), z.unknown()).describe("JSON Schema for the type's config."),
});
registerComponentSchema("MonitorType", monitorTypeSchema);
registerComponentSchema("MonitorTypeList", z.object({ monitorTypes: z.array(monitorTypeSchema) }));

const resultSchema = z.object({
  id: z.string(),
  runStartedAt: z.string(),
  status: z.string(),
  latencyMs: z.number().nullable(),
  httpStatus: z.number().nullable(),
  location: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  assertions: z.unknown().nullable(),
  detail: z.unknown().nullable(),
});
registerComponentSchema("CheckResult", resultSchema);
registerComponentSchema("CheckResultList", z.object({ results: z.array(resultSchema) }));

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/checks/monitor-types",
  summary: "List monitor types",
  description:
    "Every monitor type Checks supports (URL, browser, …), each with its config JSON Schema. Drives the console's type picker and config form from one source of truth.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  responses: { 200: { description: "The supported monitor types.", schemaName: "MonitorTypeList" } },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/checks",
  summary: "List checks",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  responses: { 200: { description: "The org's checks.", schemaName: "CheckList" } },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/checks",
  summary: "Create a check",
  description:
    "Create a scheduled check. `config` is validated against the chosen monitor type's schema. Incident automation requires a Pro plan. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  request: { body: createSchema },
  responses: {
    200: { description: "The created check.", schemaName: "CheckResponse" },
    403: { description: "Incident automation requires a Pro plan." },
    409: { description: "A check with that key already exists." },
    422: { description: "The submitted data failed validation." },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/checks/{key}",
  summary: "Get a check",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The check.", schemaName: "CheckResponse" },
    404: { description: "No such check." },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/checks/{key}",
  summary: "Update a check",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: updateSchema },
  responses: {
    200: { description: "The updated check.", schemaName: "CheckResponse" },
    403: { description: "Incident automation requires a Pro plan." },
    404: { description: "No such check." },
    422: { description: "The submitted data failed validation." },
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/checks/{key}",
  summary: "Delete a check",
  description: "Delete a check and its result history. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The check was deleted.", schemaName: "DeleteAck" },
    404: { description: "No such check." },
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/checks/{key}/run",
  summary: "Run a check now",
  description: "Execute the check immediately (out of schedule) and record the result.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The recorded run result.", schemaName: "CheckResult" },
    404: { description: "No such check." },
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/checks/{key}/mute",
  summary: "Mute or unmute a check",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: z.object({ muted: z.boolean() }) },
  responses: {
    200: { description: "The updated check.", schemaName: "CheckResponse" },
    404: { description: "No such check." },
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/checks/{key}/activate",
  summary: "Activate or deactivate a check",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: z.object({ activated: z.boolean() }) },
  responses: {
    200: { description: "The updated check.", schemaName: "CheckResponse" },
    404: { description: "No such check." },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/checks/{key}/results",
  summary: "List recent check results",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The check's recent results.", schemaName: "CheckResultList" },
    404: { description: "No such check." },
  },
});

// --- helpers -----------------------------------------------------------------

/** Load a check by key within the org, or null. */
async function loadCheck(orgId: string, key: string): Promise<Check | null> {
  const row = (
    await withOrg(orgId, (tx) =>
      tx.select().from(checks).where(eq(checks.key, key)).limit(1),
    )
  )[0];
  return row ?? null;
}

/**
 * Refuse activating one more uptime monitor when a hard-capped plan (Hobby) is already
 * at its included allowance. Uptime monitors are billed by COUNT (Checkly's model), and
 * the free tier is a hard ceiling; Pro/Enterprise return null (they bill/contract the
 * overage). Returns a 403 Response to short-circuit, or null to proceed.
 */
async function uptimeCapDenied(c: Parameters<typeof jsonError>[0], orgId: string): Promise<Response | null> {
  const plan = await orgPlan(orgId);
  if (!planUptimeHardCaps(plan)) return null;
  const included = planIncludedUptimeMonitors(plan);
  const count = await activeUptimeMonitorCount(orgId);
  if (count + 1 > included) {
    return jsonError(
      c,
      403,
      `Your plan includes ${included} active uptime monitors. Upgrade to Pro to add more.`,
    );
  }
  return null;
}

/** Resolve a project key to its id within the org, or null if not found. */
async function projectIdByKey(orgId: string, key: string): Promise<string | null> {
  const row = (
    await withOrg(orgId, (tx) =>
      tx.select({ id: projects.id }).from(projects).where(eq(projects.key, key)).limit(1),
    )
  )[0];
  return row?.id ?? null;
}

// --- handlers ----------------------------------------------------------------

checks_.get("/monitor-types", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const monitorTypes = listMonitorTypes().map((t) => ({
    key: t.key,
    label: t.label,
    summary: t.summary,
    family: t.family,
    runner: t.runner,
    supportsDegraded: t.supportsDegraded,
    defaults: t.defaults,
    configSchema: z.toJSONSchema(t.configSchema, { io: "input" }),
  }));
  return c.json({ monitorTypes });
});

checks_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  // Optional ?project=<key> scopes to checks related to that project (its "Checks" tab).
  const projectKey = c.req.query("project");
  let projectId: string | null = null;
  if (projectKey) {
    projectId = await projectIdByKey(ctx.orgId, projectKey);
    if (!projectId) return c.json({ checks: [] });
  }
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx
      .select()
      .from(checks)
      .where(projectId ? eq(checks.linkedProjectId, projectId) : undefined)
      .orderBy(desc(checks.createdAt)),
  );
  return c.json({ checks: rows.map(serializeCheck) });
});

checks_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const raw = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return validationError(c, parsed.error);
  const body = parsed.data;

  const type = getMonitorType(body.type);
  if (!type) return jsonError(c, 422, `Unknown monitor type "${body.type}".`);

  const configParsed = type.configSchema.safeParse(body.config);
  if (!configParsed.success) return validationError(c, configParsed.error);

  if (body.incidentAutomation && !planAllowsIncidentAutomation(await orgPlan(ctx.orgId))) {
    return jsonError(c, 403, "Incident automation requires a Pro plan.");
  }

  // Uptime monitors bill by count; a hard-capped plan can't exceed its allowance.
  if (type.family === "uptime" && (body.activated ?? true)) {
    const capped = await uptimeCapDenied(c, ctx.orgId);
    if (capped) return capped;
  }

  let linkedProjectId: string | null = null;
  if (body.linkedProjectKey) {
    linkedProjectId = await projectIdByKey(ctx.orgId, body.linkedProjectKey);
    if (!linkedProjectId) return jsonError(c, 422, "The linked project was not found.");
  }

  const key = body.key ? slugify(body.key) : slugify(body.name);
  try {
    const [row] = await withOrg(ctx.orgId, (tx) =>
      tx
        .insert(checks)
        .values({
          organizationId: ctx.orgId,
          key,
          name: body.name,
          type: type.key,
          family: type.family,
          config: configParsed.data as Record<string, unknown>,
          frequencySeconds: body.frequencySeconds ?? 300,
          locations: body.locations ?? ["default"],
          activated: body.activated ?? true,
          muted: body.muted ?? false,
          alertEmails: body.alertEmails ?? [],
          alertChannelIds: body.alertChannelIds ?? [],
          alertTrigger: body.alertTrigger ?? { type: "run_count", runs: 1 },
          alertOnDegraded: body.alertOnDegraded ?? false,
          incidentAutomation: body.incidentAutomation ?? false,
          linkedProjectId,
          createdByUserId: ctx.actorUserId,
        })
        .returning(),
    );
    return c.json({ check: serializeCheck(row!) });
  } catch (err) {
    // The (org, key) unique index is the collision guard.
    if (err instanceof Error && /checks_org_key_key|duplicate key/.test(err.message)) {
      return jsonError(c, 409, `A check with the key "${key}" already exists.`);
    }
    throw err;
  }
});

checks_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");
  return c.json({ check: serializeCheck(check) });
});

checks_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const body = parsed.data;

  const type = getMonitorType(check.type);
  const set: Partial<Check> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.config !== undefined) {
    if (!type) return jsonError(c, 422, "This check's monitor type is no longer available.");
    const configParsed = type.configSchema.safeParse(body.config);
    if (!configParsed.success) return validationError(c, configParsed.error);
    set.config = configParsed.data as Record<string, unknown>;
  }
  if (body.frequencySeconds !== undefined) set.frequencySeconds = body.frequencySeconds;
  if (body.locations !== undefined) set.locations = body.locations;
  if (body.activated !== undefined) set.activated = body.activated;
  if (body.muted !== undefined) set.muted = body.muted;
  if (body.alertEmails !== undefined) set.alertEmails = body.alertEmails;
  if (body.alertChannelIds !== undefined) set.alertChannelIds = body.alertChannelIds;
  if (body.alertTrigger !== undefined) set.alertTrigger = body.alertTrigger;
  if (body.alertOnDegraded !== undefined) set.alertOnDegraded = body.alertOnDegraded;
  if (body.incidentAutomation !== undefined) {
    if (body.incidentAutomation && !planAllowsIncidentAutomation(await orgPlan(ctx.orgId))) {
      return jsonError(c, 403, "Incident automation requires a Pro plan.");
    }
    set.incidentAutomation = body.incidentAutomation;
  }
  if (body.linkedProjectKey !== undefined) {
    if (body.linkedProjectKey === null) set.linkedProjectId = null;
    else {
      const id = await projectIdByKey(ctx.orgId, body.linkedProjectKey);
      if (!id) return jsonError(c, 422, "The linked project was not found.");
      set.linkedProjectId = id;
    }
  }

  if (set.activated === true && !check.activated && check.family === "uptime") {
    const capped = await uptimeCapDenied(c, ctx.orgId);
    if (capped) return capped;
  }
  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx.update(checks).set({ ...set, updatedAt: new Date() }).where(eq(checks.id, check.id)).returning(),
  );
  return c.json({ check: serializeCheck(row!) });
});

checks_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");
  await withOrg(ctx.orgId, (tx) => tx.delete(checks).where(eq(checks.id, check.id)));
  return c.json({ ok: true });
});

checks_.post("/:key/run", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");
  const recorded = await executeInline(ctx.orgId, ctx.orgSlug, check);
  if (!recorded) return jsonError(c, 422, "This check's monitor type is unavailable.");
  return c.json(serializeResult(recorded.result));
});

checks_.post("/:key/mute", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");
  const body = (await c.req.json().catch(() => null)) as { muted?: unknown } | null;
  if (typeof body?.muted !== "boolean") return jsonError(c, 422, "Expected a boolean `muted`.");
  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx.update(checks).set({ muted: body.muted as boolean, updatedAt: new Date() }).where(eq(checks.id, check.id)).returning(),
  );
  return c.json({ check: serializeCheck(row!) });
});

checks_.post("/:key/activate", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");
  const body = (await c.req.json().catch(() => null)) as { activated?: unknown } | null;
  if (typeof body?.activated !== "boolean") return jsonError(c, 422, "Expected a boolean `activated`.");
  // Re-activating an uptime monitor adds to the billed count; enforce the plan cap.
  if (body.activated && !check.activated && check.family === "uptime") {
    const capped = await uptimeCapDenied(c, ctx.orgId);
    if (capped) return capped;
  }
  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx.update(checks).set({ activated: body.activated as boolean, updatedAt: new Date() }).where(eq(checks.id, check.id)).returning(),
  );
  return c.json({ check: serializeCheck(row!) });
});

checks_.get("/:key/results", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const check = await loadCheck(ctx.orgId, c.req.param("key"));
  if (!check) return jsonError(c, 404, "No such check.");
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx
      .select()
      .from(checkResults)
      .where(and(eq(checkResults.checkId, check.id)))
      .orderBy(desc(checkResults.runStartedAt))
      .limit(100),
  );
  return c.json({ results: rows.map(serializeResult) });
});
