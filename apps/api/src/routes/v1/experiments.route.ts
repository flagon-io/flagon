import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import type { TenantTx } from "../../db/tenant.js";
import {
  environments,
  experiments,
  experimentMetricLinks,
  experimentMetrics,
  flags,
  flagVariants,
} from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { invalidateEvalCacheOnWrite } from "../../lib/eval-invalidate.js";
import { analyzeExperiment } from "../../experiments/analyze.js";
import { experimentDiagnostics } from "../../experiments/diagnostics.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Experiments — measured rollouts of a flag. Mounted under /v1/orgs/:org/experiments.
 * An experiment IS a flag: the flag's deterministic bucketing (evaluated over the
 * unchanged OFREP path) assigns units to arms; metrics measure the impact.
 * Lifecycle: draft -> running -> stopped, with a recorded decision.
 */
export const experiments_ = new Hono();

experiments_.use("*", authContext);
// Starting/stopping an experiment changes which flags a holdout governs, so an
// experiment write must invalidate the eval-config cache (harmless on no-op writes).
experiments_.use("*", invalidateEvalCacheOnWrite);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers, and single hyphens.",
  );

const role = z.enum(["primary", "secondary", "guardrail"]);
const decision = z.enum(["ship", "rollback", "inconclusive"]);
const confidenceLevel = z.number().int().min(80).max(99);
const correction = z.enum(["none", "bonferroni", "bh"]);

const createExperiment = z.object({
  key: slug,
  name: z.string().trim().min(1).max(200),
  hypothesis: z.string().max(4000).nullish(),
  /** The flag whose variants are the experiment arms. */
  flag: z.string().trim().min(1),
  /** The environment the experiment runs in. */
  environment: z.string().trim().min(1),
  controlVariantKey: z.string().trim().min(1).nullish(),
  allocation: z.number().int().min(1).max(100).default(100),
  bucketBy: z.string().trim().min(1).nullish(),
  confidenceLevel: confidenceLevel.default(95),
  sequential: z.boolean().default(true),
  correction: correction.default("none"),
  cuped: z.boolean().default(false),
  /** Metric keys to attach, with a role each; a 'primary' one becomes the decision metric. */
  metrics: z
    .array(z.object({ key: z.string().trim().min(1), role: role.default("secondary") }))
    .default([]),
});

const updateExperiment = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    hypothesis: z.string().max(4000).nullish(),
    controlVariantKey: z.string().trim().min(1).nullish(),
    allocation: z.number().int().min(1).max(100).optional(),
    bucketBy: z.string().trim().min(1).nullish(),
    confidenceLevel: confidenceLevel.optional(),
    sequential: z.boolean().optional(),
    correction: correction.optional(),
    cuped: z.boolean().optional(),
  })
  .strict();

const setMetrics = z.object({
  metrics: z.array(
    z.object({ key: z.string().trim().min(1), role: role.default("secondary") }),
  ),
});

const decideBody = z.object({ decision, stop: z.boolean().default(true) });

// --- OpenAPI registration ----------------------------------------------------
const EXPERIMENTS_TAG = "Experiments";
const expParams = { org: "The organization slug.", key: "The experiment key." };
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/experiments",
  summary: "Create an experiment",
  description:
    "Create an experiment on a flag: its variants become the arms, and the attached metrics measure impact. Starts in 'draft'.",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  request: { body: createExperiment },
  responses: {
    201: { description: "The experiment was created.", schemaName: "ExperimentResponse" },
    409: { description: "An experiment with that key already exists." },
    422: { description: "Validation failed, or the flag/environment/metric does not exist." },
    429: WRITE_429,
  },
});

