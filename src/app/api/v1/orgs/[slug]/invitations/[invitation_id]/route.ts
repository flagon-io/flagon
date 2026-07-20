import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";

/**
 * DELETE /api/v1/orgs/:slug/invitations/:invitation_id -> cancel a pending
 * invitation (the plugin enforces inviter/admin permissions). Documented in
 * src/lib/openapi.ts; keep the two in sync.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; invitation_id: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const { invitation_id } = await params;
  try {
    await auth.api.cancelInvitation({
      body: { invitationId: invitation_id },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      const status = error.statusCode === 400 ? 404 : error.statusCode;
      return apiError(
        status,
        error.body?.code?.toLowerCase() ?? "not_found",
        error.body?.message ?? "Invitation not found.",
      );
    }
    throw error;
  }
  return apiNoContent();
}
