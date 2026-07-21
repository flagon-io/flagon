import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { requireSession, resolveOrgAccess } from "@/lib/api-auth.server";
import { pendingInvitations } from "@/lib/invitations";
import { isAssignableOrgRole } from "@/lib/org-roles";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";

/**
 * Invitations into an organization.
 *
 *   GET  /api/v1/orgs/:slug/invitations -> pending invitations
 *   POST /api/v1/orgs/:slug/invitations -> invite by { user: "<username>" }
 *        (existing account, routed to its primary email) or
 *        { email: "..." }, plus role. The plugin sends the emailed link;
 *        accepting is a browser flow.
 *
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

function serializeInvitation(invitation: {
  id: string;
  email: string;
  role?: string | null;
  status: string;
  expiresAt: Date;
}) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role ?? "member",
    status: invitation.status,
    expires_at: new Date(invitation.expiresAt).toISOString(),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "members:read");
  if (!access.ok) return access.error;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const invitations = await auth.api.listInvitations({
    query: { organizationId: org.id },
    headers: request.headers,
  });
  return apiJson(pendingInvitations(invitations).map(serializeInvitation));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  // Membership and invitation changes go through BetterAuth, which needs the
  // session, and are identity operations besides. Session-only, deliberately.
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;

  const { slug } = await params;
  const org = await resolveOrg(slug, request.headers);
  if (!org) return apiError(404, "not_found", "Organization not found.");

  const body = await request.json().catch(() => null);
  const role = typeof body?.role === "string" ? body.role : "member";
  const username = typeof body?.user === "string" ? body.user.trim() : "";
  const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";

  if (!isAssignableOrgRole(role)) {
    return apiError(
      400,
      "invalid_role",
      "Role must be one of: member, admin. Ownership is transferred, not invited.",
    );
  }
  if ((username && rawEmail) || (!username && !rawEmail)) {
    return apiError(400, "invalid_subject", "Provide exactly one of: user, email.");
  }

  let email = rawEmail.toLowerCase();
  if (username) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);
    if (!user) {
      return apiError(
        422,
        "unknown_user",
        "No account with that username. Invite by email instead.",
      );
    }
    email = user.email;
  }

  try {
    const invitation = await auth.api.createInvitation({
      body: {
        email,
        role: role as "member" | "admin",
        organizationId: org.id,
        resend: true,
      },
      headers: request.headers,
    });
    return apiJson(serializeInvitation(invitation), { status: 201 });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "invite_failed",
        error.body?.message ?? "Could not send the invitation.",
      );
    }
    throw error;
  }
}
