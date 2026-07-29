import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import type { TenantTx } from "../../db/tenant.js";
import {
  environments,
  flagEnvironments,
  flagRules,
  flagVariants,
  flags,
  segments,
} from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg } from "../../lib/org-context.js";
import { recordRevision } from "../../flags/revisions.js";
import { describeRule, diffRuleDescriptions } from "../../flags/describe.js";
import {
  conditionsSchema,
  segmentKeysInConditions,
  serveSchema,
  variantKeysInServe,
  type ConditionsInput,
  type ServeInput,
} from "../../flags/schemas.js";
import type { JsonValue, Predicate, Serve } from "../../flags/types.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Targeting rules within a flag's environment. Mounted (via flags.route) at
 * /v1/orgs/:org/flags/:key/environments/:envKey/rules.
 *
 * Rules are ordered by `priority` (lowest first) and the eval engine serves the
 * first match. Writes validate that every referenced variant exists on the flag
 * and every referenced segment exists in the org, so a rule can never point at
 * something the engine can't resolve.
 */
export const rules_ = new Hono();
rules_.use("*", authContext);

// Config is frozen on an archived flag (it still evaluates, but can't change).
const ARCHIVED_MESSAGE = "This flag is archived. Restore it before editing.";

const createRule = z.object({
  description: z.string().max(500).nullish(),
  conditions: conditionsSchema.default([]),
  serve: serveSchema,
  priority: z.number().int().min(0).optional(),
});

const updateRule = z
  .object({
    description: z.string().max(500).nullish(),
    conditions: conditionsSchema.optional(),
    serve: serveSchema.optional(),
    priority: z.number().int().min(0).optional(),
  })
  .strict();

const reorder = z.object({ ruleIds: z.array(z.string().uuid()).max(200) });

const replaceRules = z.object({
  rules: z
    .array(
      z.object({
        description: z.string().max(500).nullish(),
        conditions: conditionsSchema.default([]),
        serve: serveSchema,
      }),
    )
    .max(200),
});

// --- OpenAPI registration ----------------------------------------------------
const RULES_TAG = "Targeting rules";
const ruleParams = {
  org: "The organization slug.",
  key: "The flag key.",
  envKey: "The environment key (e.g. production, preview, development).",
  ruleId: "The targeting rule id.",
};
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};
const RULES_BASE = "/v1/orgs/{org}/flags/{key}/environments/{envKey}/rules";

registerRoute({
  method: "post",
  path: RULES_BASE,
  summary: "Create a targeting rule",
  description:
    "Append a targeting rule to a flag's environment. Rules serve in priority order (lowest first).",
  tags: [RULES_TAG],
  auth: true,
  paramDescriptions: ruleParams,
  request: { body: createRule },
  responses: {
    201: { description: "The rule was created.", schemaName: "RuleResponse" },
    404: { description: "No such flag or environment." },
    409: { description: "The flag is archived; restore it before editing." },
    422: {
      description:
        "The submitted data failed validation, or references an unknown variant or segment.",
    },
    429: WRITE_429,
  },
});

