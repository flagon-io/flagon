"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  createAccessToken,
  revokePersonalToken,
} from "@/lib/access-token";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createPersonalTokenAction(
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give your token a name." };

  const days = Number(formData.get("expiresInDays") ?? "");
  const expiresAt =
    Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * DAY_MS) : null;

  const { token } = await createAccessToken({
    type: "personal",
    name,
    ownerId: user.id,
    createdByUserId: user.id,
    expiresAt,
  });
  revalidatePath("/settings/tokens");
  return { token };
}

export async function revokePersonalTokenAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  await revokePersonalToken(user.id, String(formData.get("id") ?? ""));
  revalidatePath("/settings/tokens");
  return {};
}
