import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { organizations } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { isReserved } from "../../lib/reserved.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Organization resource. Mounted at /v1/orgs/:org.
 *
 * PATCH renames an org (name + URL slug). Owner/admin only. The plan is NOT
 * settable here — it changes only through billing (Stripe). This is the API
 * home of what the console settings form used to write directly to the DB.
 */
export const org_ = new Hono();

org_.use("*", authContext);

const updateOrg = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(48),
});

registerComponentSchema(
  "OrgResponse",
  z.object({
    org: z.object({ id: z.string(), name: z.string(), slug: z.string(), plan: z.string() }),
  }),
);

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}",
  summary: "Rename an organization",
  description:
    "Update an organization's display name and URL slug. Owner/admin only. The plan is not settable here — it changes only through billing.",
  tags: ["Organizations"],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  request: { body: updateOrg },
  responses: {
    200: { description: "The updated organization.", schemaName: "OrgResponse" },
    403: { description: "Only owners and admins can change these settings." },
    409: { description: "That URL is already taken." },
    422: { description: "The submitted data failed validation." },
  },
});

org_.patch("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = updateOrg.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const name = parsed.data.name.trim();
  const slug = parsed.data.slug.trim().toLowerCase();

  if (!isValidSlug(slug) || isReserved(slug))
    return jsonError(c, 422, "That URL is invalid or reserved.");

  // Uniqueness (excluding this org).
  const clash = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), ne(organizations.id, ctx.orgId)))
    .limit(1);
  if (clash.length) return jsonError(c, 409, "That URL is already taken.");

  const [row] = await db
    .update(organizations)
    .set({ name, slug })
    .where(eq(organizations.id, ctx.orgId))
    .returning({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
    });

  return c.json({ org: row });
});
