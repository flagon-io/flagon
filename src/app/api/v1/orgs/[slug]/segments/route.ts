import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import {
  createSegment,
  listSegments,
  serializeSegment,
} from "@/lib/segments.server";
import { resolveFlagOrg } from "../flags/context";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:read");
  if ("error" in context) return context.error;
  return apiJson((await listSegments(context.org.id)).map(serializeSegment));
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:write");
  if ("error" in context) return context.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || typeof body.name !== "string")
    return apiError(400, "invalid_segment", "Provide key and name.");
  const result = await createSegment(context.org.id, {
    key: body.key,
    name: body.name,
    description:
      typeof body.description === "string" ? body.description : undefined,
    criteria:
      body.criteria && typeof body.criteria === "object"
        ? body.criteria
        : undefined,
  });
  if (!result.ok)
    return apiError(
      result.code === "key_taken" ? 409 : 400,
      result.code,
      result.error,
    );
  return apiJson(serializeSegment(result.segment), { status: 201 });
}
