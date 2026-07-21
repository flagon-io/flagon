import { apiError, apiForbiddenOrigin, apiJson, apiNoContent, isTrustedOrigin } from "@/lib/api";
import { revokeClientToken, rotateClientToken, serializeClientToken } from "@/lib/client-tokens.server";
import { isOrgAdmin, resolveSessionOrg } from "../../flags/context";
function canManage(context: Awaited<ReturnType<typeof resolveSessionOrg>>) {
  if ("error" in context) return false;
  return isOrgAdmin(context.actor);
}
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; token_id: string }> }) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, token_id: id } = await params; const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!canManage(context)) return apiError(403, "forbidden", "Organization administrators manage client tokens.");
  const result = await rotateClientToken(context.org.id, id);
  return result.ok ? apiJson(serializeClientToken(result.clientToken)) : apiError(404, "not_found", "Client token not found.");
}
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; token_id: string }> }) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, token_id: id } = await params;
  const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!canManage(context)) return apiError(403, "forbidden", "Organization administrators manage client tokens.");
  return await revokeClientToken(context.org.id, id) ? apiNoContent() : apiError(404, "not_found", "Client token not found.");
}
