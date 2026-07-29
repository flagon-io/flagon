"use server";

import { renameOrg } from "@/lib/flags-api";

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