for (const [method, path, summary] of [
  ["get", "/v1/orgs/{org}/experiments", "List experiments"],
  ["get", "/v1/orgs/{org}/experiments/{key}", "Get an experiment"],
] as const) {
  registerRoute({
    method,
    path,
    summary,
    tags: [EXPERIMENTS_TAG],
    auth: true,
    paramDescriptions: expParams,
    responses: {
      200: {
        description: summary,
        schemaName: path.endsWith("{key}") ? "ExperimentResponse" : "ExperimentListResponse",
      },
      ...(path.endsWith("{key}") ? { 404: { description: "No experiment with that key." } } : {}),
    },
  });
}

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/experiments/{key}",
  summary: "Update an experiment",
  description: "Edit a draft experiment's name, hypothesis, control, allocation, or bucketing.",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  request: { body: updateExperiment },
  responses: {
    200: { description: "The updated experiment.", schemaName: "ExperimentResponse" },
    404: { description: "No experiment with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "put",
  path: "/v1/orgs/{org}/experiments/{key}/metrics",
  summary: "Set experiment metrics",
  description: "Replace the set of metrics attached to the experiment (each with a role).",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  request: { body: setMetrics },
  responses: {
    200: { description: "The updated experiment.", schemaName: "ExperimentResponse" },
    404: { description: "No experiment (or a metric) with that key." },
    429: WRITE_429,
  },
});

