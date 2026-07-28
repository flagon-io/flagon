import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { members, users } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { resolveOrg } from "../../lib/org-context.js";

/**
 * Org members, for pickers like a flag's maintainer. Mounted under
 * /v1/orgs/:org/members. Reads auth-layer tables (members + users), scoped by
 * the resolved org.
 */
export const members_ = new Hono();
members_.use("*", authContext);

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
