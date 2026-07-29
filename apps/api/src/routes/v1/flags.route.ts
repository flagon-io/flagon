import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import type { TenantTx } from "../../db/tenant.js";
import { db } from "../../db/client.js";
import {
  environments,
  flagEnvironments,
  flagRevisions,
  flagRules,
  flagVariants,
  flags,
} from "../../db/schema.js";
import { users } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { invalidateEvalCacheOnWrite } from "../../lib/eval-invalidate.js";
import { ensureEnvironments } from "../../flags/environments.js";
import { recordRevision } from "../../flags/revisions.js";
import { flagUsage, flagUsageSummaries, type FlagUsageSummary } from "../../flags/usage.js";
import { planVariants } from "../../flags/seed.js";
import type { JsonValue } from "../../flags/types.js";
import { serveSchema, variantKeysInServe } from "../../flags/schemas.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { rules_ } from "./rules.route.js";
import { variants_ } from "./variants.route.js";

/**
 * Flag management. Mounted under /v1/orgs/:org/flags; every handler resolves +
 * authorizes the org, then does all its work inside withOrg() so RLS scopes the
 * data. Mutations append a flag_revision so the audit trail is always complete.
 *
 * This is the write side of API-first parity: the console UI drives exactly
 * these endpoints, so there is one implementation of "create a flag", not two.
 */
export const flags_ = new Hono();

// Archived flags still evaluate but their configuration is frozen: any config
// write is rejected until the flag is restored (409, so the UI can surface it).
export const ARCHIVED_MESSAGE =
  "This flag is archived. Restore it before editing.";

flags_.use("*", authContext);
// A successful flag/variant/rule write invalidates the org's eval-cache entry so
// changes go live at once (covers the nested variants/rules routers too).
flags_.use("*", invalidateEvalCacheOnWrite);

// Nested sub-resources of a flag. Params (org, key, envKey) propagate down.
flags_.route("/:key/variants", variants_);
flags_.route("/:key/environments/:envKey/rules", rules_);

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

const flagType = z.enum(["boolean", "string", "number", "json"]);

const variantInput = z.object({
  value: z.unknown(),
  label: z.string().max(120).nullish(),
});

const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(50);

const createFlag = z.object({
  slug,
  description: z.string().max(2000).nullish(),
  type: flagType.default("boolean"),
  variants: z.array(variantInput).max(64).optional(),
  tags: tagsSchema.optional(),
});

const updateFlag = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    maintainerUserId: z.string().uuid().nullish(),
    permanent: z.boolean().optional(),
    tags: tagsSchema.optional(),
  })
  .strict();

const envConfig = z
  .object({
    enabled: z.boolean().optional(),
    defaultVariantKey: z.string().optional(),
    offVariantKey: z.string().optional(),
    // The default "serve" when enabled and no rule matches: a single variant or a
    // percentage rollout. A single-variant serve is mirrored to defaultVariantId
    // and clears the rollout; a rollout is stored as default_serve.
    defaultServe: serveSchema.optional(),
  })
  .strict();

// --- OpenAPI registration ----------------------------------------------------
// Every handler below is also declared here so it appears in GET /openapi.json
// and the root index. Path params are derived from the path; request bodies
// reuse the same zod schemas the handlers validate against.
const FLAGS_TAG = "Flags";
const flagParams = {
  org: "The organization slug.",
  key: "The flag key.",
  envKey: "The environment key (e.g. production, preview, development).",
};
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

