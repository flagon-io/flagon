import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members, organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  isOrgAdmin,
  requireSession,
  resolveOrgAccess,
} from "@/lib/api-auth.server";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  apiNoContent,
  isTrustedOrigin,
} from "@/lib/api";
import { serializeOrganization } from "@/lib/organizations";
import { normalizeOrgSlug, validateOrgSlug } from "@/lib/org-slug";

/**
 * A single organization.
 *
 *   GET    /api/v1/orgs/:slug              -> the organization
 *   PATCH  /api/v1/orgs/:slug {name, slug} -> rename (admins) / change the
 *          slug (owner only: every URL for the org moves with it)
 *   DELETE /api/v1/orgs/:slug              -> delete it (owner only)
 *
 * Unknown slugs and orgs the user is not a member of both return 404, so
 * private organizations' existence never leaks. Documented in
 * src/lib/openapi.ts; keep the two in sync.
 */
/** Members are counted rather than loaded; the list has its own endpoint. */
async function memberCount(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, orgId));
  return rows.length;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "org:read");
  if (!access.ok) return access.error;
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, access.access.org.id))
    .limit(1);
  return apiJson({
    ...serializeOrganization(org),
    members_count: await memberCount(org.id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "org:write");
  if (!access.ok) return access.error;
  const { actor } = access.access;
  const org = access.access.org;
  if (!isOrgAdmin(actor)) {
    return apiError(403, "forbidden", "Organization admin access required.");
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const nextSlug =
    typeof body?.slug === "string" ? normalizeOrgSlug(body.slug) : undefined;
  if (name === undefined && nextSlug === undefined) {
    return apiError(
      400,
      "nothing_to_update",
      "Provide at least one of: name, slug.",
    );
  }
  if (name !== undefined && (!name || name.length > 100)) {
    return apiError(
      400,
      "invalid_name",
      "Provide a name (at most 100 characters).",
    );
  }
  if (nextSlug !== undefined && nextSlug !== slug) {
    // Renaming the slug moves every URL the organization has. That is an
    // identity change, so it needs the owner in person: a token cannot do it
    // however broadly it is scoped.
    if (actor.kind === "org_token" || actor.role !== "owner") {
      return apiError(
        403,
        "forbidden",
        "Only the organization's owner, signed in, can change the slug.",
      );
    }
    const validation = validateOrgSlug(nextSlug);
    if (!validation.ok) {
      return apiError(400, "invalid_organization_slug", validation.error);
    }
  }

  try {
    if (nextSlug !== undefined && nextSlug !== slug) {
      await auth.api.updateOrganization({
        body: { data: { slug: nextSlug }, organizationId: org.id },
        headers: request.headers,
      });
    }
    if (name !== undefined) {
      await db
        .update(organizations)
        .set({ name, updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
    }
  } catch (error) {
    if (error instanceof APIError) {
      const code = error.body?.code?.toLowerCase() ?? "update_failed";
      const status = code.includes("already") ? 409 : error.statusCode;
      return apiError(
        status,
        code,
        error.body?.message ?? "Could not update the organization.",
      );
    }
    throw error;
  }

  const [updated] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  return apiJson({
    ...serializeOrganization(updated),
    members_count: await memberCount(org.id),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  // Deleting an organization is irreversible from the caller's point of view,
  // so it requires a signed-in owner. No token, at any scope, can do it.
  const { slug } = await params;
  const gate = await requireSession(request);
  if (!gate.ok) return gate.error;
  const access = await resolveOrgAccess(request, slug, "org:write");
  if (!access.ok) return access.error;
  const org = access.access.org;
  const deleter = access.access.actor;
  if (deleter.kind === "org_token" || deleter.role !== "owner") {
    return apiError(
      403,
      "forbidden",
      "Only the organization's owner can delete it.",
    );
  }

  try {
    await auth.api.deleteOrganization({
      body: { organizationId: org.id },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "delete_failed",
        error.body?.message ?? "Could not delete the organization.",
      );
    }
    throw error;
  }
  return apiNoContent();
}
