"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isProjectRole, roleAtLeast } from "@/lib/project-access";
import {
  removeProjectGrant,
  resolveProjectRole,
  upsertProjectGrant,
} from "@/lib/project-access.server";
import { replaceProjectOwners } from "@/lib/project-ownership.server";
import {
  changeProjectSlug,
  deleteProject,
  getProject,
  renameProject,
  updateProjectDetails,
  updateProjectOverview,
} from "@/lib/projects.server";
import { resolveOrg } from "../../resolve-org";

/**
 * Access management server actions. Every mutation re-resolves the caller's
 * effective role server-side: only project admins manage access. Same lib
 * helpers as the /v1 access routes.
 */
export type AccessActionResult = { ok: boolean; message: string };

async function requireAdminContext(orgSlug: string, projectSlug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const org = await resolveOrg(orgSlug);
  if (!org) return null;
  const project = await getProject(org.id, projectSlug);
  if (!project) return null;
  const role = await resolveProjectRole({
    orgId: org.id,
    projectId: project.id,
    userId: session.user.id,
    members: org.members,
  });
  if (!role || !roleAtLeast(role, "admin")) return null;
  return { org, project };
}

async function requireProjectRole(
  orgSlug: string,
  projectSlug: string,
  minimum: "write" | "admin",
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const org = await resolveOrg(orgSlug);
  if (!session || !org) return null;
  const project = await getProject(org.id, projectSlug);
  if (!project) return null;
  const role = await resolveProjectRole({
    orgId: org.id,
    projectId: project.id,
    userId: session.user.id,
    members: org.members,
  });
  return role && roleAtLeast(role, minimum) ? { org, project } : null;
}

export async function saveProjectOverviewAction(
  orgSlug: string,
  projectSlug: string,
  overviewMarkdown: string,
): Promise<AccessActionResult> {
  const ctx = await requireProjectRole(orgSlug, projectSlug, "write");
  if (!ctx) return { ok: false, message: "You can't edit this overview." };
  const result = await updateProjectOverview(
    ctx.org.id,
    ctx.project.id,
    overviewMarkdown,
  );
  if (!result.ok) return { ok: false, message: result.error };
  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  return { ok: true, message: "" };
}

export async function replaceProjectOwnersAction(
  orgSlug: string,
  projectSlug: string,
  selection: Array<{ kind: "team" | "user"; id: string }>,
): Promise<AccessActionResult> {
  const ctx = await requireProjectRole(orgSlug, projectSlug, "admin");
  if (!ctx) return { ok: false, message: "You can't assign ownership here." };
  const result = await replaceProjectOwners(ctx.org.id, ctx.project.id, {
    teamIds: selection
      .filter((item) => item.kind === "team")
      .map((item) => item.id),
    userIds: selection
      .filter((item) => item.kind === "user")
      .map((item) => item.id),
  });
  if (!result.ok) return { ok: false, message: result.error };
  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  return { ok: true, message: "" };
}

export async function addGrantAction(
  orgSlug: string,
  projectSlug: string,
  input: { subjectType: string; subjectId: string; role: string },
): Promise<AccessActionResult> {
  const ctx = await requireAdminContext(orgSlug, projectSlug);
  if (!ctx) return { ok: false, message: "You can't manage access here." };

  if (input.subjectType !== "user" && input.subjectType !== "team") {
    return { ok: false, message: "Choose a member or a team." };
  }
  if (!isProjectRole(input.role)) {
    return { ok: false, message: "Choose a role." };
  }

  // The subject must belong to this organization.
  if (input.subjectType === "user") {
    const isMember = ctx.org.members.some((m) => m.userId === input.subjectId);
    if (!isMember) {
      return {
        ok: false,
        message: "That user isn't a member of this organization.",
      };
    }
  } else {
    const teams = await auth.api.listOrganizationTeams({
      query: { organizationId: ctx.org.id },
      headers: await headers(),
    });
    if (!teams.some((team) => team.id === input.subjectId)) {
      return {
        ok: false,
        message: "That team doesn't exist in this organization.",
      };
    }
  }

  const result = await upsertProjectGrant({
    orgId: ctx.org.id,
    projectId: ctx.project.id,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    role: input.role,
  });
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  return { ok: true, message: "" };
}

export async function removeGrantAction(
  orgSlug: string,
  projectSlug: string,
  grantId: string,
): Promise<AccessActionResult> {
  const ctx = await requireAdminContext(orgSlug, projectSlug);
  if (!ctx) return { ok: false, message: "You can't manage access here." };

  const removed = await removeProjectGrant(ctx.org.id, ctx.project.id, grantId);
  if (!removed) return { ok: false, message: "That grant no longer exists." };

  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  return { ok: true, message: "" };
}

export async function renameProjectAction(
  orgSlug: string,
  projectSlug: string,
  name: string,
): Promise<AccessActionResult> {
  const ctx = await requireAdminContext(orgSlug, projectSlug);
  if (!ctx) return { ok: false, message: "You can't manage this project." };

  const result = await renameProject(ctx.org.id, ctx.project.id, name);
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  revalidatePath(`/app/${orgSlug}`);
  return { ok: true, message: "" };
}

/**
 * Description, website, and topics. Write access, like the overview: these
 * describe the project rather than govern it, and someone trusted to rewrite
 * the README is trusted to fix a stale one-liner.
 */
export async function saveProjectDetailsAction(
  orgSlug: string,
  projectSlug: string,
  input: { description: string; website: string; topics: string[] },
): Promise<AccessActionResult> {
  const ctx = await requireProjectRole(orgSlug, projectSlug, "write");
  if (!ctx) return { ok: false, message: "You can't edit this project." };

  const result = await updateProjectDetails(ctx.org.id, ctx.project.id, input);
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  revalidatePath(`/app/${orgSlug}`);
  return { ok: true, message: "" };
}

export type SlugChangeResult =
  { ok: true; slug: string } | { ok: false; message: string };

/**
 * Changes the slug and reports the new one so the caller can navigate.
 *
 * The page the caller is standing on ceases to exist at the moment this
 * succeeds - there is no redirect from the old slug - so returning the new
 * value is not a convenience, it is the only way back to the project.
 */
export async function changeProjectSlugAction(
  orgSlug: string,
  projectSlug: string,
  slug: string,
): Promise<SlugChangeResult> {
  const ctx = await requireAdminContext(orgSlug, projectSlug);
  if (!ctx) return { ok: false, message: "You can't manage this project." };

  const result = await changeProjectSlug(ctx.org.id, ctx.project.id, slug);
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath(`/app/${orgSlug}`);
  revalidatePath(`/app/${orgSlug}/projects/${projectSlug}`);
  revalidatePath(`/app/${orgSlug}/projects/${result.project.slug}`);
  return { ok: true, slug: result.project.slug };
}

export async function deleteProjectAction(
  orgSlug: string,
  projectSlug: string,
): Promise<AccessActionResult> {
  const ctx = await requireAdminContext(orgSlug, projectSlug);
  if (!ctx) return { ok: false, message: "You can't manage this project." };

  const removed = await deleteProject(ctx.org.id, ctx.project.id);
  if (!removed) return { ok: false, message: "That project no longer exists." };

  revalidatePath(`/app/${orgSlug}`);
  return { ok: true, message: "" };
}
