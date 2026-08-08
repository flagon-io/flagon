import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { withOrg } from "../../db/tenant.js";
import { maintenanceWindows, type MaintenanceWindow } from "../../db/schema.js";

/**
 * Maintenance windows API — planned spans during which matched checks are not run and so
 * never alert (the Checkly model). A window targets checks by KEY (empty = all checks), and
 * can repeat daily/weekly/monthly until an optional end. The sweep reads active windows
 * and skips matched checks (checks/maintenance.ts). Mounted under
 * /v1/orgs/:org/maintenance-windows.
 */
export const maintenanceWindows_ = new Hono();

maintenanceWindows_.use("*", authContext);

const TAG = "Maintenance windows";
const params = { org: "The organization slug.", id: "The maintenance window id." };
const REPEATS = ["none", "daily", "weekly", "monthly"] as const;

function serialize(row: MaintenanceWindow) {
  return {
    id: row.id,
    name: row.name,
    checkKeys: row.checkKeys,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    repeat: row.repeat,
    repeatEndsAt: row.repeatEndsAt ? row.repeatEndsAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const windowSchema = z.object({
  id: z.string(),
  name: z.string(),
  checkKeys: z.array(z.string()),
  startsAt: z.string(),
  endsAt: z.string(),
  repeat: z.enum(REPEATS),
  repeatEndsAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
registerComponentSchema("MaintenanceWindow", windowSchema);
registerComponentSchema("MaintenanceWindowList", z.object({ windows: z.array(windowSchema) }));
registerComponentSchema("MaintenanceWindowResponse", z.object({ window: windowSchema }));

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    checkKeys: z.array(z.string().trim().min(1).max(200)).max(1000).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    repeat: z.enum(REPEATS).optional(),
    repeatEndsAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "endsAt must be after startsAt.",
    path: ["endsAt"],
  });

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  checkKeys: z.array(z.string().trim().min(1).max(200)).max(1000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  repeat: z.enum(REPEATS).optional(),
  repeatEndsAt: z.string().datetime().nullable().optional(),
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/maintenance-windows",
  summary: "List maintenance windows",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  responses: { 200: { description: "The org's maintenance windows.", schemaName: "MaintenanceWindowList" } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/maintenance-windows",
  summary: "Create a maintenance window",
  description:
    "Create a window that suppresses scheduled runs for the selected checks (empty = all). Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  request: { body: createSchema },
  responses: {
    200: { description: "The created window.", schemaName: "MaintenanceWindowResponse" },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/maintenance-windows/{id}",
  summary: "Get a maintenance window",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The window.", schemaName: "MaintenanceWindowResponse" },
    404: { description: "No such window." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/maintenance-windows/{id}",
  summary: "Update a maintenance window",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: updateSchema },
  responses: {
    200: { description: "The updated window.", schemaName: "MaintenanceWindowResponse" },
    404: { description: "No such window." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/maintenance-windows/{id}",
  summary: "Delete a maintenance window",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such window." } },
});

async function loadWindow(orgId: string, id: string): Promise<MaintenanceWindow | null> {
  const row = (
    await withOrg(orgId, (tx) => tx.select().from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).limit(1))
  )[0];
  return row ?? null;
}

maintenanceWindows_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(maintenanceWindows).orderBy(desc(maintenanceWindows.startsAt)),
  );
  return c.json({ windows: rows.map(serialize) });
});

maintenanceWindows_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const body = parsed.data;

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .insert(maintenanceWindows)
      .values({
        organizationId: ctx.orgId,
        name: body.name,
        checkKeys: body.checkKeys ?? [],
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        repeat: body.repeat ?? "none",
        repeatEndsAt: body.repeatEndsAt ? new Date(body.repeatEndsAt) : null,
        createdByUserId: ctx.actorUserId,
      })
      .returning(),
  );
  return c.json({ window: serialize(row!) });
});

maintenanceWindows_.get("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const window = await loadWindow(ctx.orgId, c.req.param("id"));
  if (!window) return jsonError(c, 404, "No such maintenance window.");
  return c.json({ window: serialize(window) });
});

maintenanceWindows_.patch("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const window = await loadWindow(ctx.orgId, c.req.param("id"));
  if (!window) return jsonError(c, 404, "No such maintenance window.");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const body = parsed.data;

  const set: Partial<MaintenanceWindow> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.checkKeys !== undefined) set.checkKeys = body.checkKeys;
  if (body.startsAt !== undefined) set.startsAt = new Date(body.startsAt);
  if (body.endsAt !== undefined) set.endsAt = new Date(body.endsAt);
  if (body.repeat !== undefined) set.repeat = body.repeat;
  if (body.repeatEndsAt !== undefined) set.repeatEndsAt = body.repeatEndsAt ? new Date(body.repeatEndsAt) : null;

  const startsAt = set.startsAt ?? window.startsAt;
  const endsAt = set.endsAt ?? window.endsAt;
  if (endsAt <= startsAt) return jsonError(c, 422, "endsAt must be after startsAt.");

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .update(maintenanceWindows)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(maintenanceWindows.id, window.id))
      .returning(),
  );
  return c.json({ window: serialize(row!) });
});

maintenanceWindows_.delete("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const window = await loadWindow(ctx.orgId, c.req.param("id"));
  if (!window) return jsonError(c, 404, "No such maintenance window.");
  await withOrg(ctx.orgId, (tx) => tx.delete(maintenanceWindows).where(eq(maintenanceWindows.id, window.id)));
  return c.json({ ok: true });
});
