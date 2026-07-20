import { APIError } from "better-auth/api";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { apiError, apiJson } from "@/lib/api";

/**
 * GET /api/v1/orgs/:slug/members -> the organization's member roster.
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
async function resolveOrg(slug: string, headers: Headers) {
  try {
    return await auth.api.getFullOrganization({
      query: { organizationSlug: slug },
      headers,
    });
  } catch (error) {
    // Authorization failures are 404s (no existence leak); real errors surface.
    if (error instanceof APIError) return null;
    throw error;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const { slug } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const userIds = org.members.map((member) => member.userId);
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const usernames = new Map(userRows.map((row) => [row.id, row.username]));

  const members = [...org.members]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((member) => ({
      id: member.id,
      role: member.role,
      username: usernames.get(member.userId) ?? null,
      name: member.user.name,
      created_at: member.createdAt.toISOString(),
    }));
  return apiJson(members);
}
