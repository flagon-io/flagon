"use server";

import { revalidatePath } from "next/cache";
import { createOrgApiToken, revokeOrgApiToken } from "@/lib/flags-api";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Organization token actions. Thin wrappers over the API, which owns token
 * minting/revoking and authorizes the caller (owner/admin, cookie-forwarded).
 */
export async function createOrgTokenAction(
  slug: string,
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your token a name." };

  const days = Number(formData.get("expiresInDays") ?? "");
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * DAY_MS).toISOString()
      : undefined;

  const { data, error } = await createOrgApiToken(slug, { name, expiresAt });
  if (error) return { error };
  revalidatePath(`/${slug}/settings/tokens`);
  return { token: data?.token.token };
}

export async function revokeOrgTokenAction(
  slug: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const { error } = await revokeOrgApiToken(slug, String(formData.get("id") ?? ""));
  if (error) return { error };
  revalidatePath(`/${slug}/settings/tokens`);
  return {};
}
