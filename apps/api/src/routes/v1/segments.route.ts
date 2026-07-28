import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { segments } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg } from "../../lib/org-context.js";
import { conditionsSchema } from "../../flags/schemas.js";
import type { JsonValue } from "../../flags/types.js";

/**
 * Segments — reusable targeting condition groups, referenced by rules so "beta
 * users" is defined once. Mounted under /v1/orgs/:org/segments.
 */
export const segments_ = new Hono();

segments_.use("*", authContext);

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
