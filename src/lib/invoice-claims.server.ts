import { sql } from "drizzle-orm";
import { withTenant } from "../db/tenant";

/**
 * The lease held while invoicing a period to Stripe.
 *
 * billing_periods.status already makes invoicing idempotent AFTER the items
 * land: a redelivered webhook finds 'invoiced' and stops. The gap this closes
 * is the window BEFORE that flip.
 *
 * Stripe retries webhooks, and can deliver the same invoice.created twice
 * CONCURRENTLY. Both deliveries read the same 'closed' period, both call
 * addUsageToInvoice, and the customer's invoice carries the usage twice.
 * Stripe will not reject that - invoice items are additive by design, and
 * nothing about the second call looks wrong to it.
 *
 * So the external call is claimed first, in Postgres, where a unique index can
 * settle the race. The claim is an expiring LEASE rather than a plain flag
 * because the failure we most need to survive is a worker dying mid-call: a
 * permanent flag would wedge that invoice forever, unbilled and unretryable.
 * Once the items are attached the claim goes 'completed', which is terminal -
 * expiry cannot revive it.
 */

/** How long a claimant may hold the lease before it is up for grabs again. */
const DEFAULT_LEASE_SECONDS = 300;

export type InvoiceClaim = {
  id: string;
  attempts: number;
  expiresAt: Date;
};

/**
 * Tries to take the lease for one invoice.
 *
 * Returns the claim when this caller won it, or null when someone else holds a
 * live lease or the invoice is already completed. Null means STOP, not retry:
 * the work is either in flight elsewhere or permanently done.
 */
export async function claimInvoice(input: {
  orgId: string;
  stripeInvoiceId: string;
  billingPeriodId?: string | null;
  leaseSeconds?: number;
}): Promise<InvoiceClaim | null> {
  const lease = input.leaseSeconds ?? DEFAULT_LEASE_SECONDS;

  // One statement, so the decision and the claim cannot come apart.
  //
  // The ON CONFLICT branch takes a row lock, which is what serializes
  // concurrent deliveries: the loser blocks until the winner commits, then
  // re-evaluates the WHERE against the winner's committed row and matches
  // nothing. The WHERE is the whole policy:
  //   - status = 'completed'  -> never matches. Terminal.
  //   - live lease            -> never matches. Someone is working on it.
  //   - expired or failed     -> matches. Safe to retry.
  const rows = (await withTenant(input.orgId, (tx) =>
    tx.execute(sql`
      INSERT INTO billing_invoice_claims (
        organization_id, stripe_invoice_id, billing_period_id,
        status, claimed_at, expires_at, attempts
      )
      VALUES (
        ${input.orgId}::uuid, ${input.stripeInvoiceId},
        ${input.billingPeriodId ?? null}::uuid,
        'claimed', now(), now() + make_interval(secs => ${lease}), 1
      )
      ON CONFLICT (organization_id, stripe_invoice_id) DO UPDATE SET
        status = 'claimed',
        claimed_at = now(),
        expires_at = now() + make_interval(secs => ${lease}),
        attempts = billing_invoice_claims.attempts + 1,
        billing_period_id = COALESCE(
          EXCLUDED.billing_period_id, billing_invoice_claims.billing_period_id
        ),
        last_error = NULL,
        updated_at = now()
      WHERE billing_invoice_claims.status <> 'completed'
        AND billing_invoice_claims.expires_at < now()
      RETURNING id, attempts, expires_at
    `),
  )) as unknown as { id: string; attempts: number; expires_at: string }[];

  if (!rows.length) return null;
  return {
    id: rows[0].id,
    attempts: Number(rows[0].attempts),
    expiresAt: new Date(rows[0].expires_at),
  };
}

/**
 * Marks a claim terminal. Call this only once the invoice items have actually
 * landed in Stripe - it is what stops every future delivery.
 */
export async function completeInvoiceClaim(input: {
  orgId: string;
  claimId: string;
}): Promise<void> {
  await withTenant(input.orgId, (tx) =>
    tx.execute(sql`
      UPDATE billing_invoice_claims
      SET status = 'completed',
          completed_at = now(),
          -- Belt and braces: a completed claim is terminal by status, and
          -- expiring it in the past means even a status bug cannot make the
          -- retry branch look attractive.
          expires_at = now(),
          last_error = NULL,
          updated_at = now()
      WHERE organization_id = ${input.orgId}::uuid
        AND id = ${input.claimId}::uuid
    `),
  );
}

/**
 * Releases a claim after a failed attempt, so the next delivery can retry
 * immediately instead of waiting out the lease.
 *
 * Deliberately does NOT touch a claim that has already completed: an error
 * raised after the invoice items landed (say, the status flip failing) must
 * not reopen the door to billing them again.
 */
export async function releaseInvoiceClaim(input: {
  orgId: string;
  claimId: string;
  error?: string;
}): Promise<void> {
  await withTenant(input.orgId, (tx) =>
    tx.execute(sql`
      UPDATE billing_invoice_claims
      SET status = 'failed',
          expires_at = now(),
          last_error = ${input.error?.slice(0, 500) ?? null},
          updated_at = now()
      WHERE organization_id = ${input.orgId}::uuid
        AND id = ${input.claimId}::uuid
        AND status <> 'completed'
    `),
  );
}

/**
 * Runs `work` under the lease for one invoice.
 *
 * Returns "skipped" when the claim could not be taken, which is the normal
 * outcome for a redelivered webhook and not an error. A failure inside `work`
 * releases the claim and rethrows, so Stripe's own retry finds it claimable.
 */
export async function withInvoiceClaim<T>(
  input: {
    orgId: string;
    stripeInvoiceId: string;
    billingPeriodId?: string | null;
    leaseSeconds?: number;
  },
  work: (claim: InvoiceClaim) => Promise<T>,
): Promise<{ status: "done"; result: T } | { status: "skipped" }> {
  const claim = await claimInvoice(input);
  if (!claim) return { status: "skipped" };

  try {
    const result = await work(claim);
    await completeInvoiceClaim({ orgId: input.orgId, claimId: claim.id });
    return { status: "done", result };
  } catch (error) {
    await releaseInvoiceClaim({
      orgId: input.orgId,
      claimId: claim.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
