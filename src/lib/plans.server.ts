import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members, organizations } from "@/db/schema";

/**
 * Database-backed plan queries (server only; pure plan data lives in
 * plans.ts so client components can render the selector).
 */

/**
 * Does this user already OWN a free organization? Drives the one-free-org
 * rule: the Free card disables in the selector and creation rejects
 * server-side. Only ownership counts; being invited into someone else's free
 * org shouldn't spend yours.
 */
export async function userOwnsFreeOrg(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(
      and(
        eq(members.userId, userId),
        eq(members.role, "owner"),
        eq(organizations.plan, "free"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
