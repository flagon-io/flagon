import { Hono } from "hono";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import type { TenantTx } from "../../db/tenant.js";
import {
  flagEnvironments,
  flagRules,
  flagVariants,
  flags,
} from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg } from "../../lib/org-context.js";
import { recordRevision } from "../../flags/revisions.js";
import { variantKeysInServe, type ServeInput } from "../../flags/schemas.js";
import type { JsonValue } from "../../flags/types.js";

/**
 * Variant editing for multivariate flags. Mounted (via flags.route) at
 * /v1/orgs/:org/flags/:key/variants. Boolean flags have fixed on/off variants
 * and reject edits here. A variant can't be removed while a rule, default, or
 * off value still points at it — that would leave the engine unable to resolve.
 */
export const variants_ = new Hono();
variants_.use("*", authContext);

// Config is frozen on an archived flag (it still evaluates, but can't change).
const ARCHIVED_MESSAGE = "This flag is archived. Restore it before editing.";

const addVariant = z.object({
  value: z.unknown(),
  label: z.string().max(120).nullish(),
});

const updateVariant = z
  .object({ value: z.unknown().optional(), label: z.string().max(120).nullish() })
  .strict();

function valueTypeError(type: string, value: unknown): string | null {
  if (type === "boolean") return "Boolean flags have fixed on/off variants.";
  if (type === "string" && typeof value !== "string") return "Value must be a string.";
  if (type === "number" && typeof value !== "number") return "Value must be a number.";
  if (type === "json" && (typeof value !== "object" || value === null))
    return "Value must be a JSON object or array.";
  return null;
}

async function loadFlag(tx: TenantTx, key: string) {
  return (await tx.select().from(flags).where(eq(flags.key, key)).limit(1))[0];
}

function serialize(v: typeof flagVariants.$inferSelect) {
  return { id: v.id, key: v.key, value: v.value, label: v.label, sortOrder: v.sortOrder };
}

// --- Add ---------------------------------------------------------------------
variants_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = addVariant.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const flagKey = c.req.param("key") ?? "";

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, flagKey);
    if (!flag) return { kind: "no-flag" } as const;
    if (flag.archivedAt) return { kind: "archived" } as const;
    const typeError = valueTypeError(flag.type, parsed.data.value);
    if (typeError) return { kind: "bad-value", message: typeError } as const;

    const existing = await tx
      .select({ key: flagVariants.key })
      .from(flagVariants)
      .where(eq(flagVariants.flagId, flag.id));
    const nextN =
      existing.reduce((max, v) => {
        const n = Number(v.key.replace(/^variant-/, ""));
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0) + 1;

    const [row] = await tx
      .insert(flagVariants)
      .values({
        organizationId: ctx.orgId,
        flagId: flag.id,
        key: `variant-${nextN}`,
        value: parsed.data.value as JsonValue,
        label: parsed.data.label ?? null,
        sortOrder: existing.length,
      })
      .returning();
    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: flag.id,
      actorUserId: ctx.actorUserId,
      action: "variant_added",
      summary: `Added variant ${row.key}`,
    });
    return { kind: "ok", row } as const;
  });

  if (outcome.kind === "no-flag") return jsonError(c, 404, "Flag not found.");
  if (outcome.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome.kind === "bad-value") return jsonError(c, 422, outcome.message);
  return c.json({ variant: serialize(outcome.row) }, 201);
});

// --- Update ------------------------------------------------------------------
variants_.patch("/:variantKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateVariant.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const flagKey = c.req.param("key") ?? "";
  const variantKey = c.req.param("variantKey") ?? "";

  const result = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, flagKey);
    if (!flag) return { kind: "no-flag" } as const;
    if (flag.archivedAt) return { kind: "archived" } as const;
    if (parsed.data.value !== undefined) {
      const typeError = valueTypeError(flag.type, parsed.data.value);
      if (typeError) return { kind: "bad-value", message: typeError } as const;
    }
    const [row] = await tx
      .update(flagVariants)
      .set({
        ...(parsed.data.value !== undefined
          ? { value: parsed.data.value as JsonValue }
          : {}),
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(flagVariants.flagId, flag.id), eq(flagVariants.key, variantKey)))
      .returning();
    if (!row) return { kind: "no-variant" } as const;
    return { kind: "ok", row } as const;
  });

  if (result.kind === "no-flag") return jsonError(c, 404, "Flag not found.");
  if (result.kind === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (result.kind === "no-variant") return jsonError(c, 404, "Variant not found.");
  if (result.kind === "bad-value") return jsonError(c, 422, result.message);
  return c.json({ variant: serialize(result.row) });
});

// --- Delete (guarded) --------------------------------------------------------
variants_.delete("/:variantKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const flagKey = c.req.param("key") ?? "";
  const variantKey = c.req.param("variantKey") ?? "";

  const outcome = await withOrg(ctx.orgId, async (tx) => {
    const flag = await loadFlag(tx, flagKey);
    if (!flag) return "no-flag" as const;
    if (flag.archivedAt) return "archived" as const;
    const variant = (
      await tx
        .select()
        .from(flagVariants)
        .where(and(eq(flagVariants.flagId, flag.id), eq(flagVariants.key, variantKey)))
        .limit(1)
    )[0];
    if (!variant) return "no-variant" as const;

    // Referenced as a default/off variant in any environment?
    const asDefault = await tx
      .select({ id: flagEnvironments.id })
      .from(flagEnvironments)
      .where(
        or(
          eq(flagEnvironments.defaultVariantId, variant.id),
          eq(flagEnvironments.offVariantId, variant.id),
        ),
      )
      .limit(1);
    if (asDefault.length) return "in-use" as const;

    // Referenced by any rule's serve (RLS already scopes to this org)?
    const rules = await tx.select({ serve: flagRules.serve }).from(flagRules);
    const referenced = rules.some((r) =>
      variantKeysInServe(r.serve as ServeInput).includes(variantKey),
    );
    if (referenced) return "in-use" as const;

    await tx.delete(flagVariants).where(eq(flagVariants.id, variant.id));
    await recordRevision(tx, {
      organizationId: ctx.orgId,
      flagId: flag.id,
      actorUserId: ctx.actorUserId,
      action: "variant_removed",
      summary: `Removed variant ${variantKey}`,
    });
    return "ok" as const;
  });

  if (outcome === "no-flag") return jsonError(c, 404, "Flag not found.");
  if (outcome === "archived") return jsonError(c, 409, ARCHIVED_MESSAGE);
  if (outcome === "no-variant") return jsonError(c, 404, "Variant not found.");
  if (outcome === "in-use")
    return jsonError(
      c,
      409,
      "This variant is still referenced by a default, off value, or targeting rule.",
    );
  return c.json({ ok: true });
});
