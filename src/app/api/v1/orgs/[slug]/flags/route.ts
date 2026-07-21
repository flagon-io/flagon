import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { createFlag, listFlags, serializeFlag } from "@/lib/flags.server";
import { resolveFlagOrg } from "./context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:read");
  if ("error" in context) return context.error;
  return apiJson((await listFlags(context.org.id)).map(serializeFlag));
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
  // `name` is optional: createFlag names the flag after its key when it is
  // omitted, which is what the console relies on since its create form asks
  // for the key alone.
  if (!body || typeof body.key !== "string") {
    return apiError(400, "invalid_flag", "Provide a key.");
  }
  const result = await createFlag(context.org.id, {
    key: body.key,
    name: typeof body.name === "string" ? body.name : undefined,
    description:
      typeof body.description === "string" ? body.description : undefined,
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
      result.code === "key_taken" ? 409 : 400,
      result.code,
      result.error,
    );
  return apiJson(serializeFlag(result.flag), { status: 201 });
}
