import { Hono } from "hono";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { runbooks, runbookSteps } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { getSeverityLevels } from "../../incidents/severity-levels.js";
import { ensureDefaultRunbook } from "../../incidents/runbook-attach.js";

/**
 * Runbooks — reusable playbooks a responder follows during an incident. Ordered
 * steps (a task with markdown, or a link) that AUTO-ATTACH to matching incidents
 * (empty conditions = every incident, the "Default"), unless manual-only. Mounted at
 * /v1/orgs/:org/runbooks. Any member reads; owner/admin writes.
 */
export const runbooks_ = new Hono();
runbooks_.use("*", authContext);

const TAG = "Runbooks";
const STEP_KINDS = ["task", "link"] as const;

// A runbook ATTACH condition: which incidents it auto-attaches to. Severity keys are
// validated per-org against the configured ladder. Empty conditions = all incidents.
const attachConditionSchema = z.object({
  type: z.literal("severity"),
  values: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
});
const createBody = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  manualOnly: z.boolean().optional(),
  attachConditions: z.array(attachConditionSchema).max(20).optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    manualOnly: z.boolean().optional(),
    attachConditions: z.array(attachConditionSchema).max(20).optional(),
  })
  .strict();
// A step's execution CONDITION — the incident state that must hold for it to run.
// A tagged union (extensible without a migration; the column is jsonb):
//   severity/milestone — the incident's value is one of `values`
//   previous_step      — the step above it has run (done or skipped)
const stepConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("severity"), values: z.array(z.string().trim().min(1).max(60)).min(1).max(30) }),
  z.object({ type: z.literal("milestone"), values: z.array(z.string().trim().min(1).max(60)).min(1).max(30) }),
  z.object({ type: z.literal("previous_step") }),
]);
const stepsBody = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().max(5000).optional(),
        kind: z.enum(STEP_KINDS).default("task"),
        url: z.string().trim().url().max(2048).optional(),
        // Step-catalog identity + FireHydrant-style execution conditions. Defaults
        // reproduce today's behavior: a native task that runs when the runbook attaches.
        provider: z.string().trim().min(1).max(60).default("core"),
        action: z.string().trim().min(1).max(60).default("task"),
        conditions: z.array(stepConditionSchema).max(20).default([]),
      }),
    )
    .max(50),
});

const stepSchema = z.object({
  position: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  kind: z.string(),
  url: z.string().nullable(),
  provider: z.string(),
  action: z.string(),
  conditions: z.array(stepConditionSchema),
});
const runbookSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  manualOnly: z.boolean().describe("Never auto-attaches; a responder attaches it by hand."),
  attachConditions: z.array(attachConditionSchema).describe("Auto-attaches to matching incidents; empty = all."),
  stepCount: z.number(),
});
registerComponentSchema("Runbook", runbookSchema);
registerComponentSchema("RunbookListResponse", z.array(runbookSchema));
registerComponentSchema("RunbookResponse", z.object({ runbook: runbookSchema, steps: z.array(stepSchema) }));

