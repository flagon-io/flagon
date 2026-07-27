"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import {
  createAccessToken,
  revokeOrgToken,
} from "@/lib/access-token";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Organization token actions. The org slug is bound in the page
 * (`action.bind(null, slug)`), and the caller's owner/admin role is re-checked
 * here on every call.
 */
export async function createOrgTokenAction(
  slug: string,
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  const user = await requireUser();
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership || !canManageOrg(membership.role))
    return { error: "You do not have permission to create tokens." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your token a name." };

  const days = Number(formData.get("expiresInDays") ?? "");
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * DAY_MS)
      : null;

  const { token } = await createAccessToken({
    type: "organization",
    name,
    ownerId: membership.id,
    createdByUserId: user.id,
    expiresAt,
  });
  revalidatePath(`/${slug}/settings/tokens`);
  return { token };
}

export async function revokeOrgTokenAction(
  slug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership || !canManageOrg(membership.role))
    return { error: "You do not have permission." };

  await revokeOrgToken(membership.id, String(formData.get("id") ?? ""));
  revalidatePath(`/${slug}/settings/tokens`);
  return {};
}
