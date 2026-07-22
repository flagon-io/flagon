import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, orgProposals } from "@/db/schema";

/**
 * Reading and responding to an enterprise proposal by its signed-link token.
 *
 * A proposal is reached by possession of an unguessable token, BEFORE any org
 * session exists - so this never runs inside withTenant. The table is global
 * (no RLS); only the token's SHA-256 digest is stored, and the raw token from
 * the link is hashed here and matched against it. Nothing in flagon CREATES a
 * proposal - that is the operator console's job; flagon only surfaces the offer
 * to the recipient and records their decision.
 */

export function hashProposalToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ProposalStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "withdrawn"
  | "provisioned";

export type ProposalView = {
  id: string;
  orgName: string;
  /** Effective status: a 'sent' proposal past its expiry reads as 'expired'. */
  status: ProposalStatus;
  termStart: string;
  termEnd: string;
  meterAllowances: Record<string, number>;
  meteredAllowances: Record<string, number>;
  meteredRates: Record<string, { unit_amount_cents: number; per: number }>;
  baseFeeCents: number;
  interval: string;
  message: string | null;
  expiresAt: Date | null;
  respondedAt: Date | null;
};

function effectiveStatus(row: {
  status: string;
  expiresAt: Date | null;
}): ProposalStatus {
  if (
    row.status === "sent" &&
    row.expiresAt &&
    row.expiresAt.getTime() < Date.now()
  ) {
    return "expired";
  }
  return row.status as ProposalStatus;
}

/** The proposal for a raw link token, or null when the link matches nothing. */
export async function getProposalByToken(
  rawToken: string,
): Promise<ProposalView | null> {
  if (!rawToken) return null;
  // org_proposals is global (no RLS); organizations is auth-layer (RLS disabled
  // in drizzle/0008, access-checked in app code), so both are readable on this
  // unauthenticated page without a tenant context - the token is the authority.
  const [row] = await db
    .select({
      id: orgProposals.id,
      orgName: organizations.name,
      status: orgProposals.status,
      termStart: orgProposals.termStart,
      termEnd: orgProposals.termEnd,
      meterAllowances: orgProposals.meterAllowances,
      meteredAllowances: orgProposals.meteredAllowances,
      meteredRates: orgProposals.meteredRates,
      baseFeeCents: orgProposals.baseFeeCents,
      interval: orgProposals.interval,
      message: orgProposals.message,
      expiresAt: orgProposals.expiresAt,
      respondedAt: orgProposals.respondedAt,
    })
    .from(orgProposals)
    .innerJoin(
      organizations,
      eq(orgProposals.organizationId, organizations.id),
    )
    .where(eq(orgProposals.tokenHash, hashProposalToken(rawToken)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    orgName: row.orgName,
    status: effectiveStatus(row),
    termStart: String(row.termStart),
    termEnd: String(row.termEnd),
    meterAllowances: (row.meterAllowances ?? {}) as Record<string, number>,
    meteredAllowances: (row.meteredAllowances ?? {}) as Record<string, number>,
    meteredRates: (row.meteredRates ?? {}) as Record<
      string,
      { unit_amount_cents: number; per: number }
    >,
    baseFeeCents: row.baseFeeCents,
    interval: row.interval,
    message: row.message,
    expiresAt: row.expiresAt,
    respondedAt: row.respondedAt,
  };
}

export type RespondResult =
  | { ok: true; status: "accepted" | "declined" }
  | { ok: false; reason: string };

/**
 * Record the recipient's decision. Only a 'sent', unexpired proposal can be
 * responded to; anything else (already answered, withdrawn, expired, still a
 * draft) is refused with an explanation. This NEVER provisions - acceptance is
 * consent; the operator provisions from it.
 */
export async function respondToProposal(
  rawToken: string,
  decision: "accept" | "decline",
  declineReason?: string,
): Promise<RespondResult> {
  const [row] = await db
    .select({
      id: orgProposals.id,
      status: orgProposals.status,
      expiresAt: orgProposals.expiresAt,
    })
    .from(orgProposals)
    .where(eq(orgProposals.tokenHash, hashProposalToken(rawToken)))
    .limit(1);

  if (!row) return { ok: false, reason: "This proposal link is not valid." };

  const status = effectiveStatus(row);
  if (status === "expired") {
    return { ok: false, reason: "This proposal has expired." };
  }
  if (status !== "sent") {
    return {
      ok: false,
      reason: `This proposal has already been ${status}.`,
    };
  }

  const next = decision === "accept" ? "accepted" : "declined";
  await db
    .update(orgProposals)
    .set({
      status: next,
      respondedAt: new Date(),
      declineReason:
        decision === "decline" ? declineReason?.trim() || null : null,
      updatedAt: new Date(),
    })
    .where(eq(orgProposals.id, row.id));

  return { ok: true, status: next };
}