for (const [action, summary, desc2] of [
  ["start", "Start an experiment", "Move a draft/stopped experiment to running and stamp the start."],
  ["stop", "Stop an experiment", "Move a running experiment to stopped and stamp the stop."],
] as const) {
  registerRoute({
    method: "post",
    path: `/v1/orgs/{org}/experiments/{key}/${action}`,
    summary,
    description: desc2,
    tags: [EXPERIMENTS_TAG],
    auth: true,
    paramDescriptions: expParams,
    responses: {
      200: { description: summary, schemaName: "ExperimentResponse" },
      404: { description: "No experiment with that key." },
      429: WRITE_429,
    },
  });
}

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/experiments/{key}/decide",
  summary: "Record an experiment decision",
  description: "Record the conclusion (ship, rollback, or inconclusive), optionally stopping it.",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  request: { body: decideBody },
  responses: {
    200: { description: "The updated experiment.", schemaName: "ExperimentResponse" },
    404: { description: "No experiment with that key." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/experiments/{key}/diagnostics",
  summary: "Get experiment diagnostics",
  description:
    "The exposure stream + goal-event stream for an experiment: per-arm exposure counts and the most recent attributed exposures and goal events, so you can verify data is arriving and attributing. Units are shown as a salted hash (no raw targeting keys are stored).",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  responses: {
    200: { description: "The experiment diagnostics.", schemaName: "ExperimentDiagnosticsResponse" },
    404: { description: "No experiment with that key." },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/experiments/{key}/results",
  summary: "Get experiment results",
  description:
    "Compute the statistical readout: per metric, each arm vs the control with lift, confidence interval, p-value, and Bayesian probability to beat control, plus a sample-ratio-mismatch health check.",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  responses: {
    200: { description: "The experiment results.", schemaName: "ExperimentResultsResponse" },
    404: { description: "No experiment with that key." },
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/experiments/{key}",
  summary: "Delete an experiment",
  description: "Permanently delete an experiment and its attribution data.",
  tags: [EXPERIMENTS_TAG],
  auth: true,
  paramDescriptions: expParams,
  responses: {
    200: { description: "The experiment was deleted.", schemaName: "DeleteAck" },
    404: { description: "No experiment with that key." },
    429: WRITE_429,
  },
});

// --- Serialization + schemas -------------------------------------------------
type ExperimentRow = typeof experiments.$inferSelect;

function serialize(
  e: ExperimentRow,
  extra: {
    flagKey: string | null;
    environmentKey: string | null;
    primaryMetricKey: string | null;
    metrics: { key: string; name: string; role: string }[];
  },
) {
  return {
    id: e.id,
    key: e.key,
    name: e.name,
    hypothesis: e.hypothesis,
    flag: extra.flagKey,
    environment: extra.environmentKey,
    status: e.status,
    controlVariantKey: e.controlVariantKey,
    allocation: e.allocation,
    bucketBy: e.bucketBy,
    confidenceLevel: e.confidenceLevel,
    sequential: e.sequential,
    correction: e.correction,
    cuped: e.cuped,
    primaryMetric: extra.primaryMetricKey,
    metrics: extra.metrics,
    decision: e.decision,
    startedAt: e.startedAt ? e.startedAt.toISOString() : null,
    stoppedAt: e.stoppedAt ? e.stoppedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

const experimentSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  hypothesis: z.string().nullable(),
  flag: z.string().nullable(),
  environment: z.string().nullable(),
  status: z.string(),
  controlVariantKey: z.string().nullable(),
  allocation: z.number(),
  bucketBy: z.string().nullable(),
  confidenceLevel: z.number(),
  sequential: z.boolean(),
  correction: z.string(),
  cuped: z.boolean(),
  primaryMetric: z.string().nullable(),
  metrics: z.array(z.object({ key: z.string(), name: z.string(), role: z.string() })),
  decision: z.string().nullable(),
  startedAt: z.string().nullable(),
  stoppedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
registerComponentSchema("Experiment", experimentSchema);
registerComponentSchema("ExperimentResponse", z.object({ experiment: experimentSchema }));
registerComponentSchema("ExperimentListResponse", z.array(experimentSchema));

const variantAnalysisSchema = z.object({
  variantKey: z.string(),
  isControl: z.boolean(),
  units: z.number(),
  estimate: z.number(),
  ciLow: z.number(),
  ciHigh: z.number(),
  absoluteLift: z.number().nullable(),
  relativeLift: z.number().nullable(),
  relativeLiftCiLow: z.number().nullable(),
  relativeLiftCiHigh: z.number().nullable(),
  pValue: z.number().nullable(),
  probabilityToBeatControl: z.number().nullable(),
  significant: z.boolean(),
  sequentialPValue: z.number().nullable(),
  sequentialCiLow: z.number().nullable(),
  sequentialCiHigh: z.number().nullable(),
  sequentiallySignificant: z.boolean(),
});
registerComponentSchema(
  "ExperimentResultsResponse",
  z.object({
    experimentId: z.string(),
    status: z.string(),
    controlVariantKey: z.string().nullable(),
    totalUnits: z.number(),
    retentionDays: z.number().nullable(),
    analysisConfig: z.object({
      confidenceLevel: z.number(),
      sequential: z.boolean(),
      correction: z.string(),
      cuped: z.boolean(),
    }),
    power: z
      .object({
        mde: z.number(),
        baseline: z.number(),
        requiredPerArm: z.number(),
        currentPerArm: z.number(),
      })
      .nullable(),
    metrics: z.array(
      z.object({
        metricKey: z.string(),
        metricName: z.string(),
        metricType: z.string(),
        role: z.string(),
        direction: z.string(),
        analysis: z.object({
          family: z.string(),
          direction: z.string(),
          confidence: z.number(),
          variants: z.array(variantAnalysisSchema),
          srm: z
            .object({ chiSquare: z.number(), pValue: z.number(), healthy: z.boolean() })
            .nullable(),
          cuped: z
            .object({
              applied: z.boolean(),
              theta: z.number(),
              varianceReduction: z.number(),
            })
            .optional(),
        }),
      }),
    ),
  }),
);

registerComponentSchema(
  "ExperimentDiagnosticsResponse",
  z.object({
    arms: z.array(z.object({ variant: z.string(), units: z.number() })),
    totals: z.object({ exposures: z.number(), events: z.number() }),
    recentExposures: z.array(
      z.object({ unit: z.string(), variant: z.string(), at: z.string() }),
    ),
    recentEvents: z.array(
      z.object({ unit: z.string(), event: z.string(), value: z.number(), at: z.string() }),
    ),
  }),
);

// --- Helpers -----------------------------------------------------------------

/** Load an experiment by key with its display joins (flag/env/primary/metrics). */
async function loadByKey(tx: TenantTx, orgId: string, key: string) {
  const [exp] = await tx
    .select()
    .from(experiments)
    .where(and(eq(experiments.organizationId, orgId), eq(experiments.key, key)))
    .limit(1);
  if (!exp) return null;
  return hydrate(tx, orgId, exp);
}

async function hydrate(tx: TenantTx, orgId: string, exp: ExperimentRow) {
  const [flag] = await tx
    .select({ key: flags.key })
    .from(flags)
    .where(eq(flags.id, exp.flagId))
    .limit(1);
  const [envRow] = await tx
    .select({ key: environments.key })
    .from(environments)
    .where(eq(environments.id, exp.environmentId))
    .limit(1);
  const attached = await tx
    .select({
      key: experimentMetrics.key,
      name: experimentMetrics.name,
      role: experimentMetricLinks.role,
      id: experimentMetrics.id,
    })
    .from(experimentMetricLinks)
    .innerJoin(experimentMetrics, eq(experimentMetrics.id, experimentMetricLinks.metricId))
    .where(eq(experimentMetricLinks.experimentId, exp.id));
  const primaryMetricKey = exp.primaryMetricId
    ? attached.find((m) => m.id === exp.primaryMetricId)?.key ?? null
    : null;
  return {
    exp,
    serialized: serialize(exp, {
      flagKey: flag?.key ?? null,
      environmentKey: envRow?.key ?? null,
      primaryMetricKey,
      metrics: attached.map((m) => ({ key: m.key, name: m.name, role: m.role })),
    }),
  };
}

type Hydrated = Awaited<ReturnType<typeof hydrate>>;
/** A write handler's result: a conflict, a 422 message, or the hydrated row. */
type WriteOutcome = "conflict" | { error: string } | { hydrated: Hydrated };
/** An edit handler's result: not-found, a 422 message, or the hydrated row. */
type EditOutcome = null | { error: string } | { hydrated: Hydrated };

/** Replace an experiment's metric attachments from a {key, role}[] list. */
async function applyMetrics(
  tx: TenantTx,
  orgId: string,
  experimentId: string,
  desired: { key: string; role: string }[],
): Promise<{ primaryMetricId: string | null } | "missing"> {
  const keys = [...new Set(desired.map((m) => m.key))];
  const defs = keys.length
    ? await tx
        .select({ id: experimentMetrics.id, key: experimentMetrics.key })
        .from(experimentMetrics)
        .where(
          and(
            eq(experimentMetrics.organizationId, orgId),
            inArray(experimentMetrics.key, keys),
          ),
        )
    : [];
  const byKey = new Map(defs.map((d) => [d.key, d.id]));
  for (const k of keys) if (!byKey.has(k)) return "missing";

  await tx
    .delete(experimentMetricLinks)
    .where(eq(experimentMetricLinks.experimentId, experimentId));
  let primaryMetricId: string | null = null;
  if (desired.length) {
    const rows = desired.map((m) => {
      const metricId = byKey.get(m.key)!;
      if (m.role === "primary") primaryMetricId = metricId;
      return { organizationId: orgId, experimentId, metricId, role: m.role };
    });
    await tx.insert(experimentMetricLinks).values(rows).onConflictDoNothing({
      target: [experimentMetricLinks.experimentId, experimentMetricLinks.metricId],
    });
  }
  return { primaryMetricId };
}

// --- Handlers ----------------------------------------------------------------

experiments_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = createExperiment.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const d = parsed.data;

  const outcome: WriteOutcome = await withOrg(ctx.orgId, async (tx) => {
    const existing = (
      await tx.select({ id: experiments.id }).from(experiments).where(eq(experiments.key, d.key)).limit(1)
    )[0];
    if (existing) return "conflict" as const;

    const [flag] = await tx
      .select({ id: flags.id })
      .from(flags)
      .where(eq(flags.key, d.flag))
      .limit(1);
    if (!flag) return { error: `Flag "${d.flag}" does not exist.` } as const;

    const [envRow] = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(eq(environments.key, d.environment))
      .limit(1);
    if (!envRow) return { error: `Environment "${d.environment}" does not exist.` } as const;

    // Validate the control variant belongs to the flag, if supplied.
    if (d.controlVariantKey) {
      const [v] = await tx
        .select({ id: flagVariants.id })
        .from(flagVariants)
        .where(and(eq(flagVariants.flagId, flag.id), eq(flagVariants.key, d.controlVariantKey)))
        .limit(1);
      if (!v)
        return { error: `Variant "${d.controlVariantKey}" is not a variant of flag "${d.flag}".` } as const;
    }

    const [row] = await tx
      .insert(experiments)
      .values({
        organizationId: ctx.orgId,
        key: d.key,
        name: d.name,
        hypothesis: d.hypothesis ?? null,
        flagId: flag.id,
        environmentId: envRow.id,
        status: "draft",
        controlVariantKey: d.controlVariantKey ?? null,
        allocation: d.allocation,
        bucketBy: d.bucketBy ?? null,
        confidenceLevel: d.confidenceLevel,
        sequential: d.sequential,
        correction: d.correction,
        cuped: d.cuped,
        createdByUserId: ctx.actorUserId ?? null,
      })
      .returning();

    const applied = await applyMetrics(tx, ctx.orgId, row!.id, d.metrics);
    if (applied === "missing") return { error: "One or more metrics do not exist." } as const;
    if (applied.primaryMetricId) {
      await tx
        .update(experiments)
        .set({ primaryMetricId: applied.primaryMetricId })
        .where(eq(experiments.id, row!.id));
      row!.primaryMetricId = applied.primaryMetricId;
    }

    return { hydrated: await hydrate(tx, ctx.orgId, row!) };
  });

  if (outcome === "conflict")
    return jsonError(c, 409, `An experiment named "${d.key}" already exists.`);
  if ("error" in outcome) return jsonError(c, 422, outcome.error);
  return c.json({ experiment: outcome.hydrated.serialized }, 201);
});

experiments_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const list = await withOrg(ctx.orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(experiments)
      .where(eq(experiments.organizationId, ctx.orgId))
      .orderBy(desc(experiments.createdAt));
    return Promise.all(rows.map((r) => hydrate(tx, ctx.orgId, r)));
  });
  return c.json(list.map((h) => h.serialized));
});

