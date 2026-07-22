"use server";

import { respondToProposal, type RespondResult } from "@/lib/proposals.server";

/**
 * Record a recipient's decision on a proposal. Public and unauthenticated by
 * design: the link token IS the authorization (validated in respondToProposal),
 * the same posture as an emailed verification or unsubscribe link. It only ever
 * records consent; it never provisions.
 */
export async function respondAction(input: {
  token: string;
  decision: "accept" | "decline";
  reason?: string;
}): Promise<RespondResult> {
  return respondToProposal(input.token, input.decision, input.reason);
}