// A representative create response body, shown inline by API viewers.
const FLAG_CREATE_EXAMPLE = {
  flag: {
    id: "b3f1c2e4-5a6b-4c8d-9e0f-1a2b3c4d5e6f",
    key: "new-checkout",
    name: "new-checkout",
    description: "Roll out the redesigned checkout flow.",
    type: "boolean",
    permanent: false,
    tags: ["checkout", "growth"],
    maintainerUserId: null,
    createdByUserId: "a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d",
    archivedAt: null,
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
  },
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/flags",
  summary: "Create a flag",
  description:
    "Create a flag. Flags are created disabled in every environment; enable them per environment afterwards.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  request: { body: createFlag },
  responses: {
    201: {
      description: "The flag was created.",
      schemaName: "FlagResponse",
      example: FLAG_CREATE_EXAMPLE,
    },
    409: { description: "A flag with that key already exists." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/flags",
  summary: "List flags",
  description: "List every flag in the organization with its per-environment configuration.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  responses: {
    200: { description: "The organization's flags.", schemaName: "FlagListResponse" },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/flags/{key}",
  summary: "Get a flag",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  responses: {
    200: {
      description: "The flag and its configuration.",
      schemaName: "FlagDetailResponse",
    },
    404: { description: "No flag with that key." },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/flags/{key}/usage",
  summary: "Get flag usage",
  description: "Evaluation counts and recency for the flag, per environment.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  responses: {
    200: { description: "Usage summary for the flag.", schemaName: "FlagUsageResponse" },
    404: { description: "No flag with that key." },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/flags/{key}",
  summary: "Update a flag",
  description: "Edit flag metadata: name, description, maintainer, permanence, and tags.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  request: { body: updateFlag },
  responses: {
    200: { description: "The updated flag.", schemaName: "FlagResponse" },
    404: { description: "No flag with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/flags/{key}/archive",
  summary: "Archive a flag",
  description:
    "Retire a flag. It disappears from the active list but keeps evaluating, so existing clients never break.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  responses: {
    200: { description: "The flag was archived.", schemaName: "FlagResponse" },
    404: { description: "No flag with that key." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/flags/{key}/restore",
  summary: "Restore a flag",
  description: "Return an archived flag to the active list so its configuration can be edited again.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  responses: {
    200: { description: "The flag was restored.", schemaName: "FlagResponse" },
    404: { description: "No flag with that key." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/flags/{key}",
  summary: "Delete a flag",
  description: "Permanently delete a flag. Evaluation of the key stops, so remove all references first.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  responses: {
    200: { description: "The flag was deleted.", schemaName: "DeleteAck" },
    404: { description: "No flag with that key." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/flags/{key}/environments/{envKey}",
  summary: "Configure a flag in an environment",
  description:
    "Set the on/off state, the default variant or rollout, and the off variant for a flag in one environment.",
  tags: [FLAGS_TAG],
  auth: true,
  paramDescriptions: flagParams,
  request: { body: envConfig },
  responses: {
    200: { description: "The updated environment configuration.", schemaName: "DeleteAck" },
    404: { description: "No such flag or environment." },
    409: { description: "The flag is archived; restore it before editing." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

/** Reject variant values that don't match the flag's declared type. */
function variantTypeError(
  type: z.infer<typeof flagType>,
  variants: { value: unknown }[],
): string | null {
  if (type === "boolean") return null;
  if (variants.length === 0) return "At least one variant is required.";
  for (const v of variants) {
    if (type === "string" && typeof v.value !== "string") {
      return "Every variant value must be a string.";
    }
    if (type === "number" && typeof v.value !== "number") {
      return "Every variant value must be a number.";
    }
    if (type === "json" && (typeof v.value !== "object" || v.value === null)) {
      return "Every variant value must be a JSON object or array.";
    }
  }
  return null;
}

function serializeFlag(f: typeof flags.$inferSelect) {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    type: f.type,
    permanent: f.permanent,
    tags: f.tags,
    maintainerUserId: f.maintainerUserId,
    createdByUserId: f.createdByUserId,
    archivedAt: f.archivedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// --- Response component schemas ----------------------------------------------
// Registered success shapes for the routes above, mirroring serializeFlag and
// the exact enveloped bodies each handler returns.
const flagSchema = registerComponentSchema(
  "Flag",
  z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: flagType,
    permanent: z.boolean(),
    tags: z.array(z.string()),
    maintainerUserId: z.string().nullable(),
    createdByUserId: z.string().nullable(),
    archivedAt: z.string().nullable().describe("ISO 8601 timestamp"),
    createdAt: z.string().describe("ISO 8601 timestamp"),
    updatedAt: z.string().describe("ISO 8601 timestamp"),
  }),
);

registerComponentSchema("FlagResponse", z.object({ flag: flagSchema }));

// The one shared "{ ok: true }" acknowledgement returned by deletes and other
// content-free mutations. Registered here and referenced by name elsewhere.
registerComponentSchema("DeleteAck", z.object({ ok: z.boolean() }));

// The compact per-flag usage rollup embedded in the list (see FlagUsageSummary).
const flagUsageSummarySchema = z.object({
  total: z.number(),
  checksPerHour: z.number(),
  lastSeenAt: z.string().nullable().describe("ISO 8601 timestamp"),
  series: z.array(z.number()),
});

// The list embeds each flag's current Production value, resolved people names,
// and a usage summary alongside the base flag fields.
registerComponentSchema(
  "FlagListResponse",
  z.array(
    flagSchema.extend({
      value: z.unknown(),
      createdByName: z.string().nullable(),
      maintainerName: z.string().nullable(),
      usage: flagUsageSummarySchema.nullable(),
    }),
  ),
);

// The detail view returns the flag (with resolved people names) plus its recent
// revisions, variants, and per-environment configuration with targeting rules.
registerComponentSchema(
  "FlagDetailResponse",
  z.object({
    flag: flagSchema.extend({
      createdByName: z.string().nullable(),
      maintainerName: z.string().nullable(),
    }),
    revisions: z.array(
      z.object({
        id: z.string(),
        action: z.string(),
        summary: z.string().nullable(),
        changes: z.array(z.string()),
        userName: z.string().nullable(),
        createdAt: z.string().describe("ISO 8601 timestamp"),
      }),
    ),
    variants: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        value: z.unknown(),
        label: z.string().nullable(),
        sortOrder: z.number(),
      }),
    ),
    environments: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        defaultVariantKey: z.string().nullable(),
        defaultServe: z.unknown(),
        offVariantKey: z.string().nullable(),
        rules: z.array(
          z.object({
            id: z.string(),
            priority: z.number(),
            description: z.string().nullable(),
            conditions: z.unknown(),
            serve: z.unknown(),
          }),
        ),
      }),
    ),
  }),
);

// Per-environment evaluation usage (see FlagUsage / flagUsage()).
registerComponentSchema(
  "FlagUsageResponse",
  z.object({
    usage: z.object({
      total: z.number(),
      lastSeenAt: z.string().nullable().describe("ISO 8601 timestamp"),
      environments: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          total: z.number(),
          lastSeenAt: z.string().nullable().describe("ISO 8601 timestamp"),
          variants: z.array(z.object({ key: z.string(), count: z.number() })),
          series: z.array(z.object({ day: z.string(), count: z.number() })),
        }),
      ),
    }),
  }),
);

async function loadFlag(tx: TenantTx, key: string) {
  return (
    await tx.select().from(flags).where(eq(flags.key, key)).limit(1)
  )[0];
}

/** Pull the human-readable change lines out of a revision's stored diff. */
function revisionChanges(diff: unknown): string[] {
  if (diff && typeof diff === "object" && "changes" in diff) {
    const changes = (diff as { changes: unknown }).changes;
    if (Array.isArray(changes)) return changes.filter((c): c is string => typeof c === "string");
  }
  return [];
}

function quote(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (s === "") return "empty";
  return `"${s.length > 60 ? `${s.slice(0, 57)}...` : s}"`;
}

/**
 * Field-level "from -> to" change lines for a metadata edit, so the revision log
 * shows exactly what moved (maintainer names resolved, tags added/removed).
 */
async function metaChanges(
  tx: TenantTx,
  before: typeof flags.$inferSelect,
  patch: z.infer<typeof updateFlag>,
): Promise<string[]> {
  const changes: string[] = [];

  if (patch.name !== undefined && patch.name !== before.name) {
    changes.push(`Name: ${quote(before.name)} → ${quote(patch.name)}`);
  }
  if (
    patch.description !== undefined &&
    (patch.description ?? "") !== (before.description ?? "")
  ) {
    changes.push(`Description: ${quote(before.description)} → ${quote(patch.description)}`);
  }
  if (patch.permanent !== undefined && patch.permanent !== before.permanent) {
    changes.push(patch.permanent ? "Marked as permanent" : "Unmarked as permanent");
  }
  if (patch.tags !== undefined) {
    const after = new Set(patch.tags);
    const beforeSet = new Set(before.tags ?? []);
    const added = patch.tags.filter((t) => !beforeSet.has(t));
    const removed = (before.tags ?? []).filter((t) => !after.has(t));
    if (added.length) changes.push(`Tags added: ${added.join(", ")}`);
    if (removed.length) changes.push(`Tags removed: ${removed.join(", ")}`);
  }
  if (
    patch.maintainerUserId !== undefined &&
    (patch.maintainerUserId ?? null) !== (before.maintainerUserId ?? null)
  ) {
    const ids = [before.maintainerUserId, patch.maintainerUserId].filter(
      Boolean,
    ) as string[];
    const rows = ids.length
      ? await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))
      : [];
    const nameById = new Map(rows.map((u) => [u.id, u.name]));
    const from = before.maintainerUserId
      ? (nameById.get(before.maintainerUserId) ?? "someone")
      : "none";
    const to = patch.maintainerUserId
      ? (nameById.get(patch.maintainerUserId) ?? "someone")
      : "none";
    changes.push(`Maintainer: ${from} → ${to}`);
  }

  return changes;
}