experiments_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const loaded = await withOrg(ctx.orgId, (tx) => loadByKey(tx, ctx.orgId, key));
  if (!loaded) return jsonError(c, 404, "Experiment not found.");
  return c.json({ experiment: loaded.serialized });
});

experiments_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateExperiment.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const key = c.req.param("key") ?? "";

  const outcome: EditOutcome = await withOrg(ctx.orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(experiments)
      .where(and(eq(experiments.organizationId, ctx.orgId), eq(experiments.key, key)))
      .limit(1);
    if (!existing) return null;
    // Validate a new control variant against the flag.
    if (parsed.data.controlVariantKey) {
      const [v] = await tx
        .select({ id: flagVariants.id })
        .from(flagVariants)
        .where(
          and(
            eq(flagVariants.flagId, existing.flagId),
            eq(flagVariants.key, parsed.data.controlVariantKey),
          ),
        )
        .limit(1);
      if (!v) return { error: `Variant "${parsed.data.controlVariantKey}" is not a variant of this flag.` } as const;
    }
    const [updated] = await tx
      .update(experiments)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.hypothesis !== undefined ? { hypothesis: parsed.data.hypothesis } : {}),
        ...(parsed.data.controlVariantKey !== undefined
          ? { controlVariantKey: parsed.data.controlVariantKey }
          : {}),
        ...(parsed.data.allocation !== undefined ? { allocation: parsed.data.allocation } : {}),
        ...(parsed.data.bucketBy !== undefined ? { bucketBy: parsed.data.bucketBy } : {}),
        ...(parsed.data.confidenceLevel !== undefined ? { confidenceLevel: parsed.data.confidenceLevel } : {}),
        ...(parsed.data.sequential !== undefined ? { sequential: parsed.data.sequential } : {}),
        ...(parsed.data.correction !== undefined ? { correction: parsed.data.correction } : {}),
        ...(parsed.data.cuped !== undefined ? { cuped: parsed.data.cuped } : {}),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, existing.id))
      .returning();
    return { hydrated: await hydrate(tx, ctx.orgId, updated!) };
  });
  if (!outcome) return jsonError(c, 404, "Experiment not found.");
  if ("error" in outcome) return jsonError(c, 422, outcome.error);
  return c.json({ experiment: outcome.hydrated.serialized });
});

