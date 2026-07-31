"use server";

import { revalidatePath } from "next/cache";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  updateTeam,
  updateTeamMemberRole,
} from "@/lib/teams-api";

/**
 * Server actions for teams. Thin wrappers over the API client (which forwards the
 * session cookie, so the API authorizes org + role + team maintainership), then
 * revalidate the affected paths. Authorization lives in the API.
 */
export async function createTeamAction(
  slug: string,
  body: { name: string; key: string; description?: string },
): Promise<{ key?: string; error?: string }> {
  const res = await createTeam(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/teams`);
  return { key: res.data?.team.key };
}

export async function updateTeamAction(
  slug: string,
  key: string,
  body: { name?: string; description?: string | null },
): Promise<{ error?: string }> {
  const res = await updateTeam(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/teams/${key}`);
  revalidatePath(`/${slug}/teams`);
  return {};
}

export async function deleteTeamAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteTeam(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/teams`);
  return {};
}

export async function addTeamMemberAction(
  slug: string,
  key: string,
  userId: string,
  role: "maintainer" | "member",
): Promise<{ error?: string }> {
  const res = await addTeamMember(slug, key, { userId, role });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/teams/${key}`);
  return {};
}

export async function setTeamMemberRoleAction(
  slug: string,
  key: string,
  userId: string,
  role: "maintainer" | "member",
): Promise<{ error?: string }> {
  const res = await updateTeamMemberRole(slug, key, userId, role);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/teams/${key}`);
  return {};
}

export async function removeTeamMemberAction(
  slug: string,
  key: string,
  userId: string,
): Promise<{ error?: string }> {
  const res = await removeTeamMember(slug, key, userId);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/teams/${key}`);
  return {};
}
