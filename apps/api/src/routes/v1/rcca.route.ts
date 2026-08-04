import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { rccaTemplates } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { ensureRccaTemplate } from "../../incidents/rcca-template.js";

/**
 * The org's RCCA template — CUSTOMIZABLE: the fields an RCCA captures and which
 * severities require one. Seeded with a standard template on first read. Mounted
 * at /v1/orgs/:org/rcca-template. Any member reads; owner/admin edits.
 */
export const rcca_ = new Hono();
rcca_.use("*", authContext);

const TAG = "Runbooks";
const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;

const fieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]+$/i, "letters, numbers, underscores").min(1).max(60),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  required: z.boolean().optional(),
});
const putBody = z
  .object({
    fields: z.array(fieldSchema).max(20),
    requiredSeverities: z.array(z.enum(SEVERITIES)).max(4),
  })
  .strict();

const templateSchema = z.object({
  requiredSeverities: z.array(z.string()),
  fields: z.array(z.object({ key: z.string(), label: z.string(), description: z.string().optional(), required: z.boolean().optional() })),
});
registerComponentSchema("RccaTemplate", templateSchema);

const p = { org: "The organization slug." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/rcca-template", summary: "Get the RCCA template", description: "The org's RCCA fields + which severities require one (standard template by default).", tags: [TAG], auth: true, paramDescriptions: p, responses: { 200: { description: "The template.", schemaName: "RccaTemplate" } } });
registerRoute({ method: "put", path: "/v1/orgs/{org}/rcca-template", summary: "Update the RCCA template", description: "Customize the RCCA fields and required severities. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: p, request: { body: putBody }, responses: { 200: { description: "Updated.", schemaName: "RccaTemplate" }, 422: { description: "Validation failed." } } });

rcca_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const t = await withOrg(ctx.orgId, (tx) => ensureRccaTemplate(tx, ctx.orgId));
  return c.json({ requiredSeverities: t.requiredSeverities, fields: t.fields });
});

rcca_.put("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = putBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  // Dedupe field keys (last wins) so values never collide.
  const seen = new Set<string>();
  const fields = parsed.data.fields.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  const t = await withOrg(ctx.orgId, async (tx) => {
    await ensureRccaTemplate(tx, ctx.orgId);
    const [row] = await tx.update(rccaTemplates).set({ fields, requiredSeverities: parsed.data.requiredSeverities, updatedAt: new Date() }).where(eq(rccaTemplates.organizationId, ctx.orgId)).returning();
    return row;
  });
  return c.json({ requiredSeverities: t.requiredSeverities, fields: t.fields });
});
