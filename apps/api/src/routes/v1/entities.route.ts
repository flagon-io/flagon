import { Hono } from "hono";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { entities, entityAttributes } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import type { JsonValue } from "../../flags/types.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Entities — the targeting-context schema: the kinds of subject flags evaluate
 * for (user, team, ...) and their typed attributes. Rules and segments reference
 * these attributes; an SDK sends a matching context. Mounted under
 * /v1/orgs/:org/entities; an entity and its attributes are managed together.
 */
export const entities_ = new Hono();
entities_.use("*", authContext);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers, and single hyphens.");

const attribute = z.object({
  key: z.string().trim().min(1).max(120),
  dataType: z.enum(["string", "number", "boolean"]).default("string"),
  labels: z.array(z.string().max(120)).max(200).nullish(),
});

const createEntity = z.object({
  key: slug,
  label: z.string().trim().min(1).max(200),
  attributes: z.array(attribute).max(100).default([]),
});

const updateEntity = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    attributes: z.array(attribute).max(100).optional(),
  })
  .strict();

// --- OpenAPI registration ----------------------------------------------------
const ENTITIES_TAG = "Entities";
const entityParams = {
  org: "The organization slug.",
  key: "The entity key.",
};
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/entities",
  summary: "Create an entity",
  description:
    "Define a targeting entity (e.g. user, team) and its typed attributes that rules and segments reference.",
  tags: [ENTITIES_TAG],
  auth: true,
  paramDescriptions: entityParams,
  request: { body: createEntity },
  responses: {
    201: { description: "The entity was created.", schemaName: "EntityResponse" },
    409: { description: "An entity with that key already exists." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/entities",
  summary: "List entities",
  description: "List every entity in the organization with its attributes.",
  tags: [ENTITIES_TAG],
  auth: true,
  paramDescriptions: entityParams,
  responses: {
    200: { description: "The organization's entities.", schemaName: "EntityListResponse" },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/entities/{key}",
  summary: "Update an entity",
  description: "Edit an entity's label or replace its attribute set.",
  tags: [ENTITIES_TAG],
  auth: true,
  paramDescriptions: entityParams,
  request: { body: updateEntity },
  responses: {
    200: { description: "The updated entity.", schemaName: "EntityResponse" },
    404: { description: "No entity with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/entities/{key}",
  summary: "Delete an entity",
  description: "Permanently delete an entity and its attributes.",
  tags: [ENTITIES_TAG],
  auth: true,
  paramDescriptions: entityParams,
  responses: {
    200: { description: "The entity was deleted.", schemaName: "DeleteAck" },
    404: { description: "No entity with that key." },
    429: WRITE_429,
  },
});

type EntityRow = typeof entities.$inferSelect;
type AttrRow = typeof entityAttributes.$inferSelect;

function serialize(entity: EntityRow, attrs: AttrRow[]) {
  return {
    id: entity.id,
    key: entity.key,
    label: entity.label,
    attributes: attrs
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({ key: a.key, dataType: a.dataType, labels: a.labels })),
    createdAt: entity.createdAt.toISOString(),
  };
}

// --- Response component schemas ----------------------------------------------
const entitySchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  attributes: z.array(
    z.object({
      key: z.string(),
      dataType: z.string(),
      labels: z.array(z.string()).nullable(),
    }),
  ),
  createdAt: z.string().describe("ISO 8601 timestamp"),
});
registerComponentSchema("Entity", entitySchema);
registerComponentSchema("EntityResponse", z.object({ entity: entitySchema }));
registerComponentSchema("EntityListResponse", z.object({ entities: z.array(entitySchema) }));

async function writeAttributes(
  tx: Parameters<Parameters<typeof withOrg>[1]>[0],
  organizationId: string,
  entityId: string,
  attrs: z.infer<typeof attribute>[],
) {
  await tx.delete(entityAttributes).where(eq(entityAttributes.entityId, entityId));
  if (attrs.length === 0) return;
  await tx.insert(entityAttributes).values(
    attrs.map((a, i) => ({
      organizationId,
      entityId,
      key: a.key,
      dataType: a.dataType,
      labels: (a.labels ?? null) as JsonValue,
      sortOrder: i,
    })),
  );
}

entities_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = createEntity.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const existing = (
      await tx.select({ id: entities.id }).from(entities).where(eq(entities.key, parsed.data.key)).limit(1)
    )[0];
    if (existing) return "conflict" as const;
    const [entity] = await tx
      .insert(entities)
      .values({ organizationId: ctx.orgId, key: parsed.data.key, label: parsed.data.label })
      .returning();
    await writeAttributes(tx, ctx.orgId, entity.id, parsed.data.attributes);
    const attrs = await tx
      .select()
      .from(entityAttributes)
      .where(eq(entityAttributes.entityId, entity.id));
    return { entity, attrs };
  });

  if (outcome === "conflict")
    return jsonError(c, 409, `An entity named "${parsed.data.key}" already exists.`);
  return c.json({ entity: serialize(outcome.entity, outcome.attrs) }, 201);
});

entities_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const data = await withOrg(ctx.orgId, async (tx) => {
    const rows = await tx.select().from(entities).orderBy(asc(entities.createdAt));
    const ids = rows.map((e) => e.id);
    const attrs = ids.length
      ? await tx.select().from(entityAttributes).where(inArray(entityAttributes.entityId, ids))
      : [];
    return { rows, attrs };
  });

  return c.json({
    entities: data.rows.map((e) =>
      serialize(
        e,
        data.attrs.filter((a) => a.entityId === e.id),
      ),
    ),
  });
});

entities_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateEntity.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const key = c.req.param("key") ?? "";

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const entity = (
      await tx.select().from(entities).where(eq(entities.key, key)).limit(1)
    )[0];
    if (!entity) return null;
    if (parsed.data.label !== undefined) {
      await tx.update(entities).set({ label: parsed.data.label }).where(eq(entities.id, entity.id));
    }
    if (parsed.data.attributes !== undefined) {
      await writeAttributes(tx, ctx.orgId, entity.id, parsed.data.attributes);
    }
    const [fresh] = await tx.select().from(entities).where(eq(entities.id, entity.id));
    const attrs = await tx
      .select()
      .from(entityAttributes)
      .where(eq(entityAttributes.entityId, entity.id));
    return { entity: fresh, attrs };
  });

  if (!outcome) return jsonError(c, 404, "Entity not found.");
  return c.json({ entity: serialize(outcome.entity, outcome.attrs) });
});

entities_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const key = c.req.param("key") ?? "";
  const deleted = await withOrg(ctx.orgId, (tx) =>
    tx.delete(entities).where(eq(entities.key, key)).returning({ id: entities.id }),
  );
  if (deleted.length === 0) return jsonError(c, 404, "Entity not found.");
  return c.json({ ok: true });
});
