import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { members } from "../db/schema";

/**
 * Ownership transfer: the single owner seat moves to another member, and
 * the previous owner steps down to admin. Both writes happen in ONE
 * transaction so the organization is never left with two owners or none.
 *
 * Authorization is the caller's job (only the current owner may do this);
 * this enforces the invariant, not the permission.
 */
export type TransferOwnershipResult =
  | { ok: true }
  | { ok: false; code: "not_owner" | "not_a_member" | "already_owner"; error: string };

export async function transferOwnership(input: {
  orgId: string;
  fromUserId: string;
  toUserId: string;
}): Promise<TransferOwnershipResult> {
  if (input.fromUserId === input.toUserId) {
    return {
      ok: false,
      code: "already_owner",
      error: "They already own this organization.",
    };
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ userId: members.userId, role: members.role })
      .from(members)
      .where(eq(members.organizationId, input.orgId));

    const current = rows.find((row) => row.userId === input.fromUserId);
    if (!current || current.role !== "owner") {
      return {
        ok: false as const,
        code: "not_owner" as const,
        error: "Only the organization's owner can transfer ownership.",
      };
    }
    if (!rows.some((row) => row.userId === input.toUserId)) {
      return {
        ok: false as const,
        code: "not_a_member" as const,
        error: "That person is not a member of this organization.",
      };
    }

    await tx
      .update(members)
      .set({ role: "owner" })
      .where(
        and(
          eq(members.organizationId, input.orgId),
          eq(members.userId, input.toUserId),
        ),
      );
    await tx
      .update(members)
      .set({ role: "admin" })
      .where(
        and(
          eq(members.organizationId, input.orgId),
          eq(members.userId, input.fromUserId),
        ),
      );

    return { ok: true as const };
  });
}
