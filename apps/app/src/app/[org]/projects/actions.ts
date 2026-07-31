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

/**
 * Server actions for projects. Thin wrappers over the API client (which forwards
 * the session cookie, so the API authorizes org + role), then revalidate the
 * affected paths. Authorization lives in the API.
 */
export async function createProjectAction(
  slug: string,
  body: { name: string; key: string },
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
