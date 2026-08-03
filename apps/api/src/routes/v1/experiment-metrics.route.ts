import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { experimentMetrics } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Experiment metrics — reusable goal-metric definitions (the outcomes experiments
 * measure), referenced by experiments. Mounted under /v1/orgs/:org/experiment-metrics
 * (NOT a bare /metrics, so a future OTEL metrics product can't collide). A metric
 * names the track() `eventName` that feeds it and how to aggregate it (`type`), so
 * "checkout completed" is defined once and reused across experiments.
 */
export const experimentMetrics_ = new Hono();

experimentMetrics_.use("*", authContext);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(
    /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers, hyphens, and underscores, starting and ending with a letter or number.",
  );

const metricType = z.enum(["conversion", "count", "mean", "sum"]);
const direction = z.enum(["increase", "decrease"]);

const createMetric = z.object({
  key: slug,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  type: metricType.default("conversion"),
  eventName: z.string().trim().min(1).max(200),
  valueField: z.string().trim().max(200).nullish(),
  direction: direction.default("increase"),
});

const updateMetric = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    type: metricType.optional(),
    eventName: z.string().trim().min(1).max(200).optional(),
    valueField: z.string().trim().max(200).nullish(),
    direction: direction.optional(),
  })
  .strict();

// --- OpenAPI registration ----------------------------------------------------
const METRICS_TAG = "Experiment metrics";
const metricParams = { org: "The organization slug.", key: "The metric key." };
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/experiment-metrics",
  summary: "Create an experiment metric",
  description:
    "Define a reusable goal metric: the track() event it measures and how it aggregates (conversion, count, mean, or sum).",
  tags: [METRICS_TAG],
  auth: true,
  paramDescriptions: metricParams,
  request: { body: createMetric },
  responses: {
    201: { description: "The metric was created.", schemaName: "ExperimentMetricResponse" },
    409: { description: "A metric with that key already exists." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/experiment-metrics",
  summary: "List experiment metrics",
  description: "List every experiment-metric definition in the organization.",
  tags: [METRICS_TAG],
  auth: true,
  paramDescriptions: metricParams,
  responses: {
    200: { description: "The organization's metrics.", schemaName: "ExperimentMetricListResponse" },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/experiment-metrics/{key}",
  summary: "Get an experiment metric",
  tags: [METRICS_TAG],
  auth: true,
  paramDescriptions: metricParams,
  responses: {
    200: { description: "The metric.", schemaName: "ExperimentMetricResponse" },
    404: { description: "No metric with that key." },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/experiment-metrics/{key}",
  summary: "Update an experiment metric",
  description: "Edit a metric's name, description, type, event, value field, or direction.",
  tags: [METRICS_TAG],
  auth: true,
  paramDescriptions: metricParams,
  request: { body: updateMetric },
  responses: {
    200: { description: "The updated metric.", schemaName: "ExperimentMetricResponse" },
    404: { description: "No metric with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/experiment-metrics/{key}",
  summary: "Delete an experiment metric",
  description: "Permanently delete a metric. Experiments referencing it lose the attachment.",
  tags: [METRICS_TAG],
  auth: true,
  paramDescriptions: metricParams,
  responses: {
    200: { description: "The metric was deleted.", schemaName: "DeleteAck" },
    404: { description: "No metric with that key." },
    429: WRITE_429,
  },
});

function serialize(m: typeof experimentMetrics.$inferSelect) {
  return {
    id: m.id,
    key: m.key,
    name: m.name,
    description: m.description,
    type: m.type,
    eventName: m.eventName,
    valueField: m.valueField,
    direction: m.direction,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// --- Response component schemas ----------------------------------------------
const metricSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  eventName: z.string(),
  valueField: z.string().nullable(),
  direction: z.string(),
  createdAt: z.string().describe("ISO 8601 timestamp"),
  updatedAt: z.string().describe("ISO 8601 timestamp"),
});
registerComponentSchema("ExperimentMetric", metricSchema);
registerComponentSchema("ExperimentMetricResponse", z.object({ metric: metricSchema }));
registerComponentSchema("ExperimentMetricListResponse", z.array(metricSchema));

experimentMetrics_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = createMetric.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const existing = (
      await tx
        .select({ id: experimentMetrics.id })
        .from(experimentMetrics)
        .where(eq(experimentMetrics.key, parsed.data.key))
        .limit(1)
    )[0];
    if (existing) return "conflict" as const;
    const [row] = await tx
      .insert(experimentMetrics)
      .values({
        organizationId: ctx.orgId,
        key: parsed.data.key,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        type: parsed.data.type,
        eventName: parsed.data.eventName,
        valueField: parsed.data.valueField ?? null,
        direction: parsed.data.direction,
        createdByUserId: ctx.actorUserId ?? null,
      })
      .returning();
    return { row };
  });

  if (outcome === "conflict")
    return jsonError(c, 409, `A metric named "${parsed.data.key}" already exists.`);
  return c.json({ metric: serialize(outcome.row) }, 201);
});

experimentMetrics_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(experimentMetrics).orderBy(desc(experimentMetrics.createdAt)),
  );
  return c.json(rows.map(serialize));
});

experimentMetrics_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const row = await withOrg(ctx.orgId, (tx) =>
    tx
      .select()
      .from(experimentMetrics)
      .where(eq(experimentMetrics.key, key))
      .limit(1)
      .then((r) => r[0]),
  );
  if (!row) return jsonError(c, 404, "Metric not found.");
  return c.json({ metric: serialize(row) });
});

experimentMetrics_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateMetric.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const key = c.req.param("key") ?? "";
  const row = await withOrg(ctx.orgId, async (tx) => {
    const existing = (
      await tx
        .select({ id: experimentMetrics.id })
        .from(experimentMetrics)
        .where(eq(experimentMetrics.key, key))
        .limit(1)
    )[0];
    if (!existing) return null;
    const [updated] = await tx
      .update(experimentMetrics)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
        ...(parsed.data.eventName !== undefined ? { eventName: parsed.data.eventName } : {}),
        ...(parsed.data.valueField !== undefined
          ? { valueField: parsed.data.valueField }
          : {}),
        ...(parsed.data.direction !== undefined ? { direction: parsed.data.direction } : {}),
        updatedAt: new Date(),
      })
      .where(eq(experimentMetrics.id, existing.id))
      .returning();
    return updated;
  });
  if (!row) return jsonError(c, 404, "Metric not found.");
  return c.json({ metric: serialize(row) });
});

experimentMetrics_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key") ?? "";
  const deleted = await withOrg(ctx.orgId, (tx) =>
    tx
      .delete(experimentMetrics)
      .where(eq(experimentMetrics.key, key))
      .returning({ id: experimentMetrics.id }),
  );
  if (deleted.length === 0) return jsonError(c, 404, "Metric not found.");
  return c.json({ ok: true });
});
