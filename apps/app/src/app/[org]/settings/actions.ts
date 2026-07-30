"use server";

import { revalidatePath } from "next/cache";
import { renameOrg, setProjectCreationPolicy } from "@/lib/flags-api";

type Result = { error?: string; ok?: string; newSlug?: string };

/**
 * Update an organization's name and URL slug. Thin wrapper over the API, which
 * owns the logic: it authorizes (owner/admin, cookie-forwarded), validates the
 * slug (shape + reserved + uniqueness), and writes. The plan is not settable
 * here — it changes only through billing.
 */
export async function updateOrgAction(formData: FormData): Promise<Result> {
  const currentSlug = String(formData.get("currentSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();

  const { data, error } = await renameOrg(currentSlug, { name, slug });
  if (error) return { error };

  const newSlug = data?.org.slug;
  return {
    ok: "Organization updated.",
    newSlug: newSlug && newSlug !== currentSlug ? newSlug : undefined,
  };
}

/**
 * Set the org's project-creation policy (GitHub-style base permission). The API
 * authorizes owner/admin and writes; we revalidate so the setting re-renders.
 */
export async function updateProjectCreationPolicyAction(
  slug: string,
  policy: "managers" | "members",
): Promise<{ error?: string; ok?: string }> {
  const { error } = await setProjectCreationPolicy(slug, policy);
  if (error) return { error };
  revalidatePath(`/${slug}/settings`);
  return { ok: "Project creation updated." };
}
