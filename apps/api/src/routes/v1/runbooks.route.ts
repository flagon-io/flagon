import { Hono } from "hono";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { runbooks, runbookSteps, runbookServices, projects } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Runbooks — reusable playbooks a responder follows during an incident. Ordered
 * steps (a task with markdown instructions, or a link), attached to catalog
 * services and/or triggered at a severity threshold. Mounted at
 * /v1/orgs/:org/runbooks. Any member reads; owner/admin writes.
 */
export const runbooks_ = new Hono();
runbooks_.use("*", authContext);

const TAG = "Runbooks";
const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;
const STEP_KINDS = ["task", "link"] as const;

const createBody = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  triggerSeverity: z.enum(SEVERITIES).optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    triggerSeverity: z.enum(SEVERITIES).nullable().optional(),
  })
  .strict();
const stepsBody = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().max(5000).optional(),
        kind: z.enum(STEP_KINDS).default("task"),
        url: z.string().trim().url().max(2048).optional(),
      }),
    )
    .max(50),
});
const servicesBody = z.object({ projectKeys: z.array(z.string().trim().min(1).max(100)).max(50) });

const stepSchema = z.object({ position: z.number(), title: z.string(), body: z.string().nullable(), kind: z.string(), url: z.string().nullable() });
const runbookSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  triggerSeverity: z.string().nullable(),
  stepCount: z.number(),
  services: z.array(z.object({ key: z.string(), name: z.string() })),
});
registerComponentSchema("Runbook", runbookSchema);
registerComponentSchema("RunbookListResponse", z.array(runbookSchema));
registerComponentSchema("RunbookResponse", z.object({ runbook: runbookSchema, steps: z.array(stepSchema) }));

const pParams = { org: "The organization slug." };
const kParams = { ...pParams, key: "The runbook key." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/runbooks", summary: "List runbooks", tags: [TAG], auth: true, paramDescriptions: pParams, responses: { 200: { description: "Runbooks.", schemaName: "RunbookListResponse" } } });
registerRoute({ method: "get", path: "/v1/orgs/{org}/runbooks/{key}", summary: "Get a runbook", description: "A runbook with its ordered steps and attached services.", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "The runbook.", schemaName: "RunbookResponse" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/runbooks", summary: "Create a runbook", tags: [TAG], auth: true, paramDescriptions: pParams, request: { body: createBody }, responses: { 201: { description: "Created.", schemaName: "RunbookResponse" }, 400: { description: "Invalid key." }, 409: { description: "Key taken." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/runbooks/{key}", summary: "Update a runbook", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: updateBody }, responses: { 200: { description: "Updated.", schemaName: "RunbookResponse" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/runbooks/{key}", summary: "Delete a runbook", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/runbooks/{key}/steps", summary: "Set runbook steps", description: "Replace the ordered steps. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: stepsBody }, responses: { 200: { description: "Set.", schemaName: "RunbookResponse" }, 404: { description: "No such runbook." } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/runbooks/{key}/services", summary: "Set covered services", description: "Replace the catalog services this runbook attaches to. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: servicesBody }, responses: { 200: { description: "Set.", schemaName: "RunbookResponse" }, 400: { description: "Unknown service." }, 404: { description: "No such runbook." } } });

async function runbookByKey(tx: TenantTx, key: string) {
  return tx.select().from(runbooks).where(eq(runbooks.key, key)).limit(1).then((r) => r[0] ?? null);
}
async function servicesFor(tx: TenantTx, runbookId: string) {
  return tx
    .select({ key: projects.key, name: projects.name })
    .from(runbookServices)
    .innerJoin(projects, eq(projects.id, runbookServices.projectId))
    .where(eq(runbookServices.runbookId, runbookId))
    .orderBy(projects.name);
}
type RunbookRow = typeof runbooks.$inferSelect;
async function serialize(tx: TenantTx, rb: RunbookRow) {
  const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(runbookSteps).where(eq(runbookSteps.runbookId, rb.id));
  const services = await servicesFor(tx, rb.id);
  return { key: rb.key, name: rb.name, description: rb.description, triggerSeverity: rb.triggerSeverity, stepCount: Number(n), services };
}
async function detail(tx: TenantTx, rb: RunbookRow) {
  const steps = await tx
    .select({ position: runbookSteps.position, title: runbookSteps.title, body: runbookSteps.body, kind: runbookSteps.kind, url: runbookSteps.url })
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
    if (await runbookByKey(tx, parsed.data.key)) return "conflict" as const;
    const [rb] = await tx.insert(runbooks).values({ organizationId: ctx.orgId, key: parsed.data.key, name: parsed.data.name, description: parsed.data.description ?? null, triggerSeverity: parsed.data.triggerSeverity ?? null, createdByUserId: ctx.actorUserId }).returning();
    return { detail: await detail(tx, rb) };
  });
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
    if (!rb) return null;
    const [row] = await tx.update(runbooks).set({ ...parsed.data, updatedAt: new Date() }).where(eq(runbooks.id, rb.id)).returning();
    return detail(tx, row);
  });
  if (!result) return jsonError(c, 404, "Runbook not found.");
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
      await tx.insert(runbookSteps).values({ organizationId: ctx.orgId, runbookId: rb.id, position: position++, title: s.title, body: s.body ?? null, kind: s.kind, url: s.url ?? null });
    }
    return detail(tx, rb);
  });
  if (!result) return jsonError(c, 404, "Runbook not found.");
  return c.json(result);
});

runbooks_.put("/:key/services", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = servicesBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const rb = await runbookByKey(tx, c.req.param("key"));
    if (!rb) return "not_found" as const;
    const keys = [...new Set(parsed.data.projectKeys)];
    const rows = keys.length ? await tx.select({ id: projects.id, key: projects.key }).from(projects).where(inArray(projects.key, keys)) : [];
    if (rows.length !== keys.length) return "unknown_service" as const;
    await tx.delete(runbookServices).where(eq(runbookServices.runbookId, rb.id));
    for (const p of rows) {
      await tx.insert(runbookServices).values({ organizationId: ctx.orgId, runbookId: rb.id, projectId: p.id });
    }
    return { detail: await detail(tx, rb) };
  });
  if (result === "not_found") return jsonError(c, 404, "Runbook not found.");
  if (result === "unknown_service") return jsonError(c, 400, "One of the services does not exist.");
  return c.json(result.detail);
});