// --- Create ------------------------------------------------------------------
flags_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const parsed = createFlag.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const { type, description } = parsed.data;
  const requested = parsed.data.variants ?? [];
  const typeError = variantTypeError(type, requested);
  if (typeError) return jsonError(c, 422, typeError);

  const plan = planVariants(
    type,
    requested.map((v) => ({ value: v.value as JsonValue, label: v.label })),
  );

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    if (await loadFlag(tx, parsed.data.slug)) return "conflict" as const;

    const envs = await ensureEnvironments(tx, ctx.orgId);
    const [flag] = await tx
      .insert(flags)
      .values({
        organizationId: ctx.orgId,
        key: parsed.data.slug,
        name: parsed.data.slug,
        description: description ?? null,
        type,
        tags: parsed.data.tags ?? [],
        createdByUserId: ctx.actorUserId,
      })
      .returning();

    const variantRows = await tx
      .insert(flagVariants)
      .values(
        plan.variants.map((v) => ({
          organizationId: ctx.orgId,
          flagId: flag.id,
          key: v.key,
          value: v.value,
          label: v.label,
          sortOrder: v.sortOrder,
        })),
      )
      .returning();
    const idByKey = new Map(variantRows.map((v) => [v.key, v.id]));

    await tx.insert(flagEnvironments).values(
      envs.map((env) => ({
        organizationId: ctx.orgId,
        flagId: flag.id,
        environmentId: env.id,
        enabled: false,
        defaultVariantId: idByKey.get(plan.defaultKey) ?? null,
        offVariantId: idByKey.get(plan.offKey) ?? null,
      })),
    );

    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: flag.id,
      actorUserId: ctx.actorUserId,
      action: "created",
      summary: `Created ${type} flag "${flag.key}"`,
    });

    return { flag };
  });

  if (outcome === "conflict") {
    return jsonError(c, 409, `A flag named "${parsed.data.slug}" already exists.`);
  }
  return c.json({ flag: serializeFlag(outcome.flag) }, 201);
});

