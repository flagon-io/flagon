import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { requireSession } from "@/lib/api-auth.server";
import {
  revokeAccessToken,
  rotateAccessToken,
  serializeAccessToken,
} from "@/lib/access-tokens.server";

/**
 * Revoke or rotate one personal access token. Scoped to the caller's own
 * tokens: the subject is taken from the session, never from the request, so
 * one person can never reach another's credentials by guessing an id.
 *
 * Session-only, like every token-management route.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token_id: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await requireSession(request);
  if (!session.ok) return session.error;

  const { token_id: id } = await params;
  return (await revokeAccessToken("user", session.userId, id))
    ? apiNoContent()
    : apiError(404, "not_found", "Token not found.");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token_id: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await requireSession(request);
  if (!session.ok) return session.error;

  const { token_id: id } = await params;
  const result = await rotateAccessToken("user", session.userId, id);
  // Rotation keeps the token's identity, name, and scopes and replaces only
  // the secret, so a leaked credential is revoked without re-granting access
  // anywhere that references it.
  return result.ok
    ? apiJson({
        ...serializeAccessToken(result.accessToken),
        token: result.token,
      })
    : apiError(404, "not_found", "Token not found.");
}
