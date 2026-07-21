import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import {
  deleteFlag,
  getFlag,
  serializeFlag,
  updateFlag,
} from "@/lib/flags.server";
import { resolveFlagOrg } from "../context";

type Params = { params: Promise<{ slug: string; key: string }> };

export async function GET(request: Request, { params }: Params) {
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:read");
  if ("error" in context) return context.error;
  const flag = await getFlag(context.org.id, key);
  return flag
    ? apiJson(serializeFlag(flag))
    : apiError(404, "not_found", "Flag not found.");
}

export async function PATCH(request: Request, { params }: Params) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:write");
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return apiError(400, "invalid_flag", "Provide fields to update.");
  const result = await updateFlag(context.org.id, key, {
    name: typeof body.name === "string" ? body.name : undefined,
    description:
      body.description === null || typeof body.description === "string"
        ? body.description
        : undefined,
    type: typeof body.type === "string" ? body.type : undefined,
    variants: Array.isArray(body.variants) ? body.variants : undefined,
    defaultVariant:
      typeof body.default_variant === "string"
        ? body.default_variant
        : undefined,
    rules: Array.isArray(body.rules) ? body.rules : undefined,
  });
  if (!result.ok)
    return apiError(
      result.code === "not_found" ? 404 : 400,
      result.code,
      result.error,
    );
  return apiJson(serializeFlag(result.flag));
}

export async function DELETE(request: Request, { params }: Params) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:write");
  if ("error" in context) return context.error;
  return (await deleteFlag(context.org.id, key))
    ? apiNoContent()
    : apiError(404, "not_found", "Flag not found.");
}
