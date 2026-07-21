import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/api-auth.server";
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
  // Cancelling an invitation is an identity operation and runs through
  // BetterAuth, which needs the session. Session-only, deliberately.
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;

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