registerRoute({
  method: "put",
  path: RULES_BASE,
  summary: "Replace all targeting rules",
  description:
    "Replace the environment's entire ordered rule set in one atomic transaction, recorded as a single revision.",
  tags: [RULES_TAG],
  auth: true,
  paramDescriptions: ruleParams,
  request: { body: replaceRules },
  responses: {
    200: { description: "The replaced rule set.", schemaName: "RuleListResponse" },
    404: { description: "No such flag or environment." },
    409: { description: "The flag is archived; restore it before editing." },
    422: {
      description:
        "The submitted data failed validation, or references an unknown variant or segment.",
    },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: RULES_BASE,
  summary: "List targeting rules",
  description: "List the flag's targeting rules for an environment, in priority order.",
  tags: [RULES_TAG],
  auth: true,
  paramDescriptions: ruleParams,
  responses: {
    200: { description: "The environment's targeting rules.", schemaName: "RuleListResponse" },
    404: { description: "No such flag or environment." },
  },
});

registerRoute({
  method: "patch",
  path: `${RULES_BASE}/{ruleId}`,
  summary: "Update a rule",
  description: "Edit a single targeting rule's description, conditions, serve, or priority.",
  tags: [RULES_TAG],
  auth: true,
  paramDescriptions: ruleParams,
  request: { body: updateRule },
  responses: {
    200: { description: "The updated rule.", schemaName: "RuleResponse" },
    404: { description: "No such flag, environment, or rule." },
    409: { description: "The flag is archived; restore it before editing." },
    422: {
      description:
        "The submitted data failed validation, or references an unknown variant or segment.",
    },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: `${RULES_BASE}/{ruleId}`,
  summary: "Delete a rule",
  description: "Remove a single targeting rule from a flag's environment.",
  tags: [RULES_TAG],
  auth: true,
  paramDescriptions: ruleParams,
  responses: {
    200: { description: "The rule was deleted.", schemaName: "DeleteAck" },
    404: { description: "No such flag, environment, or rule." },
    409: { description: "The flag is archived; restore it before editing." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "post",
  path: `${RULES_BASE}/reorder`,
  summary: "Reorder rules",
  description: "Set the priority order of the environment's rules from an ordered list of rule ids.",
  tags: [RULES_TAG],
  auth: true,
  paramDescriptions: ruleParams,
  request: { body: reorder },
  responses: {
    200: { description: "The rules were reordered.", schemaName: "DeleteAck" },
    404: { description: "No such flag or environment." },
    409: { description: "The flag is archived; restore it before editing." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

type Resolved =
  | { kind: "ok"; flag: typeof flags.$inferSelect; fe: typeof flagEnvironments.$inferSelect }
  | { kind: "no-flag" }
  | { kind: "no-env" };

async function resolveFlagEnv(
  tx: TenantTx,
  flagKey: string,
  envKey: string,
): Promise<Resolved> {
  const flag = (
    await tx.select().from(flags).where(eq(flags.key, flagKey)).limit(1)
  )[0];
  if (!flag) return { kind: "no-flag" };
  const env = (
    await tx.select().from(environments).where(eq(environments.key, envKey)).limit(1)
  )[0];
  if (!env) return { kind: "no-env" };
  const fe = (
    await tx
      .select()
      .from(flagEnvironments)
      .where(
        and(
          eq(flagEnvironments.flagId, flag.id),
          eq(flagEnvironments.environmentId, env.id),
        ),
      )
      .limit(1)
  )[0];
  if (!fe) return { kind: "no-env" };
  return { kind: "ok", flag, fe };
}

/** Verify every variant/segment a rule references actually exists. */
async function badReference(
  tx: TenantTx,
  flagId: string,
  conditions: ConditionsInput,
  serve: ServeInput,
): Promise<string | null> {
  const variantRows = await tx
    .select({ key: flagVariants.key })
    .from(flagVariants)
    .where(eq(flagVariants.flagId, flagId));
  const known = new Set(variantRows.map((v) => v.key));
  for (const key of variantKeysInServe(serve)) {
    if (!known.has(key)) return `Unknown variant "${key}" on this flag.`;
  }

  const segKeys = segmentKeysInConditions(conditions);
  if (segKeys.length) {
    const segRows = await tx
      .select({ key: segments.key })
      .from(segments)
      .where(inArray(segments.key, segKeys));
    const knownSegs = new Set(segRows.map((s) => s.key));
    for (const key of segKeys) {
      if (!knownSegs.has(key)) return `Unknown segment "${key}".`;
    }
  }
  return null;
}

/** A `variantKey -> display label` function for describing a flag's rules. */
async function variantLabeler(
  tx: TenantTx,
  flagId: string,
): Promise<(key: string) => string> {
  const rows = await tx
    .select({ key: flagVariants.key, label: flagVariants.label })
    .from(flagVariants)
    .where(eq(flagVariants.flagId, flagId));
  const labelByKey = new Map(rows.map((v) => [v.key, v.label]));
  return (key: string) => labelByKey.get(key) || key;
}

function serialize(r: typeof flagRules.$inferSelect) {
  return {
    id: r.id,
    priority: r.priority,
    description: r.description,
    conditions: r.conditions,
    serve: r.serve,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// --- Response component schemas ----------------------------------------------
const ruleSchema = z.object({
  id: z.string(),
  priority: z.number(),
  description: z.string().nullable(),
  conditions: z.unknown(),
  serve: z.unknown(),
  createdAt: z.string().describe("ISO 8601 timestamp"),
  updatedAt: z.string().describe("ISO 8601 timestamp"),
});
registerComponentSchema("Rule", ruleSchema);
registerComponentSchema("RuleResponse", z.object({ rule: ruleSchema }));
registerComponentSchema("RuleListResponse", z.array(ruleSchema));

/** Map a non-ok resolution to a 404 response. */
function resolveError(c: Context, kind: "no-flag" | "no-env"): Response {
  return kind === "no-flag"
    ? jsonError(c, 404, "Flag not found.")
    : jsonError(c, 404, "Environment not found for this flag.");
}

const params = (c: Context) => ({
  flagKey: c.req.param("key") ?? "",
  envKey: c.req.param("envKey") ?? "",
  ruleId: c.req.param("ruleId") ?? "",
});

// --- Create ------------------------------------------------------------------
rules_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = createRule.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { flagKey, envKey } = params(c);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const resolved = await resolveFlagEnv(tx, flagKey, envKey);
    if (resolved.kind !== "ok") return resolved;
    if (resolved.flag.archivedAt) return { kind: "archived" as const };

    const refError = await badReference(
      tx,
      resolved.flag.id,
      parsed.data.conditions,
      parsed.data.serve,
    );
    if (refError) return { kind: "bad-ref" as const, message: refError };

    let priority = parsed.data.priority;
    if (priority === undefined) {
      const top = (
        await tx
          .select({ p: flagRules.priority })
          .from(flagRules)
          .where(eq(flagRules.flagEnvironmentId, resolved.fe.id))
          .orderBy(desc(flagRules.priority))
          .limit(1)
      )[0];
      priority = top ? top.p + 1 : 0;
    }

    const [row] = await tx
      .insert(flagRules)
      .values({
        organizationId: ctx.orgId,
        flagEnvironmentId: resolved.fe.id,
        priority,
        description: parsed.data.description ?? null,
        conditions: parsed.data.conditions as JsonValue,
        serve: parsed.data.serve as JsonValue,
      })
      .returning();

    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: resolved.flag.id,
      actorUserId: ctx.actorUserId,
      action: "rule_created",
      summary: `Added a targeting rule to ${envKey}`,
    });
    return { kind: "ok" as const, row };
  });

  if (outcome.kind === "bad-ref") return jsonError(c, 422, outcome.message);
  if (outcome.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome.kind !== "ok") return resolveError(c, outcome.kind);
  return c.json({ rule: serialize(outcome.row) }, 201);
});

// --- Replace (edit the whole ordered set at once) ----------------------------
// The console's rule editor works on all rules at once, Statsig-style, then
// saves. This replaces the environment's entire rule set in one transaction so
// a multi-rule edit (add/remove/reorder/change) is atomic and lands as a single
// revision, never a half-applied mix.
rules_.put("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = replaceRules.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { flagKey, envKey } = params(c);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const resolved = await resolveFlagEnv(tx, flagKey, envKey);
    if (resolved.kind !== "ok") return resolved;
    if (resolved.flag.archivedAt) return { kind: "archived" as const };

    for (const r of parsed.data.rules) {
      const refError = await badReference(tx, resolved.flag.id, r.conditions, r.serve);
      if (refError) return { kind: "bad-ref" as const, message: refError };
    }

    // Snapshot the rules before they're replaced, so the revision can show what
    // was added, removed, or reordered (described the way the console reads).
    const label = await variantLabeler(tx, resolved.flag.id);
    const oldRules = await tx
      .select()
      .from(flagRules)
      .where(eq(flagRules.flagEnvironmentId, resolved.fe.id))
      .orderBy(asc(flagRules.priority));
    const before = oldRules.map((r) =>
      describeRule(r.conditions as Predicate[], r.serve as Serve, label),
    );
    const after = parsed.data.rules.map((r) =>
      describeRule(r.conditions as Predicate[], r.serve as Serve, label),
    );

    await tx.delete(flagRules).where(eq(flagRules.flagEnvironmentId, resolved.fe.id));
    if (parsed.data.rules.length) {
      await tx.insert(flagRules).values(
        parsed.data.rules.map((r, index) => ({
          organizationId: ctx.orgId,
          flagEnvironmentId: resolved.fe.id,
          priority: index,
          description: r.description ?? null,
          conditions: r.conditions as JsonValue,
          serve: r.serve as JsonValue,
        })),
      );
    }

    const rows = await tx
      .select()
      .from(flagRules)
      .where(eq(flagRules.flagEnvironmentId, resolved.fe.id))
      .orderBy(asc(flagRules.priority));

    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: resolved.flag.id,
      actorUserId: ctx.actorUserId,
      action: "rules_updated",
      summary: `Updated targeting rules in ${envKey}`,
      diff: { changes: diffRuleDescriptions(before, after) } as JsonValue,
    });
    return { kind: "ok" as const, rows };
  });

  if (outcome.kind === "bad-ref") return jsonError(c, 422, outcome.message);
  if (outcome.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome.kind !== "ok") return resolveError(c, outcome.kind);
  return c.json(outcome.rows.map(serialize));
});

