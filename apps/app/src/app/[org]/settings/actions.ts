"use server";

import { revalidatePath } from "next/cache";
import { renameOrg, setProjectCreationPolicy, updateOrgLogo } from "@/lib/flags-api";
import {
  completeUpload,
  requestUpload,
  type UploadTicket,
} from "@/lib/uploads-api";

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
 * Step 1 of a logo change: ask the API for a presigned upload ticket. The client
 * then PUTs the bytes straight to the store and calls finishLogoUploadAction.
 * Returns the ticket (or an error, e.g. 503 when uploads aren't configured).
 */
export async function startLogoUploadAction(
  slug: string,
  body: { contentType: string; size: number },
): Promise<{ ticket?: UploadTicket; error?: string }> {
  const { data, error } = await requestUpload(slug, { purpose: "org-logo", ...body });
  if (error) return { error };
  return { ticket: data };
}

/**
 * Step 2: confirm the upload landed, then point the org's logo at it. The API
 * verifies the object exists (HEAD) before we set the logo, so a failed upload
 * never leaves a broken URL on the org.
 */
export async function finishLogoUploadAction(
  slug: string,
  assetId: string,
): Promise<{ url?: string; error?: string }> {
  const done = await completeUpload(slug, assetId);
  if (done.error) return { error: done.error };
  const url = done.data?.asset.url;
  if (!url) return { error: "The upload has no public URL." };

  const set = await updateOrgLogo(slug, url);
  if (set.error) return { error: set.error };

  revalidatePath(`/${slug}/settings`);
  revalidatePath(`/${slug}`);
  return { url };
}

/** Clear the org's logo (falls back to the default mark). Owner/admin. */
export async function removeOrgLogoAction(slug: string): Promise<{ error?: string }> {
  const { error } = await updateOrgLogo(slug, null);
  if (error) return { error };
  revalidatePath(`/${slug}/settings`);
  revalidatePath(`/${slug}`);
  return {};
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
