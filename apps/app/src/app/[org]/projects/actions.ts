"use server";

import { revalidatePath } from "next/cache";
import {
  addProjectAccess,
  createProject,
  deleteProject,
  removeProjectAccess,
  updateProject,
  updateProjectAccess,
  type ProjectCatalog,
} from "@/lib/projects-api";
import { completeUpload, requestUpload, type UploadTicket } from "@/lib/uploads-api";

/**
 * Server actions for projects. Thin wrappers over the API client (which forwards
 * the session cookie, so the API authorizes org + role), then revalidate the
 * affected paths. Authorization lives in the API.
 */
export async function createProjectAction(
  slug: string,
  body: {
    name: string;
    key: string;
    description?: string;
    framework?: string;
    ownerTeamKey?: string;
    lifecycle?: string;
    tier?: string;
    tags?: string[];
  },
): Promise<{ key?: string; error?: string }> {
  const res = await createProject(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}`);
  return { key: res.data?.project.key };
}

export async function updateProjectAction(
  slug: string,
  key: string,
  body: ProjectCatalog,
): Promise<{ error?: string }> {
  const res = await updateProject(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/projects/${key}`);
  revalidatePath(`/${slug}/projects/${key}/settings`);
  revalidatePath(`/${slug}`);
  return {};
}

export async function deleteProjectAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteProject(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}`);
  return {};
}

// --- Project icon upload ----------------------------------------------------
/** Step 1: presign a project-icon upload. The client PUTs the bytes directly. */
export async function startProjectIconUploadAction(
  slug: string,
  body: { contentType: string; size: number },
): Promise<{ ticket?: UploadTicket; error?: string }> {
  const { data, error } = await requestUpload(slug, { purpose: "project-icon", ...body });
  if (error) return { error };
  return { ticket: data };
}

/** Step 2: confirm the upload, then point the project's icon at it. */
export async function finishProjectIconUploadAction(
  slug: string,
  projectKey: string,
  assetId: string,
): Promise<{ url?: string; error?: string }> {
  const done = await completeUpload(slug, assetId);
  if (done.error) return { error: done.error };
  const url = done.data?.asset.url;
  if (!url) return { error: "The upload has no public URL." };

  const set = await updateProject(slug, projectKey, { image: url });
  if (set.error) return { error: set.error };

  revalidatePath(`/${slug}/projects/${projectKey}`);
  revalidatePath(`/${slug}/projects/${projectKey}/settings`);
  revalidatePath(`/${slug}`);
  return { url };
}

/** Clear the project's icon (falls back to the stack monogram). Owner/admin. */
export async function removeProjectIconAction(
  slug: string,
  projectKey: string,
): Promise<{ error?: string }> {
  const res = await updateProject(slug, projectKey, { image: null });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/projects/${projectKey}`);
  revalidatePath(`/${slug}/projects/${projectKey}/settings`);
  revalidatePath(`/${slug}`);
  return {};
}

// --- Project access (GitHub-repository style) -------------------------------
export async function addProjectAccessAction(
  slug: string,
  key: string,
  teamKey: string,
  role: string,
): Promise<{ error?: string }> {
  const res = await addProjectAccess(slug, key, { teamKey, role });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/projects/${key}/settings`);
  return {};
}

export async function setProjectAccessRoleAction(
  slug: string,
  key: string,
  teamKey: string,
  role: string,
): Promise<{ error?: string }> {
  const res = await updateProjectAccess(slug, key, teamKey, role);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/projects/${key}/settings`);
  return {};
}

export async function removeProjectAccessAction(
  slug: string,
  key: string,
  teamKey: string,
): Promise<{ error?: string }> {
  const res = await removeProjectAccess(slug, key, teamKey);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/projects/${key}/settings`);
  return {};
}
