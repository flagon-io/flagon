"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, members, organizations } from "@/db/schema";
import { deleteOrg, type DeleteOrgResult } from "@/lib/org-lifecycle";

/**
 * Settle + SOFT-delete an organization. The API (called first) owns the money logic
 * (cancel the subscription, invoice accrued usage, collect open invoices) and
 * refuses if anything is still owed; on success it sets `deleted_at`.
 *
 * We then finish the delete on the app-owned auth tables: SNAPSHOT the memberships
 * into `organizations.deleted_members` (so a future restore can recreate them and we
 * retain churn visibility) and REMOVE the member + pending-invitation rows. Removing
 * them is what makes a soft-deleted org also vanish from better-auth's OWN org
 * endpoints (/api/auth listOrganizations / getFullOrganization / inviteMember), which
 * don't know about `deleted_at` — otherwise a former member with a live session could
 * still enumerate or invite into their dead org via raw calls.
 */
export async function deleteOrgAction(slug: string): Promise<DeleteOrgResult> {
  const result = await deleteOrg(slug);
  if (!result.deleted) return result;

  // Best-effort finish: the org is already soft-deleted and hidden from the console
  // (lib/org.ts filters deleted_at), so a failure here only leaves the contained
  // better-auth enumeration until a retry — never blocks the delete.
  try {
    // The org is now deleted_at-set; query it directly (slug is unique).
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (org) {
      await db.transaction(async (tx) => {
        const roster = await tx
          .select({ userId: members.userId, role: members.role })
          .from(members)
          .where(eq(members.organizationId, org.id));
        await tx
          .update(organizations)
          .set({ deletedMembers: roster })
          .where(eq(organizations.id, org.id));
        await tx.delete(members).where(eq(members.organizationId, org.id));
        await tx.delete(invitations).where(eq(invitations.organizationId, org.id));
      });
    }
  } catch {
    // non-fatal
  }
  return result;
}
