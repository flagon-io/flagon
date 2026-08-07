"use server";

import { revalidatePath } from "next/cache";
import { putSeverityLevels, type SeverityLevelInput } from "@/lib/severity-levels-api";

/**
 * Server action for the org severity ladder. The whole ladder is saved at once
 * (manager-gated in the API); omitted keys are archived, not deleted, so past
 * incidents keep their severity.
 */
export async function putSeverityLevelsAction(slug: string, levels: SeverityLevelInput[]): Promise<{ error?: string }> {
  const res = await putSeverityLevels(slug, levels);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/settings/severities`);
  return {};
}
