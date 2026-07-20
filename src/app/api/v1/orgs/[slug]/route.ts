import { auth } from "@/lib/auth";
import { apiError, apiJson } from "@/lib/api";
import { serializeOrganization } from "@/lib/organizations";

/**
 * GET /api/v1/orgs/:slug -> a single organization the authenticated user
 * belongs to. Unknown slugs and orgs the user is not a member of both return
 * 404, so private organizations' existence never leaks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const { slug } = await params;
  try {
    const org = await auth.api.getFullOrganization({
      query: { organizationSlug: slug },
      headers: request.headers,
    });
    if (!org) return apiError(404, "not_found", "Organization not found.");
    return apiJson({
      ...serializeOrganization(org),
      members_count: org.members.length,
    });
  } catch {
    return apiError(404, "not_found", "Organization not found.");
  }
}
