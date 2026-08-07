import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { incidentSeverityLevels } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { ensureSeverityLevels, getSeverityLevels, serializeLevel } from "../../incidents/severity-levels.js";

/**
 * An org's incident SEVERITY LEVELS — fully configurable. The org owns its ladder
 * (P0..P4, sev1..sev4, ...): each level's display name, descriptor, ordering (rank),
 * badge color, downtime weight, and which one is the default for a new incident.
 * Seeded with a standard ladder on first read. Mounted at /v1/orgs/:org/severity-levels.
 * Any member reads; owner/admin edits. Saved as one atomic set (PUT), never a
 * per-row API — the whole ladder is validated together (unique keys + ranks, exactly
 * one default). A level is archived rather than deleted so past incidents keep their key.
 */
export const severityLevels_ = new Hono();
severityLevels_.use("*", authContext);

const TAG = "Incidents";

const levelInput = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]+$/i, "letters, numbers, underscores").min(1).max(40),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullish(),
  rank: z.number().int().min(0).max(1000),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "a 6-digit hex color").default("#a1a1aa"),
  downtimeWeight: z.number().min(0).max(1),
  platformMode: z.enum(["full", "proportional", "none"]).default("proportional"),
  isDefault: z.boolean().default(false),
});
const putBody = z.object({ levels: z.array(levelInput).min(1).max(20) }).strict();

const levelSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  rank: z.number(),
  color: z.string(),
  downtimeWeight: z.number(),
  platformMode: z.string(),
  isDefault: z.boolean(),
});
registerComponentSchema("SeverityLevel", levelSchema);
registerComponentSchema("SeverityLevels", z.object({ levels: z.array(levelSchema) }));

const p = { org: "The organization slug." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/severity-levels", summary: "List severity levels", description: "The org's configurable incident severity ladder, ordered most-severe first (standard ladder by default).", tags: [TAG], auth: true, paramDescriptions: p, responses: { 200: { description: "The ladder.", schemaName: "SeverityLevels" } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/severity-levels", summary: "Replace severity levels", description: "Save the whole severity ladder atomically. Existing keys are updated; new keys are added; keys left out are archived (past incidents keep their key). Exactly one level must be the default. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: p, request: { body: putBody }, responses: { 200: { description: "The saved ladder.", schemaName: "SeverityLevels" }, 400: { description: "Invalid ladder." }, 422: { description: "Validation failed." } } });

severityLevels_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const levels = await withOrg(ctx.orgId, (tx) => getSeverityLevels(tx, ctx.orgId));
  return c.json({ levels: levels.map(serializeLevel) });
});

severityLevels_.put("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = putBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { levels } = parsed.data;

  // Cross-field invariants the ladder must hold as a whole.
  const keys = levels.map((l) => l.key.toLowerCase());
  if (new Set(keys).size !== keys.length) return jsonError(c, 400, "Severity keys must be unique.");
  const ranks = levels.map((l) => l.rank);
  if (new Set(ranks).size !== ranks.length) return jsonError(c, 400, "Severity ranks must be unique.");
  const defaults = levels.filter((l) => l.isDefault);
  if (defaults.length !== 1) return jsonError(c, 400, "Exactly one severity level must be the default.");

  const saved = await withOrg(ctx.orgId, async (tx) => {
    // Seed first so a first-ever PUT reconciles against the standard ladder rather
    // than an empty table (keeps archive-missing semantics meaningful).
    await ensureSeverityLevels(tx, ctx.orgId);
    const submitted = new Set(levels.map((l) => l.key));

    for (const l of levels) {
      await tx
        .insert(incidentSeverityLevels)
        .values({
          organizationId: ctx.orgId,
          key: l.key,
          name: l.name,
          description: l.description ?? null,
          rank: l.rank,
          color: l.color,
          downtimeWeight: l.downtimeWeight,
          platformMode: l.platformMode,
          isDefault: l.isDefault,
          archived: false,
          createdByUserId: ctx.actorUserId,
        })
        // Key is immutable: an existing key UPDATES its attributes (and un-archives),
        // a new key is inserted. There is no rename — drop a key and add another.
        .onConflictDoUpdate({
          target: [incidentSeverityLevels.organizationId, incidentSeverityLevels.key],
          set: {
            name: l.name,
            description: l.description ?? null,
            rank: l.rank,
            color: l.color,
            downtimeWeight: l.downtimeWeight,
            platformMode: l.platformMode,
            isDefault: l.isDefault,
            archived: false,
            updatedAt: new Date(),
          },
        });
    }

    // Archive (never delete) any active level the caller left out, so a historical
    // incident that still references its key keeps resolving.
    const current = await tx
      .select({ key: incidentSeverityLevels.key })
      .from(incidentSeverityLevels)
      .where(and(eq(incidentSeverityLevels.organizationId, ctx.orgId), eq(incidentSeverityLevels.archived, false)));
    for (const row of current) {
      if (!submitted.has(row.key)) {
        await tx
          .update(incidentSeverityLevels)
          .set({ archived: true, isDefault: false, updatedAt: new Date() })
          .where(and(eq(incidentSeverityLevels.organizationId, ctx.orgId), eq(incidentSeverityLevels.key, row.key)));
      }
    }
    return getSeverityLevels(tx, ctx.orgId);
  });
  return c.json({ levels: saved.map(serializeLevel) });
});
