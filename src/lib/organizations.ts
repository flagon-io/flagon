/**
 * Public REST shape for an organization (snake_case), shared by the v1
 * routes and anything else that serializes orgs.
 */
export function serializeOrganization(org: {
  id: string;
  slug?: string | null;
  name: string;
  logo?: string | null;
  plan?: string;
  createdAt: Date;
}) {
  return {
    id: org.id,
    slug: org.slug ?? null,
    name: org.name,
    logo: org.logo ?? null,
    plan: org.plan ?? "free",
    created_at: org.createdAt.toISOString(),
  };
}