experiments_.put("/:key/metrics", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = setMetrics.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const key = c.req.param("key") ?? "";

  const outcome: EditOutcome = await withOrg(ctx.orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(experiments)
      .where(and(eq(experiments.organizationId, ctx.orgId), eq(experiments.key, key)))
      .limit(1);
    if (!existing) return null;
    const applied = await applyMetrics(tx, ctx.orgId, existing.id, parsed.data.metrics);
    if (applied === "missing") return { error: "One or more metrics do not exist." } as const;
    await tx
      .update(experiments)
      .set({ primaryMetricId: applied.primaryMetricId, updatedAt: new Date() })
      .where(eq(experiments.id, existing.id));
    const [fresh] = await tx.select().from(experiments).where(eq(experiments.id, existing.id)).limit(1);
    return { hydrated: await hydrate(tx, ctx.orgId, fresh!) };
  });
  if (!outcome) return jsonError(c, 404, "Experiment not found.");
  if ("error" in outcome) return jsonError(c, 422, outcome.error);
  return c.json({ experiment: outcome.hydrated.serialized });
});

/** Shared lifecycle transition handler. */
function lifecycle(action: "start" | "stop") {
  return async (c: Context) => {
    const ctx = await resolveOrg(c);
    if (ctx instanceof Response) return ctx;
    const key = c.req.param("key") ?? "";
    const loaded = await withOrg(ctx.orgId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(experiments)
        .where(and(eq(experiments.organizationId, ctx.orgId), eq(experiments.key, key)))
        .limit(1);
      if (!existing) return null;
      const patch =
        action === "start"
          ? { status: "running" as const, startedAt: existing.startedAt ?? new Date() }
          : { status: "stopped" as const, stoppedAt: new Date() };
      const [updated] = await tx
        .update(experiments)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(experiments.id, existing.id))
        .returning();
      return hydrate(tx, ctx.orgId, updated!);
    });
    if (!loaded) return jsonError(c, 404, "Experiment not found.");
    return c.json({ experiment: loaded.serialized });
  };
}

