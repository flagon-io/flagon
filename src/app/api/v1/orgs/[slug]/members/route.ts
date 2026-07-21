import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { members } from "@/db/schema";
import { apiJson } from "@/lib/api";
import { resolveOrgAccess } from "@/lib/api-auth.server";

/**
 * GET /api/v1/orgs/:slug/members -> the organization's member roster.
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "members:read");
  if (!access.ok) return access.error;

  // Read straight from the tables so a token and a session resolve the same
  // roster; the plugin's helper needs a session and would exclude tokens.
  const rows = await db
    .select({
      id: members.id,
      role: members.role,
      createdAt: members.createdAt,
      userId: members.userId,
      name: users.name,
      username: users.username,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, access.access.org.id));

  return apiJson(
    rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((member) => ({
        id: member.id,
        role: member.role,
        username: member.username,
        name: member.name,
        created_at: member.createdAt.toISOString(),
      })),
  );
}
