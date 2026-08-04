"use server";

import { revalidatePath } from "next/cache";
import { putRccaTemplate, type RccaTemplateData } from "@/lib/rcca-template-api";

/**
 * Server action for the org RCCA template (which severities require a postmortem
 * and what fields it collects). Manager-gated in the API.
 */
export async function putRccaTemplateAction(slug: string, body: RccaTemplateData): Promise<{ error?: string }> {
  const res = await putRccaTemplate(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/incidents/rcca-template`);
  return {};
}
