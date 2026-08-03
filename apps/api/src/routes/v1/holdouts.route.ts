import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { environments, holdouts } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { invalidateEvalCacheOnWrite } from "../../lib/eval-invalidate.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Holdouts — a deterministic global control group held out of all experiments in an
 * environment (Statsig's holdout). Mounted under /v1/orgs/:org/holdouts. A write
 * changes evaluation output (held-out units get control), so writes invalidate the
 * eval cache.
 */
export const holdouts_ = new Hono();
holdouts_.use("*", authContext);
holdouts_.use("*", invalidateEvalCacheOnWrite);

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

const createHoldout = z.object({
  key: slug,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  environment: z.string().trim().min(1),
  percentage: z.number().int().min(1).max(100).default(5),
});

const updateHoldout = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    percentage: z.number().int().min(1).max(100).optional(),
    status: z.enum(["active", "stopped"]).optional(),
  })
  .strict();

const TAG = "Holdouts";
const params = { org: "The organization slug.", key: "The holdout key." };
const WRITE_429 = { description: "Too many management writes; retry after the Retry-After delay." };

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/holdouts",
  summary: "Create a holdout",
  description:
    "Create a holdout: a deterministic percentage of units held out of every experiment in an environment, served the control experience so you can measure your program's aggregate impact against a clean baseline.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: createHoldout },
  responses: {
    201: { description: "The holdout was created.", schemaName: "HoldoutResponse" },
    409: { description: "A holdout with that key already exists." },
    422: { description: "Validation failed, or the environment does not exist." },
    429: WRITE_429,
  },
});

for (const [method, path, summary] of [
  ["get", "/v1/orgs/{org}/holdouts", "List holdouts"],
  ["get", "/v1/orgs/{org}/holdouts/{key}", "Get a holdout"],
] as const) {
  registerRoute({
    method,
    path,
    summary,
    tags: [TAG],
    auth: true,
    paramDescriptions: params,
    responses: {
      200: { description: summary, schemaName: path.endsWith("{key}") ? "HoldoutResponse" : "HoldoutListResponse" },
      ...(path.endsWith("{key}") ? { 404: { description: "No holdout with that key." } } : {}),
    },
  });
}

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/holdouts/{key}",
  summary: "Update a holdout",
  description: "Change a holdout's name, description, percentage, or status (active/stopped).",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: updateHoldout },
  responses: {
    200: { description: "The updated holdout.", schemaName: "HoldoutResponse" },
    404: { description: "No holdout with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/holdouts/{key}",
  summary: "Delete a holdout",
  description: "Permanently delete a holdout; its units rejoin experiments.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The holdout was deleted.", schemaName: "DeleteAck" },
    404: { description: "No holdout with that key." },
    429: WRITE_429,
  },
});

type HoldoutRow = typeof holdouts.$inferSelect;
async function serialize(tx: Parameters<Parameters<typeof withOrg>[1]>[0], h: HoldoutRow) {
  const [env] = await tx
    .select({ key: environments.key })
    .from(environments)
    .where(eq(environments.id, h.environmentId))
    .limit(1);
  return {
    id: h.id,
    key: h.key,
    name: h.name,
    description: h.description,
    environment: env?.key ?? null,
    percentage: h.percentage,
    status: h.status,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

const holdoutSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  environment: z.string().nullable(),
  percentage: z.number(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
registerComponentSchema("Holdout", holdoutSchema);
registerComponentSchema("HoldoutResponse", z.object({ holdout: holdoutSchema }));
registerComponentSchema("HoldoutListResponse", z.array(holdoutSchema));

holdouts_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = createHoldout.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const d = parsed.data;

  const outcome: "conflict" | { error: string } | { holdout: Awaited<ReturnType<typeof serialize>> } =
    await withOrg(ctx.orgId, async (tx) => {
      const existing = (
        await tx.select({ id: holdouts.id }).from(holdouts).where(eq(holdouts.key, d.key)).limit(1)
      )[0];
      if (existing) return "conflict" as const;
      const [env] = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.key, d.environment))
        .limit(1);
      if (!env) return { error: `Environment "${d.environment}" does not exist.` } as const;
      const [row] = await tx
        .insert(holdouts)
        .values({
          organizationId: ctx.orgId,
          environmentId: env.id,
          key: d.key,
          name: d.name,
          description: d.description ?? null,
          percentage: d.percentage,
          createdByUserId: ctx.actorUserId ?? null,
        })
        .returning();
      return { holdout: await serialize(tx, row!) };
    });

  if (outcome === "conflict") return jsonError(c, 409, `A holdout named "${d.key}" already exists.`);
  if ("error" in outcome) return jsonError(c, 422, outcome.error);
  return c.json({ holdout: outcome.holdout }, 201);
});

holdouts_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const list = await withOrg(ctx.orgId, async (tx) => {
    const rows = await tx.select().from(holdouts).orderBy(desc(holdouts.createdAt));
    return Promise.all(rows.map((r) => serialize(tx, r)));
  });
  return c.json(list);
});

holdouts_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const row = await withOrg(ctx.orgId, async (tx) => {
    const [h] = await tx.select().from(holdouts).where(eq(holdouts.key, key)).limit(1);
    return h ? serialize(tx, h) : null;
  });
  if (!row) return jsonError(c, 404, "Holdout not found.");
  return c.json({ holdout: row });
});

holdouts_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateHoldout.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const key = c.req.param("key") ?? "";
  const row = await withOrg(ctx.orgId, async (tx) => {
    const [existing] = await tx.select().from(holdouts).where(eq(holdouts.key, key)).limit(1);
    if (!existing) return null;
    const [updated] = await tx
      .update(holdouts)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.percentage !== undefined ? { percentage: parsed.data.percentage } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(holdouts.id, existing.id))
      .returning();
    return serialize(tx, updated!);
  });
  if (!row) return jsonError(c, 404, "Holdout not found.");
  return c.json({ holdout: row });
});

holdouts_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key") ?? "";
  const deleted = await withOrg(ctx.orgId, (tx) =>
    tx.delete(holdouts).where(eq(holdouts.key, key)).returning({ id: holdouts.id }),
  );
  if (deleted.length === 0) return jsonError(c, 404, "Holdout not found.");
  return c.json({ ok: true });
});
