"use server";

import { revalidatePath } from "next/cache";
import { createPersonalApiToken, revokePersonalApiToken } from "@/lib/flags-api";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Personal token actions. Thin wrappers over the API, which owns token
 * minting/revoking and authorizes via the forwarded session cookie.
 */
export async function createPersonalTokenAction(
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your token a name." };

  const days = Number(formData.get("expiresInDays") ?? "");
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * DAY_MS).toISOString()
      : undefined;

  const { data, error } = await createPersonalApiToken({ name, expiresAt });
  if (error) return { error };
  revalidatePath("/settings/tokens");
  return { token: data?.token.token };
}

export async function revokePersonalTokenAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { error } = await revokePersonalApiToken(String(formData.get("id") ?? ""));
  if (error) return { error };
  revalidatePath("/settings/tokens");
  return {};
}
