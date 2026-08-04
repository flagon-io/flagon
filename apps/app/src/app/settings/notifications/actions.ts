"use server";

import { revalidatePath } from "next/cache";
import { addChannel, removeChannel } from "@/lib/notifications-api";

/**
 * Account-level notification-channel actions. Personal + org-agnostic (they hit
 * the /v1/me endpoints), so they live under account settings, not an org.
 */
export async function addChannelAction(body: { type: string; value: string; label?: string }): Promise<{ error?: string }> {
  const res = await addChannel(body);
  if (res.error) return { error: res.error };
  revalidatePath(`/settings/notifications`);
  return {};
}
export async function removeChannelAction(id: string): Promise<{ error?: string }> {
  const res = await removeChannel(id);
  if (res.error) return { error: res.error };
  revalidatePath(`/settings/notifications`);
  return {};
}
