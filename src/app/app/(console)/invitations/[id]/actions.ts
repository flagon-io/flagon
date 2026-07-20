"use server";

import { appPath } from "@/lib/urls";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { auth } from "@/lib/auth";

/**
 * Invitation responses. The organization plugin enforces that the signed-in
 * user's primary email matches the invited address.
 */
export type InvitationActionResult = { ok: boolean; message: string };

export async function acceptInvitationAction(
  invitationId: string,
): Promise<InvitationActionResult> {
  let organizationId: string | undefined;
  try {
    const result = await auth.api.acceptInvitation({
      body: { invitationId },
      headers: await headers(),
    });
    organizationId = result?.invitation.organizationId;
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not accept the invitation.",
      };
    }
    throw error;
  }

  // Land inside the new organization.
  if (organizationId) {
    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (org) redirect(appPath(`/${org.slug}`));
  }
  redirect(appPath(""));
}

export async function declineInvitationAction(
  invitationId: string,
): Promise<InvitationActionResult> {
  try {
    await auth.api.rejectInvitation({
      body: { invitationId },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not decline the invitation.",
      };
    }
    throw error;
  }
  redirect(appPath(""));
}