const pParams = { org: "The organization slug." };
const kParams = { ...pParams, key: "The runbook key." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/runbooks", summary: "List runbooks", tags: [TAG], auth: true, paramDescriptions: pParams, responses: { 200: { description: "Runbooks.", schemaName: "RunbookListResponse" } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/runbooks/{key}", summary: "Get a runbook", description: "A runbook with its ordered steps.", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "The runbook.", schemaName: "RunbookResponse" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/runbooks", summary: "Create a runbook", tags: [TAG], auth: true, paramDescriptions: pParams, request: { body: createBody }, responses: { 201: { description: "Created.", schemaName: "RunbookResponse" }, 400: { description: "Invalid key." }, 409: { description: "Key taken." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/runbooks/{key}", summary: "Update a runbook", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: updateBody }, responses: { 200: { description: "Updated.", schemaName: "RunbookResponse" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/runbooks/{key}", summary: "Delete a runbook", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/runbooks/{key}/steps", summary: "Set runbook steps", description: "Replace the ordered steps. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: stepsBody }, responses: { 200: { description: "Set.", schemaName: "RunbookResponse" }, 404: { description: "No such runbook." } } });

async function runbookByKey(tx: TenantTx, key: string) {
  return tx.select().from(runbooks).where(eq(runbooks.key, key)).limit(1).then((r) => r[0] ?? null);
}
/** True if any attach-condition names a severity that isn't in the org's ladder. */
async function hasUnknownSeverity(
  tx: TenantTx,
  orgId: string,
  conditions: { values: string[] }[],
): Promise<boolean> {
  const sevs = conditions.flatMap((c) => c.values);
  if (sevs.length === 0) return false;
  const keys = new Set((await getSeverityLevels(tx, orgId)).map((l) => l.key));
  return sevs.some((s) => !keys.has(s));
}
type RunbookRow = typeof runbooks.$inferSelect;
async function serialize(tx: TenantTx, rb: RunbookRow) {
  const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(runbookSteps).where(eq(runbookSteps.runbookId, rb.id));
  return { key: rb.key, name: rb.name, description: rb.description, manualOnly: rb.manualOnly, attachConditions: rb.attachConditions, stepCount: Number(n) };
}
async function detail(tx: TenantTx, rb: RunbookRow) {
  const steps = await tx
    .select({ position: runbookSteps.position, title: runbookSteps.title, body: runbookSteps.body, kind: runbookSteps.kind, url: runbookSteps.url, provider: runbookSteps.provider, action: runbookSteps.action, conditions: runbookSteps.conditions })
    .from(runbookSteps)
    .where(eq(runbookSteps.runbookId, rb.id))
    .orderBy(runbookSteps.position);
  return { runbook: await serialize(tx, rb), steps };
}

runbooks_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json(
    await withOrg(ctx.orgId, async (tx) => {
      // Seed the org's Default runbook on first view so there's always a playbook.
      await ensureDefaultRunbook(tx, ctx.orgId);
      const rows = await tx.select().from(runbooks).orderBy(desc(runbooks.createdAt));
      return Promise.all(rows.map((rb) => serialize(tx, rb)));
    }),
  );
});

runbooks_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const rb = await runbookByKey(tx, c.req.param("key"));
    return rb ? detail(tx, rb) : null;
  });
  if (!result) return jsonError(c, 404, "Runbook not found.");
  return c.json(result);
});

runbooks_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  if (!isValidSlug(parsed.data.key)) return jsonError(c, 400, "Choose a different runbook key (letters, numbers, dashes).");
  const result = await withOrg(ctx.orgId, async (tx) => {
    const conditions = parsed.data.attachConditions ?? [];
    if (await hasUnknownSeverity(tx, ctx.orgId, conditions)) return "unknown_severity" as const;
    if (await runbookByKey(tx, parsed.data.key)) return "conflict" as const;
    const [rb] = await tx.insert(runbooks).values({ organizationId: ctx.orgId, key: parsed.data.key, name: parsed.data.name, description: parsed.data.description ?? null, manualOnly: parsed.data.manualOnly ?? false, attachConditions: conditions, createdByUserId: ctx.actorUserId }).returning();
    return { detail: await detail(tx, rb) };
  });
  if (result === "unknown_severity") return jsonError(c, 400, "That severity level does not exist.");
  if (result === "conflict") return jsonError(c, 409, "A runbook with that key already exists.");
  return c.json(result.detail, 201);
});

runbooks_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const rb = await runbookByKey(tx, c.req.param("key"));
    if (!rb) return "not_found" as const;
    if (parsed.data.attachConditions && (await hasUnknownSeverity(tx, ctx.orgId, parsed.data.attachConditions))) {
      return "unknown_severity" as const;
    }
    const [row] = await tx.update(runbooks).set({ ...parsed.data, updatedAt: new Date() }).where(eq(runbooks.id, rb.id)).returning();
    return detail(tx, row);
  });
  if (result === "not_found") return jsonError(c, 404, "Runbook not found.");
  if (result === "unknown_severity") return jsonError(c, 400, "That severity level does not exist.");
  return c.json(result);
});

runbooks_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const rb = await runbookByKey(tx, c.req.param("key"));
    if (!rb) return false;
    await tx.delete(runbooks).where(eq(runbooks.id, rb.id));
    return true;
  });
  if (!ok) return jsonError(c, 404, "Runbook not found.");
  return c.json({ ok: true });
});

runbooks_.put("/:key/steps", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = stepsBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const rb = await runbookByKey(tx, c.req.param("key"));
    if (!rb) return null;
    await tx.delete(runbookSteps).where(eq(runbookSteps.runbookId, rb.id));
    let position = 0;
    for (const s of parsed.data.steps) {
      await tx.insert(runbookSteps).values({ organizationId: ctx.orgId, runbookId: rb.id, position: position++, title: s.title, body: s.body ?? null, kind: s.kind, url: s.url ?? null, provider: s.provider, action: s.action, conditions: s.conditions });
    }
    return detail(tx, rb);
  });
  if (!result) return jsonError(c, 404, "Runbook not found.");
  return c.json(result);
});
