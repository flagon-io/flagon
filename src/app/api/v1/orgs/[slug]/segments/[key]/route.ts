import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import {
  deleteSegment,
  getSegment,
  serializeSegment,
  updateSegment,
} from "@/lib/segments.server";
import { resolveFlagOrg } from "../../flags/context";
type Params = { params: Promise<{ slug: string; key: string }> };
export async function GET(request: Request, { params }: Params) {
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:read");
  if ("error" in context) return context.error;
  const segment = await getSegment(context.org.id, key);
  return segment
    ? apiJson(serializeSegment(segment))
    : apiError(404, "not_found", "Segment not found.");
}
export async function PATCH(request: Request, { params }: Params) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:write");
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return apiError(400, "invalid_segment", "Provide fields to update.");
  const result = await updateSegment(context.org.id, key, {
    name: typeof body.name === "string" ? body.name : undefined,
    description:
      body.description === null || typeof body.description === "string"
        ? body.description
        : undefined,
    criteria:
      body.criteria && typeof body.criteria === "object"
        ? body.criteria
        : undefined,
  });
  return result.ok
    ? apiJson(serializeSegment(result.segment))
    : apiError(
        result.code === "not_found" ? 404 : 400,
        result.code,
        result.error,
      );
}
export async function DELETE(request: Request, { params }: Params) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:write");
  if ("error" in context) return context.error;
  return (await deleteSegment(context.org.id, key))
    ? apiNoContent()
    : apiError(404, "not_found", "Segment not found.");
}
