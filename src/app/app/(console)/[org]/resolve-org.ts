import { cache } from "react";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

/**
 * Membership-gated org lookup for console pages. Non-members and unknown
 * slugs both resolve to null (callers notFound()) so private organizations'
 * existence never leaks. Only authorization failures map to null: anything
 * else (database down, adapter misconfiguration) rethrows so real errors
 * surface as errors instead of masquerading as 404s.
 *
 * React-cached: layouts and pages in the same request share one lookup.
 */
export const resolveOrg = cache(async (slug: string) => {
  try {
    return await auth.api.getFullOrganization({
      query: { organizationSlug: slug },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) return null;
    throw error;
  }
});
