import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { requireSession } from "@/lib/api-auth.server";
import {
  TOKEN_SCOPES,
  createAccessToken,
  listAccessTokens,
  serializeAccessToken,
  type TokenScope,
} from "@/lib/access-tokens.server";

/**
 * Personal access tokens: credentials that act AS the signed-in person.
 *
 * A PAT carries its owner's organization roles, so it can never do more than
 * they could by hand, and it stops working everywhere their membership ends.
 * That is the right default for a human scripting against their own account,
 * and exactly why it is the wrong tool for a shared production service: use an
 * organization token there, so the credential outlives whoever created it.
 *
 * Session-only, deliberately. A token cannot mint or list tokens; see
 * requireSession for why that matters.
 *
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.error;
  const tokens = await listAccessTokens("user", session.userId);
  return apiJson(tokens.map(serializeAccessToken));
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await requireSession(request);
  if (!session.ok) return session.error;

  const body = await request.json().catch(() => null);
  const scopes = Array.isArray(body?.scopes)
    ? body.scopes.filter(
        (scope: unknown): scope is TokenScope =>
          typeof scope === "string" &&
          TOKEN_SCOPES.includes(scope as TokenScope),
      )
    : [];

  // An expiry is optional but encouraged: a personal token with no end date
  // outlives the laptop it was written on.
  const expiresAt =
    typeof body?.expires_at === "string" ? new Date(body.expires_at) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return apiError(
      400,
      "invalid_token",
      "expires_at must be an ISO 8601 date.",
    );
  }

  const result = await createAccessToken({
    subjectType: "user",
    subjectId: session.userId,
    name: typeof body?.name === "string" ? body.name : "",
    scopes,
    expiresAt,
  });
  if (!result.ok) return apiError(400, "invalid_token", result.error);

  // The only time the secret is ever returned. It is not recoverable later;
  // rotation issues a new one.
  return apiJson(
    { ...serializeAccessToken(result.accessToken), token: result.token },
    { status: 201 },
  );
}
