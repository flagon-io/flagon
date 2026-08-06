"use server";

import { revalidatePath } from "next/cache";
import {
  createAlertChannel,
  deleteAlertChannel,
  testAlertChannel,
  updateAlertChannel,
  type AlertChannelBody,
} from "@/lib/alert-channels-api";

/**
 * Server actions for alert channels. Thin wrappers over the API client; the API
 * authorizes org + role and encrypts secrets.
 */

export async function createAlertChannelAction(slug: string, body: AlertChannelBody): Promise<{ key?: string; error?: string }> {
  const res = await createAlertChannel(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/settings/alert-channels`);
  return { key: res.data?.key };
}
export async function updateAlertChannelAction(slug: string, key: string, body: AlertChannelBody): Promise<{ error?: string }> {
  const res = await updateAlertChannel(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/settings/alert-channels`);
  return {};
}
export async function deleteAlertChannelAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deleteAlertChannel(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/settings/alert-channels`);
  return {};
}
export async function testAlertChannelAction(slug: string, key: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await testAlertChannel(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/settings/alert-channels`);
  return { ok: res.data?.ok, error: res.data?.error ?? undefined };
}
