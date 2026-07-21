"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { isAssignableOrgRole } from "@/lib/org-roles";
import { transferOwnership } from "@/lib/org-owner.server";
import { resolveOrg } from "../resolve-org";

/**
 * Membership management server actions. All permission enforcement happens
 * in the organization plugin (owners/admins invite and remove; only owners
 * touch owners) - these actions resolve identifiers and surface errors.
 */
export type MemberActionResult = { ok: boolean; message: string };

/** "username or email" resolution: emails pass through, usernames map to
 * the account's primary email (invitations are email-keyed). */
export async function resolveInviteEmail(
  identifier: string,
): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const value = identifier.trim();
  if (!value)
    return { ok: false, message: "Enter a username or email address." };
  if (value.includes("@")) return { ok: true, email: value.toLowerCase() };

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.username, value.toLowerCase()))
    .limit(1);
  if (!user) {
    return {
      ok: false,
      message: `No account with the username "${value}". Enter their email address to invite them.`,
    };
  }
  return { ok: true, email: user.email };
}

export async function inviteMemberAction(
  orgSlug: string,
  input: { identifier: string; role: string },
): Promise<MemberActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };

  // Ownership is transferred, never invited: an organization has exactly
  // one owner (src/lib/org-roles.ts).
  if (!isAssignableOrgRole(input.role)) {
    return { ok: false, message: "Invite people as an admin or a member." };
  }
  const resolved = await resolveInviteEmail(input.identifier);
  if (!resolved.ok) return resolved;

  try {
    await auth.api.createInvitation({
      body: {
        email: resolved.email,
        role: input.role as "member" | "admin",
        organizationId: org.id,
        resend: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not send the invitation.",
      };
    }
    throw error;
  }

  revalidatePath(`/app/${orgSlug}/members`);
  return { ok: true, message: "" };
}

export async function cancelInvitationAction(
  orgSlug: string,
  invitationId: string,
): Promise<MemberActionResult> {
  try {
    await auth.api.cancelInvitation({
      body: { invitationId },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not cancel the invitation.",
      };
    }
    throw error;
  }
  revalidatePath(`/app/${orgSlug}/members`);
  return { ok: true, message: "" };
}

export async function updateMemberRoleAction(
  orgSlug: string,
  memberId: string,
  role: string,
): Promise<MemberActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };
  if (!isAssignableOrgRole(role)) {
    return {
      ok: false,
      message:
        "Choose admin or member. Use Transfer ownership to hand over the organization.",
    };
  }

  try {
    await auth.api.updateMemberRole({
      body: {
        memberId,
        role: role as "member" | "admin",
        organizationId: org.id,
      },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not change the role.",
      };
    }
    throw error;
  }
  revalidatePath(`/app/${orgSlug}/members`);
  return { ok: true, message: "" };
}

export async function removeMemberAction(
  orgSlug: string,
  memberId: string,
): Promise<MemberActionResult> {
  const org = await resolveOrg(orgSlug);
  if (!org) return { ok: false, message: "Organization not found." };

  try {
    await auth.api.removeMember({
      body: { memberIdOrEmail: memberId, organizationId: org.id },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not remove the member.",
      };
    }
    throw error;
  }
  revalidatePath(`/app/${orgSlug}/members`);
  return { ok: true, message: "" };
}

export async function transferOwnershipAction(
  orgSlug: string,
  targetUserId: string,
): Promise<MemberActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  const org = await resolveOrg(orgSlug);
  if (!session || !org)
    return { ok: false, message: "Organization not found." };

  const result = await transferOwnership({
    orgId: org.id,
    fromUserId: session.user.id,
    toUserId: targetUserId,
  });
  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath(`/app/${orgSlug}/members`);
  return { ok: true, message: "" };
}
