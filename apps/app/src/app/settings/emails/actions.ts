"use server";

import { revalidatePath } from "next/cache";
import {
  addEmailApi,
  resendEmailApi,
  setPrimaryEmailApi,
  removeEmailApi,
} from "@/lib/flags-api";

/**
 * Email-manager server actions. Thin wrappers over the API, which owns the
 * logic: adding stores the address unverified and sends a signed confirmation
 * link; only verified addresses can be made primary or used to sign in.
 */
type Result = { error?: string; ok?: string };

export async function addEmailAction(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const { data, error } = await addEmailApi(email);
  if (error) return { error };
  revalidatePath("/settings/emails");
  return { ok: data?.message };
}

export async function resendEmailVerificationAction(
  formData: FormData,
): Promise<Result> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const { data, error } = await resendEmailApi(email);
  if (error) return { error };
  return { ok: data?.message };
}

export async function setPrimaryEmailAction(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const { data, error } = await setPrimaryEmailApi(email);
  if (error) return { error };
  revalidatePath("/settings/emails");
  return { ok: data?.message };
}

export async function removeEmailAction(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").toLowerCase();
  const { data, error } = await removeEmailApi(email);
  if (error) return { error };
  revalidatePath("/settings/emails");
  return { ok: data?.message };
}