// --- List --------------------------------------------------------------------
rules_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const { flagKey, envKey } = params(c);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const resolved = await resolveFlagEnv(tx, flagKey, envKey);
    if (resolved.kind !== "ok") return resolved;
    const rows = await tx
      .select()
      .from(flagRules)
      .where(eq(flagRules.flagEnvironmentId, resolved.fe.id))
      .orderBy(asc(flagRules.priority));
    return { kind: "ok" as const, rows };
  });

  if (outcome.kind !== "ok") return resolveError(c, outcome.kind);
  return c.json(outcome.rows.map(serialize));
});

// --- Update ------------------------------------------------------------------
rules_.patch("/:ruleId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateRule.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { flagKey, envKey, ruleId } = params(c);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const resolved = await resolveFlagEnv(tx, flagKey, envKey);
    if (resolved.kind !== "ok") return resolved;
    if (resolved.flag.archivedAt) return { kind: "archived" as const };

    const rule = (
      await tx
        .select()
        .from(flagRules)
        .where(
          and(
            eq(flagRules.id, ruleId),
            eq(flagRules.flagEnvironmentId, resolved.fe.id),
          ),
        )
        .limit(1)
    )[0];
    if (!rule) return { kind: "no-rule" as const };

    const conditions = parsed.data.conditions ?? (rule.conditions as ConditionsInput);
    const serve = parsed.data.serve ?? (rule.serve as ServeInput);
    const refError = await badReference(tx, resolved.flag.id, conditions, serve);
    if (refError) return { kind: "bad-ref" as const, message: refError };

    const [row] = await tx
      .update(flagRules)
      .set({
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.conditions !== undefined
          ? { conditions: parsed.data.conditions as JsonValue }
          : {}),
        ...(parsed.data.serve !== undefined
          ? { serve: parsed.data.serve as JsonValue }
          : {}),
        ...(parsed.data.priority !== undefined
          ? { priority: parsed.data.priority }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(flagRules.id, rule.id))
      .returning();

    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: resolved.flag.id,
      actorUserId: ctx.actorUserId,
      action: "rule_updated",
      summary: `Updated a targeting rule in ${envKey}`,
    });
    return { kind: "ok" as const, row };
  });

  if (outcome.kind === "bad-ref") return jsonError(c, 422, outcome.message);
  if (outcome.kind === "no-rule") return jsonError(c, 404, "Rule not found.");
  if (outcome.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome.kind !== "ok") return resolveError(c, outcome.kind);
  return c.json({ rule: serialize(outcome.row) });
});

