import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { and } from "drizzle-orm";
import { db } from "@/db/client";
import { members } from "@/db/schema";
import { requireSession, resolveOrgAccess } from "@/lib/api-auth.server";
import { users } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { transferOwnership } from "@/lib/org-owner.server";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";

/**
 * The organization's single owner.
 *
 *   GET /api/v1/orgs/:slug/owner            -> who owns it
 *   PUT /api/v1/orgs/:slug/owner {user}     -> transfer ownership; the
 *       previous owner becomes an admin. Only the current owner may do it.
 *
 * Ownership is deliberately NOT settable through the member role endpoint:
 * an organization has exactly one owner. Documented in src/lib/openapi.ts.
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

type FullOrganization = NonNullable<
  Awaited<ReturnType<typeof auth.api.getFullOrganization>>
>;

async function serializeOwner(org: FullOrganization) {
  const owner = org.members.find((member) => member.role === "owner");
  if (!owner) return null;
  const [user] = await db
    .select({ username: users.username, name: users.name })
    .from(users)
    .where(eq(users.id, owner.userId))
    .limit(1);
  return {
    username: user?.username ?? null,
    name: user?.name ?? owner.user.name,
    since: owner.createdAt.toISOString(),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "members:read");
  if (!access.ok) return access.error;

  // Read from the tables so tokens resolve the same owner a session would.
  const [owner] = await db
    .select({
      userId: members.userId,
      createdAt: members.createdAt,
      username: users.username,
      name: users.name,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.organizationId, access.access.org.id), eq(members.role, "owner")))
    .limit(1);
  if (!owner) return apiError(404, "not_found", "Organization not found.");
  return apiJson({
    username: owner.username,
    name: owner.name,
    since: owner.createdAt.toISOString(),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  // Transferring ownership is an identity change that demotes the person
  // making it. It requires a signed-in owner; no token can do it.
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;
  const session = { user: { id: gate.userId } };

  const { slug } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const body = await request.json().catch(() => null);
  const username = typeof body?.user === "string" ? body.user.trim() : "";
  if (!username) {
    return apiError(400, "invalid_subject", "Provide the new owner's username.");
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (!user) {
    return apiError(
      422,
      "not_a_member",
      "That person is not a member of this organization.",
    );
  }

  const result = await transferOwnership({
    orgId: org.id,
    fromUserId: session.user.id,
    toUserId: user.id,
  });
  if (!result.ok) {
    const status = result.code === "not_owner" ? 403 : 422;
    return apiError(status, result.code, result.error);
  }

  const refreshed = await resolveOrg(slug, request.headers);
  const owner = refreshed ? await serializeOwner(refreshed) : null;
  return apiJson(owner ?? { username, name: username, since: null });
}
