import { apiError, apiForbiddenOrigin, apiJson, isTrustedOrigin } from "@/lib/api";
import { createAccessToken, listAccessTokens, serializeAccessToken, TOKEN_SCOPES, type TokenScope } from "@/lib/access-tokens.server";
import { isOrgAdmin, resolveSessionOrg } from "../flags/context";

function canManage(context: Awaited<ReturnType<typeof resolveSessionOrg>>) {
  if ("error" in context) return false;
  return isOrgAdmin(context.actor);
}
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!canManage(context)) return apiError(403, "forbidden", "Organization administrators manage tokens.");
  return apiJson((await listAccessTokens("organization", context.org.id)).map(serializeAccessToken));
}
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug } = await params;
  const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!canManage(context)) return apiError(403, "forbidden", "Organization administrators manage tokens.");
  const body = await request.json().catch(() => null);
  const scopes = Array.isArray(body?.scopes) ? body.scopes.filter((scope: unknown): scope is TokenScope => typeof scope === "string" && TOKEN_SCOPES.includes(scope as TokenScope)) : [];
  const result = await createAccessToken({ subjectType: "organization", subjectId: context.org.id, name: typeof body?.name === "string" ? body.name : "", scopes });
  if (!result.ok) return apiError(400, "invalid_token", result.error);
  return apiJson({ ...serializeAccessToken(result.accessToken), token: result.token }, { status: 201 });
}