// --- List (with each flag's current Production value + creator) --------------
flags_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  // `archived`: absent/false -> active only; "true" -> everything; "only" ->
  // just the archived flags (the Archive page).
  const archived = c.req.query("archived");
  const archivedFilter =
    archived === "true"
      ? undefined
      : archived === "only"
        ? isNotNull(flags.archivedAt)
        : isNull(flags.archivedAt);

  const data = await withOrg(ctx.orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(flags)
      .where(archivedFilter)
      .orderBy(desc(flags.createdAt));
    if (rows.length === 0)
      return { rows, values: new Map<string, JsonValue>(), usage: new Map<string, FlagUsageSummary>() };

    const flagIds = rows.map((f) => f.id);
    const prod = (
      await tx.select().from(environments).where(eq(environments.key, "production")).limit(1)
    )[0];

    const values = new Map<string, JsonValue>();
    const usage = await flagUsageSummaries(tx, flagIds);
    if (prod) {
      const [fes, variants] = await Promise.all([
        tx
          .select()
          .from(flagEnvironments)
          .where(
            and(
              eq(flagEnvironments.environmentId, prod.id),
              inArray(flagEnvironments.flagId, flagIds),
            ),
          ),
        tx.select().from(flagVariants).where(inArray(flagVariants.flagId, flagIds)),
      ]);
      const valueById = new Map(variants.map((v) => [v.id, v.value as JsonValue]));
      for (const fe of fes) {
        const vid = fe.enabled ? fe.defaultVariantId : fe.offVariantId;
        if (vid && valueById.has(vid)) values.set(fe.flagId, valueById.get(vid)!);
      }
    }
    return { rows, values, usage };
  });

  // Resolve creator + maintainer names in one lookup (users is auth-layer).
  const userIds = [
    ...new Set(
      data.rows
        .flatMap((f) => [f.createdByUserId, f.maintainerUserId])
        .filter(Boolean) as string[],
    ),
  ];
  const people = userIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const nameById = new Map(people.map((u) => [u.id, u.name]));
  const nameOf = (id: string | null) => (id ? (nameById.get(id) ?? null) : null);

  return c.json(
    data.rows.map((f) => ({
      ...serializeFlag(f),
      value: data.values.get(f.id) ?? null,
      createdByName: nameOf(f.createdByUserId),
      maintainerName: nameOf(f.maintainerUserId),
      usage: data.usage.get(f.id) ?? null,
    })),
  );
});

