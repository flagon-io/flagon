"use server";

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { isReserved } from "@/lib/reserved";
import { isValidSlug } from "@/lib/slug";
import { isPlanId, isSelectablePlan } from "@/lib/plans";

type Result = { error?: string; ok?: string; newSlug?: string };

/**
 * Update an organization's name, URL slug, and plan. Owner/admin only. Slug
 * changes are validated (shape + reserved + uniqueness) and reported back so the
 * client can navigate to the new URL.
 */
export async function updateOrgAction(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const currentSlug = String(formData.get("currentSlug") ?? "");
  const membership = await getMembershipBySlug(user.id, currentSlug);
  if (!membership) return { error: "Organization not found." };
  if (!canManageOrg(membership.role))
    return { error: "You do not have permission to change these settings." };

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const plan = String(formData.get("plan") ?? "");

  if (!name) return { error: "Give your organization a name." };
  if (!isValidSlug(slug) || isReserved(slug))
    return { error: "That URL is invalid or reserved." };
  if (!isPlanId(plan)) return { error: "Choose a valid plan." };
  // Enterprise is not available during the alpha: block changing INTO an
  // unavailable plan, but allow keeping whatever the org is already on.
  if (plan !== membership.plan && !isSelectablePlan(plan))
    return { error: "That plan is not available yet." };

  // Uniqueness (excluding this org).
  if (slug !== membership.slug) {
    const clash = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, slug), ne(organizations.id, membership.id)))
      .limit(1);
    if (clash.length) return { error: "That URL is already taken." };
  }

  await db
    .update(organizations)
    .set({ name, slug, plan })
    .where(eq(organizations.id, membership.id));

  return {
    ok: "Organization updated.",
    newSlug: slug !== membership.slug ? slug : undefined,
  };
}