experiments_.post("/:key/start", lifecycle("start"));
experiments_.post("/:key/stop", lifecycle("stop"));

experiments_.post("/:key/decide", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = decideBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const key = c.req.param("key") ?? "";
  const loaded = await withOrg(ctx.orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(experiments)
      .where(and(eq(experiments.organizationId, ctx.orgId), eq(experiments.key, key)))
      .limit(1);
    if (!existing) return null;
    const [updated] = await tx
      .update(experiments)
      .set({
        decision: parsed.data.decision,
        ...(parsed.data.stop && existing.status === "running"
          ? { status: "stopped" as const, stoppedAt: existing.stoppedAt ?? new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, existing.id))
      .returning();
    return hydrate(tx, ctx.orgId, updated!);
  });
  if (!loaded) return jsonError(c, 404, "Experiment not found.");
  return c.json({ experiment: loaded.serialized });
});

experiments_.get("/:key/diagnostics", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const diag = await experimentDiagnostics(ctx.orgId, key);
  if (!diag) return jsonError(c, 404, "Experiment not found.");
  return c.json(diag);
});

experiments_.get("/:key/results", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const expId = await withOrg(ctx.orgId, (tx) =>
    tx
      .select({ id: experiments.id })
      .from(experiments)
      .where(and(eq(experiments.organizationId, ctx.orgId), eq(experiments.key, key)))
      .limit(1)
      .then((r) => r[0]?.id),
  );
  if (!expId) return jsonError(c, 404, "Experiment not found.");
  const results = await analyzeExperiment(ctx.orgId, expId);
  if (!results) return jsonError(c, 404, "Experiment not found.");
  return c.json({
    experimentId: results.experimentId,
    status: results.status,
    controlVariantKey: results.controlVariantKey,
    totalUnits: results.totalUnits,
    retentionDays: results.retentionDays,
    analysisConfig: results.analysisConfig,
    power: results.power,
    metrics: results.metrics.map((m) => ({
      metricKey: m.metricKey,
      metricName: m.metricName,
      metricType: m.metricType,
      role: m.role,
      direction: m.direction,
      analysis: m.analysis,
    })),
  });
});

experiments_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key") ?? "";
  const deleted = await withOrg(ctx.orgId, (tx) =>
    tx.delete(experiments).where(eq(experiments.key, key)).returning({ id: experiments.id }),
  );
  if (deleted.length === 0) return jsonError(c, 404, "Experiment not found.");
  return c.json({ ok: true });
});