// --- Detail (flag + variants + per-env config + rules) -----------------------
flags_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const key = c.req.param("key");
  const data = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, key);
    if (!flag) return null;

    const [variants, fes, envs] = await Promise.all([
      tx
        .select()
        .from(flagVariants)
        .where(eq(flagVariants.flagId, flag.id))
        .orderBy(flagVariants.sortOrder),
      tx.select().from(flagEnvironments).where(eq(flagEnvironments.flagId, flag.id)),
      tx.select().from(environments).orderBy(environments.sortOrder),
    ]);
    const feIds = fes.map((fe) => fe.id);
    const [rules, revisions] = await Promise.all([
      feIds.length
        ? tx
            .select()
            .from(flagRules)
            .where(inArray(flagRules.flagEnvironmentId, feIds))
            .orderBy(flagRules.priority)
        : Promise.resolve([]),
      tx
        .select()
        .from(flagRevisions)
        .where(eq(flagRevisions.flagId, flag.id))
        .orderBy(desc(flagRevisions.createdAt))
        .limit(15),
    ]);

    return { flag, variants, fes, envs, rules, revisions };
  });

  if (!data) return jsonError(c, 404, "Flag not found.");

  // Resolve the names behind the flag's people (creator, maintainer, revision
  // authors) in one lookup.
  const personIds = [
    ...new Set(
      [
        data.flag.createdByUserId,
        data.flag.maintainerUserId,
        ...data.revisions.map((r) => r.userId),
      ].filter(Boolean) as string[],
    ),
  ];
  const people = personIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, personIds))
    : [];
  const nameById = new Map(people.map((u) => [u.id, u.name]));
  const nameOf = (id: string | null) => (id ? (nameById.get(id) ?? null) : null);

  const keyOf = (id: string | null) =>
    id ? (data.variants.find((v) => v.id === id)?.key ?? null) : null;

  return c.json({
    flag: {
      ...serializeFlag(data.flag),
      createdByName: nameOf(data.flag.createdByUserId),
      maintainerName: nameOf(data.flag.maintainerUserId),
    },
    revisions: data.revisions.map((r) => ({
      id: r.id,
      action: r.action,
      summary: r.summary,
      changes: revisionChanges(r.diff),
      userName: nameOf(r.userId),
      createdAt: r.createdAt.toISOString(),
    })),
    variants: data.variants.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.value,
      label: v.label,
      sortOrder: v.sortOrder,
    })),
    environments: data.envs.map((env) => {
      const fe = data.fes.find((x) => x.environmentId === env.id);
      const rules = fe
        ? data.rules.filter((r) => r.flagEnvironmentId === fe.id)
        : [];
      return {
        key: env.key,
        name: env.name,
        enabled: fe?.enabled ?? false,
        defaultVariantKey: keyOf(fe?.defaultVariantId ?? null),
        // The default serve: a rollout when default_serve is set, else the single
        // default variant. The console renders its default ServePicker from this.
        defaultServe: fe?.defaultServe ?? null,
        offVariantKey: keyOf(fe?.offVariantId ?? null),
        rules: rules.map((r) => ({
          id: r.id,
          priority: r.priority,
          description: r.description,
          conditions: r.conditions,
          serve: r.serve,
        })),
      };
    }),
  });
});

