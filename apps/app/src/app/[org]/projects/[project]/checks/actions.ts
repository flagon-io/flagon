"use server";

import { revalidatePath } from "next/cache";
import {
  createCheck,
  deleteCheck,
  pauseCheck,
  runCheck,
  updateCheck,
  type CheckBody,
} from "@/lib/checks-api";

/**
 * Server actions for Checks. Thin wrappers over the API client (which forwards the
 * session cookie, so the API authorizes org + role), then revalidate. Authorization
 * lives in the API.
 */

function revalidate(slug: string, projectKey: string, checkKey?: string) {
  revalidatePath(`/${slug}/projects/${projectKey}/checks`);
  revalidatePath(`/${slug}/checks`);
  if (checkKey) revalidatePath(`/${slug}/projects/${projectKey}/checks/${checkKey}`);
}

export async function createCheckAction(slug: string, projectKey: string, body: CheckBody): Promise<{ key?: string; error?: string }> {
  const res = await createCheck(slug, projectKey, body);
  if (res.error) return { error: res.error };
  revalidate(slug, projectKey);
  return { key: res.data?.key };
}
export async function updateCheckAction(slug: string, projectKey: string, checkKey: string, body: CheckBody): Promise<{ error?: string }> {
  const res = await updateCheck(slug, projectKey, checkKey, body);
  if (res.error) return { error: res.error };
  revalidate(slug, projectKey, checkKey);
  return {};
}
export async function deleteCheckAction(slug: string, projectKey: string, checkKey: string): Promise<{ error?: string }> {
  const res = await deleteCheck(slug, projectKey, checkKey);
  if (res.error) return { error: res.error };
  revalidate(slug, projectKey);
  return {};
}
export async function pauseCheckAction(slug: string, projectKey: string, checkKey: string, paused: boolean): Promise<{ error?: string }> {
  const res = await pauseCheck(slug, projectKey, checkKey, paused);
  if (res.error) return { error: res.error };
  revalidate(slug, projectKey, checkKey);
  return {};
}
export async function runCheckAction(
  slug: string,
  projectKey: string,
  checkKey: string,
): Promise<{ ok?: boolean; statusCode?: number | null; responseMs?: number | null; status?: string; error?: string }> {
  const res = await runCheck(slug, projectKey, checkKey);
  if (res.error) return { error: res.error };
  revalidate(slug, projectKey, checkKey);
  return { ok: res.data?.ok, statusCode: res.data?.statusCode, responseMs: res.data?.responseMs, status: res.data?.status };
}
