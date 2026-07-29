import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { segments } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg } from "../../lib/org-context.js";
import { invalidateEvalCacheOnWrite } from "../../lib/eval-invalidate.js";
import { conditionsSchema } from "../../flags/schemas.js";
import type { JsonValue } from "../../flags/types.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Segments — reusable targeting condition groups, referenced by rules so "beta
 * users" is defined once. Mounted under /v1/orgs/:org/segments.
 */
export const segments_ = new Hono();

segments_.use("*", authContext);
// A successful segment write invalidates the org's eval-cache entry (segments
// are referenced by rules, so a segment change changes evaluation output).
segments_.use("*", invalidateEvalCacheOnWrite);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers, and single hyphens.");

const createSegment = z.object({
  key: slug,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  conditions: conditionsSchema.default([]),
});

const updateSegment = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    conditions: conditionsSchema.optional(),
  })
  .strict();

// --- OpenAPI registration ----------------------------------------------------
const SEGMENTS_TAG = "Segments";
const segmentParams = {
  org: "The organization slug.",
  key: "The segment key.",
};
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/segments",
  summary: "Create a segment",
  description:
    "Create a reusable targeting segment: a named group of conditions that rules can reference.",
  tags: [SEGMENTS_TAG],
  auth: true,
  paramDescriptions: segmentParams,
  request: { body: createSegment },
  responses: {
    201: { description: "The segment was created.", schemaName: "SegmentResponse" },
    409: { description: "A segment with that key already exists." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/segments",
  summary: "List segments",
  description: "List every segment in the organization.",
  tags: [SEGMENTS_TAG],
  auth: true,
  paramDescriptions: segmentParams,
  responses: {
    200: { description: "The organization's segments.", schemaName: "SegmentListResponse" },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/segments/{key}",
  summary: "Get a segment",
  tags: [SEGMENTS_TAG],
  auth: true,
  paramDescriptions: segmentParams,
  responses: {
    200: { description: "The segment.", schemaName: "SegmentResponse" },
    404: { description: "No segment with that key." },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/segments/{key}",
  summary: "Update a segment",
  description: "Edit a segment's name, description, or conditions.",
  tags: [SEGMENTS_TAG],
  auth: true,
  paramDescriptions: segmentParams,
  request: { body: updateSegment },
  responses: {
    200: { description: "The updated segment.", schemaName: "SegmentResponse" },
    404: { description: "No segment with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/segments/{key}",
  summary: "Delete a segment",
  description: "Permanently delete a segment.",
  tags: [SEGMENTS_TAG],
  auth: true,
  paramDescriptions: segmentParams,
  responses: {
    200: { description: "The segment was deleted.", schemaName: "DeleteAck" },
    404: { description: "No segment with that key." },
    429: WRITE_429,
  },
});

function serialize(s: typeof segments.$inferSelect) {
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    description: s.description,
    conditions: s.conditions,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// --- Response component schemas ----------------------------------------------
const segmentSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  conditions: z.unknown(),
  createdAt: z.string().describe("ISO 8601 timestamp"),
  updatedAt: z.string().describe("ISO 8601 timestamp"),
});
registerComponentSchema("Segment", segmentSchema);
registerComponentSchema("SegmentResponse", z.object({ segment: segmentSchema }));
registerComponentSchema("SegmentListResponse", z.object({ segments: z.array(segmentSchema) }));

segments_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = createSegment.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const existing = (
      await tx.select({ id: segments.id }).from(segments).where(eq(segments.key, parsed.data.key)).limit(1)
    )[0];
    if (existing) return "conflict" as const;
    const [row] = await tx
      .insert(segments)
      .values({
        organizationId: ctx.orgId,
        key: parsed.data.key,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        conditions: parsed.data.conditions as JsonValue,
      })
      .returning();
    return { row };
  });

  if (outcome === "conflict")
    return jsonError(c, 409, `A segment named "${parsed.data.key}" already exists.`);
  return c.json({ segment: serialize(outcome.row) }, 201);
});

segments_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(segments).orderBy(desc(segments.createdAt)),
  );
  return c.json({ segments: rows.map(serialize) });
});

segments_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const row = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(segments).where(eq(segments.key, key)).limit(1).then((r) => r[0]),
  );
  if (!row) return jsonError(c, 404, "Segment not found.");
  return c.json({ segment: serialize(row) });
});

segments_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateSegment.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const key = c.req.param("key") ?? "";
  const row = await withOrg(ctx.orgId, async (tx) => {
    const existing = (
      await tx.select({ id: segments.id }).from(segments).where(eq(segments.key, key)).limit(1)
    )[0];
    if (!existing) return null;
    const [updated] = await tx
      .update(segments)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.conditions !== undefined
          ? { conditions: parsed.data.conditions as JsonValue }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(segments.id, existing.id))
      .returning();
    return updated;
  });
  if (!row) return jsonError(c, 404, "Segment not found.");
  return c.json({ segment: serialize(row) });
});

segments_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const key = c.req.param("key") ?? "";
  const deleted = await withOrg(ctx.orgId, (tx) =>
    tx.delete(segments).where(eq(segments.key, key)).returning({ id: segments.id }),
  );
  if (deleted.length === 0) return jsonError(c, 404, "Segment not found.");
  return c.json({ ok: true });
});