// --- Evaluation usage --------------------------------------------------------
// Per-environment evaluation counts recorded by the OFREP endpoints. This is a
// "served" signal (what we evaluated), OFREP-native — no client SDK required.
flags_.get("/:key/usage", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";

  const usage = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, key);
    if (!flag) return null;
    return flagUsage(tx, flag.id);
  });

  if (!usage) return jsonError(c, 404, "Flag not found.");
  return c.json({ usage });
});

// --- Update metadata ---------------------------------------------------------
flags_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const parsed = updateFlag.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const key = c.req.param("key");
  const updated = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, key);
    if (!flag) return null;
    if (flag.archivedAt) return "archived" as const;

    const changes = await metaChanges(tx, flag, parsed.data);

    const [row] = await tx
      .update(flags)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(flags.id, flag.id))
      .returning();
    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: flag.id,
      actorUserId: ctx.actorUserId,
      action: "updated",
      diff: { changes } as JsonValue,
    });
    return row;
  });

  if (updated === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (!updated) return jsonError(c, 404, "Flag not found.");
  return c.json({ flag: serializeFlag(updated) });
});

// --- Archive / restore -------------------------------------------------------
function archiveRoute(action: "archive" | "restore") {
  return async (c: Context) => {
    const ctx = await resolveOrg(c);
    if (ctx instanceof Response) return ctx;

    const key = c.req.param("key") ?? "";
    const updated = await withOrg(ctx.orgId, async (tx) => {
      const flag = await loadFlag(tx, key);
      if (!flag) return null;
      const [row] = await tx
        .update(flags)
        .set({
          archivedAt: action === "archive" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(flags.id, flag.id))
        .returning();
      await recordRevision(tx, {
        organizationId: ctx.orgId,
        flagId: flag.id,
        actorUserId: ctx.actorUserId,
        action,
      });
      return row;
    });

    if (!updated) return jsonError(c, 404, "Flag not found.");
    return c.json({ flag: serializeFlag(updated) });
  };
}
flags_.post("/:key/archive", archiveRoute("archive"));
flags_.post("/:key/restore", archiveRoute("restore"));

// --- Delete (permanent) ------------------------------------------------------
// Hard delete. Variants, per-env config, rules, and revisions cascade via their
// foreign keys, so the flag and everything hanging off it goes in one statement.
flags_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key") ?? "";
  const deleted = await withOrg(ctx.orgId, (tx) =>
    tx.delete(flags).where(eq(flags.key, key)).returning({ id: flags.id }),
  );
  if (deleted.length === 0) return jsonError(c, 404, "Flag not found.");
  return c.json({ ok: true });
});

