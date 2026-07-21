import { apiError, apiForbiddenOrigin, apiJson, apiNoContent, isTrustedOrigin } from "@/lib/api";
import { revokeAccessToken, rotateAccessToken, serializeAccessToken } from "@/lib/access-tokens.server";
import { isOrgAdmin, resolveSessionOrg } from "../../flags/context";
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; token_id: string }> }) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, token_id: id } = await params;
  const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!isOrgAdmin(context.actor)) return apiError(403, "forbidden", "Organization administrators manage tokens.");
  return await revokeAccessToken("organization", context.org.id, id) ? apiNoContent() : apiError(404, "not_found", "Token not found.");
}
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; token_id: string }> }) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, token_id: id } = await params; const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!isOrgAdmin(context.actor)) return apiError(403, "forbidden", "Organization administrators manage tokens.");
  const result = await rotateAccessToken("organization", context.org.id, id);
  return result.ok ? apiJson({ ...serializeAccessToken(result.accessToken), token: result.token }) : apiError(404, "not_found", "Token not found.");
}
