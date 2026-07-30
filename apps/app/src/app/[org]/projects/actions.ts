"use server";

import { revalidatePath } from "next/cache";
import {
  createProject,
  deleteProject,
  listGithubRepos,
  updateProject,
  type GithubRepo,
} from "@/lib/projects-api";

/** Load the repositories for a connected installation (New Project picker). */
export async function listReposAction(
  slug: string,
  installationId: string,
): Promise<{ repos?: GithubRepo[]; error?: string }> {
  const res = await listGithubRepos(slug, installationId);
  if (res.error) return { error: res.error };
  return { repos: res.data };
}

/**
 * Server actions for projects. Thin wrappers over the API client (which forwards
 * the session cookie, so the API authorizes org + role), then revalidate the
 * affected paths. Authorization lives in the API.
 */
export async function createProjectAction(
  slug: string,
  body: { name: string; key: string; githubInstallationId?: string; repoId?: string },
): Promise<{ key?: string; error?: string }> {
  const res = await createProject(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}`);
  return { key: res.data?.project.key };
}

export async function updateProjectAction(
  slug: string,
  key: string,
  body: { name?: string; rootDirectory?: string },
): Promise<{ error?: string }> {
  const res = await updateProject(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/projects/${key}`);
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
