"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, members, organizations } from "@/db/schema";
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
    .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
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
  revalidatePath(`/${slug}/members`);
  return {};
}

/**
 * Clear failed invitations (the "Not accepted" history): declined, canceled, or
 * lapsed-and-still-pending. This DELETES the rows, which BetterAuth's own
 * cancel-invitation can't do (it only flips status to "canceled"), so it's how a
 * manager tidies the list. Active, un-expired pending invites and accepted ones
 * are never touched. Pass specific `ids` to clear a subset, or omit them to clear
 * everything clearable in the org (the "Clear all" action).
 *
 * Managers only, org-scoped.
 */
export async function clearInvitationsAction(
  slug: string,
  ids?: string[],
): Promise<{ error?: string; cleared?: number }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const org = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
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
    return { error: "Only owners and admins can clear invitations." };
  }

  if (ids && ids.length === 0) return { cleared: 0 };

  // "Clearable" = anything that isn't an accepted invite or a still-live pending
  // one: declined, canceled, or pending-but-expired. Never deletes an active
  // invitation someone could still accept.
  const clearable = and(
    ne(invitations.status, "accepted"),
    or(ne(invitations.status, "pending"), lt(invitations.expiresAt, new Date())),
  );

  const deleted = await db
    .delete(invitations)
    .where(
      ids
        ? and(eq(invitations.organizationId, org.id), inArray(invitations.id, ids), clearable)
        : and(eq(invitations.organizationId, org.id), clearable),
    )
    .returning({ id: invitations.id });

  revalidatePath(`/${slug}/members`);
  return { cleared: deleted.length };
}

/**
 * Transfer organization ownership to another member. There is exactly one owner
 * per org: the current owner hands it over (dropping to admin) and the target is
 * promoted to owner, in one transaction. BetterAuth's update-member-role can set
 * the owner role but does NOT demote the previous owner, so we write the
 * app-owned `members` table directly here (the same table role changes already
 * go through) to keep the single-owner invariant.
 *
 * Owner-only, and only onto an existing non-owner member (never yourself).
 */
export async function transferOwnershipAction(
  slug: string,
  memberId: string,
): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const org = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!org) return { error: "Organization not found." };

  const actor = await db
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, org.id), eq(members.userId, session.user.id)))
    .limit(1)
    .then((r) => r[0]);
  if (!actor || actor.role !== "owner") {
    return { error: "Only the current owner can transfer ownership." };
  }

  const target = await db
    .select({ id: members.id, role: members.role, userId: members.userId })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organizationId, org.id)))
    .limit(1)
    .then((r) => r[0]);
  if (!target) return { error: "Member not found." };
  if (target.userId === session.user.id) {
    return { error: "You already own this organization." };
  }
  if (target.role === "owner") {
    return { error: "That member already owns this organization." };
  }

  await db.transaction(async (tx) => {
    await tx.update(members).set({ role: "owner" }).where(eq(members.id, target.id));
    await tx.update(members).set({ role: "admin" }).where(eq(members.id, actor.id));
  });
  revalidatePath(`/${slug}/members`);
  revalidatePath(`/${slug}/settings`);
  return {};
}
