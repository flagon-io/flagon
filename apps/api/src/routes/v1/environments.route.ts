import { Hono } from "hono";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { environments } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { resolveOrg } from "../../lib/org-context.js";
import { ensureEnvironments } from "../../flags/environments.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Environments — the deployment stages flags are configured per. Mounted under
 * /v1/orgs/:org/environments.
 *
 * These are a FIXED set (Production, Preview, Development), mirroring the stages
 * a team ships through — not user-configurable, like Vercel. They are seeded on
 * first read and every new flag gets a config row for each; there is
 * deliberately no create/delete endpoint.
 */
export const environments_ = new Hono();
environments_.use("*", authContext);

function serialize(e: typeof environments.$inferSelect) {
  return { id: e.id, key: e.key, name: e.name, sortOrder: e.sortOrder };
}

// --- Response component schemas ----------------------------------------------
const environmentSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  sortOrder: z.number(),
});
registerComponentSchema("Environment", environmentSchema);
registerComponentSchema(
  "EnvironmentListResponse",
  z.array(environmentSchema),
);

// --- OpenAPI registration ----------------------------------------------------
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/environments",
  summary: "List environments",
  description:
    "List the organization's environments (Production, Preview, Development), seeded on first read.",
  tags: ["Environments"],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: {
    200: { description: "The organization's environments.", schemaName: "EnvironmentListResponse" },
  },
});

environments_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) => ensureEnvironments(tx, ctx.orgId));
  return c.json(rows.map(serialize));
});
