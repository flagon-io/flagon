import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { members, users } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { resolveOrg } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Org members, for pickers like a flag's maintainer. Mounted under
 * /v1/orgs/:org/members. Reads auth-layer tables (members + users), scoped by
 * the resolved org.
 */
export const members_ = new Hono();
members_.use("*", authContext);

// --- OpenAPI registration ----------------------------------------------------
// The GET handler returns a row per member: the member's user id and role,
// joined to the user's name and email (all non-null).
const memberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
});
registerComponentSchema("Member", memberSchema);
registerComponentSchema("MemberListResponse", z.object({ members: z.array(memberSchema) }));

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/members",
  summary: "List members",
  description: "List the organization's members with their name, email, and role.",
  tags: ["Members"],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: {
    200: { description: "The organization's members.", schemaName: "MemberListResponse" },
  },
});

members_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const rows = await db
    .select({
      userId: members.userId,
      name: users.name,
      email: users.email,
      role: members.role,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, ctx.orgId));

  return c.json({ members: rows });
});
