import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";
import { serializeOrganization } from "@/lib/organizations";
import { validateOrgSlug } from "@/lib/org-slug";

/**
 * Organizations the authenticated user belongs to.
 *
 *   GET  /api/v1/orgs               -> list
 *   POST /api/v1/orgs {name, slug}  -> create (creator becomes owner)
 *
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const orgs = await auth.api.listOrganizations({ headers: request.headers });
  return apiJson(orgs.map(serializeOrganization));
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const plan = typeof body?.plan === "string" ? body.plan : undefined;
  if (!name || !slug) {
    return apiError(400, "invalid_organization", "Provide name and slug.");
  }
  const validation = validateOrgSlug(slug);
  if (!validation.ok) {
    return apiError(400, "invalid_organization_slug", validation.error);
  }

  try {
    const org = await auth.api.createOrganization({
      // plan is an additionalField on the organization model; validated in
      // the beforeCreateOrganization hook (one free org per account, etc).
      body: { name, slug, ...(plan ? { plan } : {}) } as {
        name: string;
        slug: string;
      },
      headers: request.headers,
    });
    if (!org) {
      return apiError(400, "create_failed", "Could not create the organization.");
    }
    return apiJson(serializeOrganization(org), { status: 201 });
  } catch (error) {
    if (error instanceof APIError) {
      const code = error.body?.code?.toLowerCase() ?? "create_failed";
      const status = code.includes("already") ? 409 : error.statusCode;
      return apiError(
        status,
        code,
        error.body?.message ?? "Could not create the organization.",
      );
    }
    throw error;
  }
}
