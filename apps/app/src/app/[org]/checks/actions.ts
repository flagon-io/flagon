"use server";

import { revalidatePath } from "next/cache";
import {
  activateCheck,
  createAlertChannel,
  createCheck,
  deleteAlertChannel,
  deleteCheck,
  muteCheck,
  runCheck,
  testAlertChannel,
  updateAlertChannel,
  updateCheck,
  createMaintenanceWindow,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
  type CheckInput,
  type CheckResult,
  type ChannelInput,
  type MaintenanceWindowInput,
} from "@/lib/checks-api";

/**
 * Server actions for the Checks product. Thin wrappers over the API client (which
 * forwards the session cookie, so the API authorizes org + role), then revalidate.
 * Authorization lives in the API.
 */

export async function createCheckAction(
  slug: string,
  body: CheckInput,
): Promise<{ key?: string; error?: string }> {
  const res = await createCheck(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks`);
  return { key: res.data?.check.key };
}

export async function updateCheckAction(
  slug: string,
  key: string,
  body: Record<string, unknown>,
): Promise<{ error?: string }> {
  const res = await updateCheck(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/${key}`);
  revalidatePath(`/${slug}/checks`);
  return {};
}

export async function deleteCheckAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deleteCheck(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks`);
  return {};
}

export async function runCheckAction(
  slug: string,
  key: string,
): Promise<{ result?: CheckResult; error?: string }> {
  const res = await runCheck(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/${key}`);
  revalidatePath(`/${slug}/checks`);
  return { result: res.data };
}

export async function muteCheckAction(slug: string, key: string, muted: boolean): Promise<{ error?: string }> {
  const res = await muteCheck(slug, key, muted);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks`);
  return {};
}

export async function activateCheckAction(
  slug: string,
  key: string,
  activated: boolean,
): Promise<{ error?: string }> {
  const res = await activateCheck(slug, key, activated);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks`);
  return {};
}

// --- Alert channels ---------------------------------------------------------

export async function createAlertChannelAction(
  slug: string,
  body: ChannelInput,
): Promise<{ id?: string; error?: string }> {
  const res = await createAlertChannel(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/alert-channels`);
  return { id: res.data?.channel.id };
}

export async function updateAlertChannelAction(
  slug: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ error?: string }> {
  const res = await updateAlertChannel(slug, id, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/alert-channels`);
  return {};
}

export async function deleteAlertChannelAction(slug: string, id: string): Promise<{ error?: string }> {
  const res = await deleteAlertChannel(slug, id);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/alert-channels`);
  return {};
}

export async function testAlertChannelAction(slug: string, id: string): Promise<{ error?: string }> {
  const res = await testAlertChannel(slug, id);
  if (res.error) return { error: res.error };
  return {};
}

// --- Maintenance windows ----------------------------------------------------

export async function createMaintenanceWindowAction(
  slug: string,
  body: MaintenanceWindowInput,
): Promise<{ id?: string; error?: string }> {
  const res = await createMaintenanceWindow(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/maintenance`);
  return { id: res.data?.window.id };
}

export async function updateMaintenanceWindowAction(
  slug: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ error?: string }> {
  const res = await updateMaintenanceWindow(slug, id, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/maintenance`);
  return {};
}

export async function deleteMaintenanceWindowAction(slug: string, id: string): Promise<{ error?: string }> {
  const res = await deleteMaintenanceWindow(slug, id);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/checks/maintenance`);
  return {};
}
