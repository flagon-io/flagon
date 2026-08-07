"use server";

import { revalidatePath } from "next/cache";
import { createObjective, deleteObjective, updateObjective, type ObjectiveInput } from "@/lib/objectives-api";

const path = (slug: string) => `/${slug}/incidents/settings/objectives`;

export async function createObjectiveAction(slug: string, body: ObjectiveInput): Promise<{ error?: string }> {
  const res = await createObjective(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(path(slug));
  return {};
}
export async function updateObjectiveAction(slug: string, key: string, body: Partial<ObjectiveInput>): Promise<{ error?: string }> {
  const res = await updateObjective(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(path(slug));
  return {};
}
export async function deleteObjectiveAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deleteObjective(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(path(slug));
  return {};
}
