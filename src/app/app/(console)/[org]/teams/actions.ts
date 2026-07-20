"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { APIError } from "better-auth/api";
import { isUniqueViolation } from "@/db/errors";
import { auth } from "@/lib/auth";
import { validateTeamName } from "@/lib/teams";
import { resolveOrg } from "../resolve-org";

/**
 * Team management server actions. Everything goes through auth.api so the
 * organization plugin's permission checks apply (owners and admins manage
 * teams) - the same enforcement the /v1 team routes get.
 */
export type TeamActionResult = {
  ok: boolean;
  message: string;
  teamId?: string;
};

function fromError(error: unknown, fallback: string): TeamActionResult {
  if (isUniqueViolation(error)) {
    return {
      ok: false,
      message: "A team with that name already exists in this organization.",
    };
  }
  if (error instanceof APIError) {
    return { ok: false, message: error.body?.message ?? fallback };
  }
  throw error;
}

export async function createTeamAction(
  orgSlug: string,
  rawName: string,
): Promise<TeamActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };

  const validation = validateTeamName(rawName);
  if (!validation.ok) return { ok: false, message: validation.error };

  try {
    const team = await auth.api.createTeam({
      body: { name: validation.name, organizationId: org.id },
      headers: await headers(),
    });
    revalidatePath(`/app/${orgSlug}/teams`);
    return { ok: true, message: "", teamId: team.id };
  } catch (error) {
    return fromError(error, "Could not create the team.");
  }
}

export async function addTeamMemberAction(
  orgSlug: string,
  teamId: string,
  userId: string,
): Promise<TeamActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };
  if (!org.members.some((m) => m.userId === userId)) {
    return { ok: false, message: "That user isn't a member of this organization." };
  }

  try {
    await auth.api.addTeamMember({
      body: { teamId, userId, organizationId: org.id },
      headers: await headers(),
    });
  } catch (error) {
    return fromError(error, "Could not add them to the team.");
  }
  revalidatePath(`/app/${orgSlug}/teams/${teamId}`);
  return { ok: true, message: "" };
}

export async function removeTeamMemberAction(
  orgSlug: string,
  teamId: string,
  userId: string,
): Promise<TeamActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };

  try {
    await auth.api.removeTeamMember({
      body: { teamId, userId, organizationId: org.id },
      headers: await headers(),
    });
  } catch (error) {
    return fromError(error, "Could not remove them from the team.");
  }
  revalidatePath(`/app/${orgSlug}/teams/${teamId}`);
  return { ok: true, message: "" };
}

export async function deleteTeamAction(
  orgSlug: string,
  teamId: string,
): Promise<TeamActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };

  try {
    await auth.api.removeTeam({
      body: { teamId, organizationId: org.id },
      headers: await headers(),
    });
  } catch (error) {
    return fromError(error, "Could not delete the team.");
  }
  revalidatePath(`/app/${orgSlug}/teams`);
  return { ok: true, message: "" };
}