// --- Delete ------------------------------------------------------------------
rules_.delete("/:ruleId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const { flagKey, envKey, ruleId } = params(c);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const resolved = await resolveFlagEnv(tx, flagKey, envKey);
    if (resolved.kind !== "ok") return resolved;
    if (resolved.flag.archivedAt) return { kind: "archived" as const };
    const deleted = await tx
      .delete(flagRules)
      .where(
        and(
          eq(flagRules.id, ruleId),
          eq(flagRules.flagEnvironmentId, resolved.fe.id),
        ),
      )
      .returning({ id: flagRules.id });
    if (deleted.length === 0) return { kind: "no-rule" as const };
    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: resolved.flag.id,
      actorUserId: ctx.actorUserId,
      action: "rule_deleted",
      summary: `Removed a targeting rule from ${envKey}`,
    });
    return { kind: "ok" as const };
  });

  if (outcome.kind === "no-rule") return jsonError(c, 404, "Rule not found.");
  if (outcome.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome.kind !== "ok") return resolveError(c, outcome.kind);
  return c.json({ ok: true });
});

// --- Reorder -----------------------------------------------------------------
rules_.post("/reorder", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = reorder.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { flagKey, envKey } = params(c);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const resolved = await resolveFlagEnv(tx, flagKey, envKey);
    if (resolved.kind !== "ok") return resolved;
    if (resolved.flag.archivedAt) return { kind: "archived" as const };
    await Promise.all(
      parsed.data.ruleIds.map((id, index) =>
        tx
          .update(flagRules)
          .set({ priority: index, updatedAt: new Date() })
          .where(
            and(
              eq(flagRules.id, id),
              eq(flagRules.flagEnvironmentId, resolved.fe.id),
            ),
          ),
      ),
    );
    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: resolved.flag.id,
      actorUserId: ctx.actorUserId,
      action: "rules_reordered",
      summary: `Reordered targeting rules in ${envKey}`,
    });
    return { kind: "ok" as const };
  });

  if (outcome.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome.kind !== "ok") return resolveError(c, outcome.kind);
  return c.json({ ok: true });
});
