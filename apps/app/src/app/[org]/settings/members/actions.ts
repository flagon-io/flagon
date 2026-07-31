"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members, organizations } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { canManageOrg } from "@/lib/org";

/**
 * Set an org member's role, including the read-only roles (viewer/billing) that
 * BetterAuth's org plugin doesn't know about. Roles live in the app-owned
 * `members` table, so we write it directly here rather than through
 * authClient.organization.updateMemberRole (which only speaks owner/admin/member).
 * The API enforces what each role can do; this just records it.
 *
 * Guards mirror the BetterAuth path: managers only, never the owner, never
 * yourself.
 */
const ASSIGNABLE = new Set(["admin", "member", "viewer", "billing"]);

export async function setMemberRoleAction(
  slug: string,
  memberId: string,
  role: string,
): Promise<{ error?: string }> {
  if (!ASSIGNABLE.has(role)) return { error: "Unknown role." };

  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const org = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1)
    .then((r) => r[0]);
  if (!org) return { error: "Organization not found." };

  const actor = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, org.id), eq(members.userId, session.user.id)))
    .limit(1)
    .then((r) => r[0]);
  if (!actor || !canManageOrg(actor.role)) {
    return { error: "Only owners and admins can change member roles." };
  }

  const target = await db
    .select({ role: members.role, userId: members.userId })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, org.id)))
    .limit(1)
    .then((r) => r[0]);
  if (!target) return { error: "Member not found." };
  if (target.role === "owner") {
    return { error: "The owner's role can't be changed here. Transfer ownership instead." };
  }
  if (target.userId === session.user.id) {
    return { error: "You can't change your own role." };
  }

  await db
    .update(members)
    .set({ role })
    .where(and(eq(members.id, memberId), eq(members.organizationId, org.id)));
  revalidatePath(`/${slug}/settings/members`);
  return {};
}
