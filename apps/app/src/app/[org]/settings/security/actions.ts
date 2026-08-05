"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, ssoProviders } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import {
  createScimToken,
  revokeScimToken,
  updateSecurity,
  type OrgSecurityPosture,
} from "@/lib/security-api";

/**
 * Console actions for the org Security settings page. The posture toggles and
 * SCIM tokens go through the API (security-api → /v1/orgs/:org/security), which
 * authorizes owner/admin. Removing a linked SSO provider is an auth-domain write
 * (the register handshake is BetterAuth's), so it is done here with an explicit
 * manager check.
 */

function revalidate(slug: string) {
  revalidatePath(`/${slug}/settings/security`);
}

export async function updateSecurityAction(
  slug: string,
  patch: Partial<OrgSecurityPosture>,
): Promise<{ error?: string }> {
  const { error } = await updateSecurity(slug, patch);
  if (error) return { error };
  revalidate(slug);
  return {};
}

export async function createScimTokenAction(
  slug: string,
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the token a name." };
  const days = Number(formData.get("expiresInDays") ?? "");
  const { data, error } = await createScimToken(slug, {
    name,
    expiresInDays: Number.isFinite(days) && days > 0 ? days : undefined,
  });
  if (error) return { error };
  revalidate(slug);
  return { token: data?.token.token };
}

export async function revokeScimTokenAction(
  slug: string,
  id: string,
): Promise<{ error?: string }> {
  const { error } = await revokeScimToken(slug, id);
  if (error) return { error };
  revalidate(slug);
  return {};
}

/**
 * Remove the org's linked SSO provider and clear enforcement (so an org can't be
 * left enforcing SSO with no provider to sign in against). Owner/admin only.
 */
export async function removeSsoProviderAction(
  slug: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) return { error: "Organization not found." };
  if (!canManageOrg(membership.role)) {
    return { error: "Only owners and admins can change SSO." };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(ssoProviders)
      .where(eq(ssoProviders.organizationId, membership.id));
    await tx
      .update(organizations)
      .set({ ssoEnforced: false })
      .where(eq(organizations.id, membership.id));
  });
  revalidate(slug);
  return {};
}
