import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members, organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireSession, resolveUserAccess } from "@/lib/api-auth.server";
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
  // "Which organizations am I in" is a question about a PERSON, so a personal
  // token answers it and an organization token cannot: it belongs to exactly
  // one organization and has no membership to enumerate.
  const access = await resolveUserAccess(request, "org:read");
  if (!access.ok) return access.error;

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo: organizations.logo,
      plan: organizations.plan,
      createdAt: organizations.createdAt,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, access.userId))
    .orderBy(organizations.createdAt);
  return apiJson(rows.map(serializeOrganization));
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  // Creating an organization makes the caller its owner and can attach a
  // plan, so it needs a real person: an org token creating organizations
  // would be creating things it can never itself reach.
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;

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
      return apiError(
        400,
        "create_failed",
        "Could not create the organization.",
      );
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
