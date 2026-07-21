import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import {
  createClientToken,
  listClientTokens,
  serializeClientToken,
} from "@/lib/client-tokens.server";
import { isOrgAdmin, resolveSessionOrg } from "../flags/context";

function canManage(context: Awaited<ReturnType<typeof resolveSessionOrg>>) {
  if ("error" in context) return false;
  return isOrgAdmin(context.actor);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!canManage(context))
    return apiError(
      403,
      "forbidden",
      "Organization administrators manage client tokens.",
    );
  return apiJson(
    (await listClientTokens(context.org.id)).map(serializeClientToken),
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug } = await params;
  const context = await resolveSessionOrg(request, slug);
  if ("error" in context) return context.error;
  if (!canManage(context))
    return apiError(
      403,
      "forbidden",
      "Organization administrators manage client tokens.",
    );
  const body = await request.json().catch(() => null);
  const result = await createClientToken(
    context.org.id,
    typeof body?.name === "string" ? body.name : "",
  );
  if (!result.ok) return apiError(400, "invalid_token", result.error);
  return apiJson(
    { ...serializeClientToken(result.clientToken), token: result.token },
    { status: 201 },
  );
}
