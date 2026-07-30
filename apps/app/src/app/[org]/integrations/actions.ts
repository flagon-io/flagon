"use server";

import { revalidatePath } from "next/cache";
import { disconnectInstallation, githubInstallUrl } from "@/lib/projects-api";

/** Return the signed GitHub App install URL to redirect the browser to. */
export async function githubInstallUrlAction(
  slug: string,
): Promise<{ url?: string; error?: string }> {
  const res = await githubInstallUrl(slug);
  if (res.error) return { error: res.error };
  return { url: res.data?.url };
}

export async function disconnectGithubAction(
  slug: string,
  id: string,
): Promise<{ error?: string }> {
  const res = await disconnectInstallation(slug, id);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/integrations`);
  return {};
}