// --- Per-environment config (on/off + default/off variant) -------------------
flags_.patch("/:key/environments/:envKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const parsed = envConfig.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const key = c.req.param("key");
  const envKey = c.req.param("envKey");

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, key);
    if (!flag) return "no-flag" as const;
    if (flag.archivedAt) return "archived" as const;
    const env = (
      await tx.select().from(environments).where(eq(environments.key, envKey)).limit(1)
    )[0];
    if (!env) return "no-env" as const;

    const variants = await tx
      .select({ id: flagVariants.id, key: flagVariants.key })
      .from(flagVariants)
      .where(eq(flagVariants.flagId, flag.id));
    const idByKey = new Map(variants.map((v) => [v.key, v.id]));
    const keyById = new Map(variants.map((v) => [v.id, v.key]));

    // Snapshot the current config so the revision can show from -> to.
    const oldFe = (
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

    const patch: Partial<typeof flagEnvironments.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
    if (parsed.data.defaultVariantKey !== undefined) {
      const id = idByKey.get(parsed.data.defaultVariantKey);
      if (!id) return "bad-variant" as const;
      patch.defaultVariantId = id;
    }
    if (parsed.data.offVariantKey !== undefined) {
      const id = idByKey.get(parsed.data.offVariantKey);
      if (!id) return "bad-variant" as const;
      patch.offVariantId = id;
    }
    if (parsed.data.defaultServe !== undefined) {
      const serve = parsed.data.defaultServe;
      // Every variant the serve references must exist on the flag.
      if (variantKeysInServe(serve).some((k) => !idByKey.has(k))) {
        return "bad-variant" as const;
      }
      if ("variant" in serve) {
        // A single-variant default lives in the FK column; clear any rollout.
        patch.defaultVariantId = idByKey.get(serve.variant)!;
        patch.defaultServe = null;
      } else {
        // A rollout default lives in default_serve; defaultVariantId stays as the
        // fallback if the rollout is ever made degenerate.
        patch.defaultServe = serve as JsonValue;
      }
    }

    const [row] = await tx
      .update(flagEnvironments)
      .set(patch)
      .where(
        and(
          eq(flagEnvironments.flagId, flag.id),
          eq(flagEnvironments.environmentId, env.id),
        ),
      )
      .returning();
    if (!row) return "no-fe" as const;

    const variantName = (id: string | null | undefined) =>
      id ? (keyById.get(id) ?? "none") : "none";
    const changes: string[] = [];
    if (patch.enabled !== undefined && oldFe && patch.enabled !== oldFe.enabled) {
      changes.push(`Enabled: ${oldFe.enabled ? "On" : "Off"} → ${patch.enabled ? "On" : "Off"}`);
    }
    if (
      patch.defaultVariantId !== undefined &&
      oldFe &&
      patch.defaultVariantId !== oldFe.defaultVariantId
    ) {
      changes.push(
        `Default variant: ${variantName(oldFe.defaultVariantId)} → ${variantName(patch.defaultVariantId)}`,
      );
    }
    if (
      patch.offVariantId !== undefined &&
      oldFe &&
      patch.offVariantId !== oldFe.offVariantId
    ) {
      changes.push(
        `Off variant: ${variantName(oldFe.offVariantId)} → ${variantName(patch.offVariantId)}`,
      );
    }
    if (
      parsed.data.defaultServe !== undefined &&
      !("variant" in parsed.data.defaultServe)
    ) {
      changes.push("Default: percentage rollout");
    }

    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: flag.id,
      actorUserId: ctx.actorUserId,
      action: "environment_updated",
      summary: `Updated ${envKey} configuration`,
      diff: { changes } as JsonValue,
    });
    return { ok: true } as const;
  });

  if (outcome === "no-flag") return jsonError(c, 404, "Flag not found.");
  if (outcome === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome === "no-env" || outcome === "no-fe")
    return jsonError(c, 404, "Environment not found for this flag.");
  if (outcome === "bad-variant")
    return jsonError(c, 422, "Referenced variant does not exist on this flag.");
  return c.json({ ok: true });
});
