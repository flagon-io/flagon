"use server";

import { revalidatePath } from "next/cache";
import { createProject } from "@/lib/projects.server";
import { resolveOrg } from "../resolve-org";

/**
 * Console-side project creation. Same lib helper as POST
 * /api/v1/orgs/{slug}/projects - one implementation, no drift.
 */
export type ProjectActionResult = { ok: boolean; message: string };

export async function createProjectAction(
  orgSlug: string,
  input: { name: string; slug: string },
): Promise<ProjectActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };

  const result = await createProject(org.id, input);
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath(`/app/${orgSlug}`);
  return { ok: true, message: "" };
}
