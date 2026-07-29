import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, members, organizations, users } from "@/db/schema";

/**
 * Server-side organization lookups for routing and workspace guards. These read
 * membership directly (the app's drizzle client) rather than going through the
 * BetterAuth API, so they compose cleanly inside server-component render where
 * we cannot set cookies.
 */

export type OrgMembership = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  logo: string | null;
  // Billing state, so the workspace can lock a lapsed Pro org. See
  // `isOrgLocked` in @/lib/billing.
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
};

/** Every organization the user belongs to, oldest first. */
export async function getUserOrganizations(
  userId: string,
): Promise<OrgMembership[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      role: members.role,
      logo: organizations.logo,
      stripeCustomerId: organizations.stripeCustomerId,
      subscriptionStatus: organizations.subscriptionStatus,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, userId))
    .orderBy(organizations.createdAt);
}

/** The user's membership of a single org by slug, or null if not a member. */
export async function getMembershipBySlug(
  userId: string,
  slug: string,
): Promise<OrgMembership | null> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      role: members.role,
      logo: organizations.logo,
      stripeCustomerId: organizations.stripeCustomerId,
      subscriptionStatus: organizations.subscriptionStatus,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(and(eq(members.userId, userId), eq(organizations.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

const MANAGER_ROLES = new Set(["owner", "admin"]);
export function canManageOrg(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

/**
 * Whether the user already owns a Hobby organization. An account may own only
 * one (Hobby is the single-user tier), so the create-org flow uses this to
 * disable the Hobby plan once they have one. Creating is otherwise always
 * offered; the plan picker is where the limit is surfaced.
 */
export async function userHasHobbyOrg(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: organizations.id })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(and(eq(members.userId, userId), eq(organizations.plan, "hobby")))
    .limit(1);
  return rows.length > 0;
}

/** Members of an org with their user details, oldest first. */
export async function getOrgMembers(organizationId: string) {
  return db
    .select({
      memberId: members.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      role: members.role,
      joinedAt: members.createdAt,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, organizationId))
    .orderBy(members.createdAt);
}

/** Pending invitations for an org. */
export async function getOrgInvitations(organizationId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.status, "pending"),
      ),
    )
    .orderBy(invitations.createdAt);
}

/** A single invitation with its organization, for the accept page. */
export async function getInvitationById(id: string) {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(invitations)
    .innerJoin(
      organizations,
      eq(invitations.organizationId, organizations.id),
    )
    .where(eq(invitations.id, id))
    .limit(1);
  return rows[0] ?? null;
}
