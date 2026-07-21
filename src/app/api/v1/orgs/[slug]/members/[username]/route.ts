import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { requireSession, resolveOrgAccess } from "@/lib/api-auth.server";
import { isAssignableOrgRole } from "@/lib/org-roles";
import { listUserTeams } from "@/lib/teams.server";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";

/**
 * A single organization member, addressed by username.
 *
 *   GET    /api/v1/orgs/:slug/members/:username -> member + their teams
 *   PATCH  /api/v1/orgs/:slug/members/:username {role} -> change role
 *   DELETE /api/v1/orgs/:slug/members/:username -> remove from the org
 *
 * The organization plugin enforces role-management permissions (owners and
 * admins manage; owners are protected from non-owners; the last owner is
 * immovable). Documented in src/lib/openapi.ts; keep the two in sync.
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

async function findMember(org: FullOrganization, username: string) {
  const [user] = await db
    .select({ id: users.id, username: users.username, name: users.name })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (!user) return null;
  const member = org.members.find((m) => m.userId === user.id);
  return member ? { user, member } : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; username: string }> },
) {
  const { slug, username } = await params;
  const access = await resolveOrgAccess(request, slug, "members:read");
  if (!access.ok) return access.error;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const found = await findMember(org, username);
  if (!found) return apiError(404, "not_found", "Member not found.");

  const teams = await listUserTeams(org.id, found.user.id);
  return apiJson({
    id: found.member.id,
    role: found.member.role,
    username: found.user.username,
    name: found.user.name,
    created_at: found.member.createdAt.toISOString(),
    teams: teams.map((team) => ({ id: team.id, name: team.name })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; username: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  // Membership and invitation changes go through BetterAuth, which needs the
  // session, and are identity operations besides. Session-only, deliberately.
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;

  const { slug, username } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const found = await findMember(org, username);
  if (!found) return apiError(404, "not_found", "Member not found.");

  const body = await request.json().catch(() => null);
  const role = typeof body?.role === "string" ? body.role : "";
  if (!isAssignableOrgRole(role)) {
    return apiError(
      400,
      "invalid_role",
      "Role must be one of: member, admin. Ownership moves with PUT /v1/orgs/{slug}/owner.",
    );
  }

  try {
    await auth.api.updateMemberRole({
      body: {
        memberId: found.member.id,
        role: role as "member" | "admin",
        organizationId: org.id,
      },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "update_failed",
        error.body?.message ?? "Could not change the role.",
      );
    }
    throw error;
  }

  return apiJson({
    id: found.member.id,
    role,
    username: found.user.username,
    name: found.user.name,
    created_at: found.member.createdAt.toISOString(),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; username: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  // Membership and invitation changes go through BetterAuth, which needs the
  // session, and are identity operations besides. Session-only, deliberately.
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;

  const { slug, username } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const found = await findMember(org, username);
  if (!found) return apiError(404, "not_found", "Member not found.");

  try {
    await auth.api.removeMember({
      body: { memberIdOrEmail: found.member.id, organizationId: org.id },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "remove_failed",
        error.body?.message ?? "Could not remove the member.",
      );
    }
    throw error;
  }
  return apiNoContent();
}
