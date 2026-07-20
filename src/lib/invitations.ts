/** Invitations that are still actionable: pending and not yet expired. */
export function pendingInvitations<
  T extends { status: string; expiresAt: Date | string },
>(invitations: T[]): T[] {
  const now = Date.now();
  return invitations.filter(
    (invitation) =>
      invitation.status === "pending" &&
      new Date(invitation.expiresAt).getTime() > now,
  );
}
