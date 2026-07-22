import { and, desc, eq } from "drizzle-orm";
import { orgContracts } from "../db/schema";
import { withTenant } from "../db/tenant";
import type { PeriodWindow } from "./billing-period";
import {
  contractStatus,
  meterBillingMode,
  meteredRate,
  termWindow,
  type ContractBilling,
  type ContractStatus,
  type ContractTerm,
} from "./contracts";
import { getMeter, rateCostCents, type UsageLine } from "./meters";
import { meterQuantities } from "./usage.server";

/**
 * Reading the negotiated agreement (drizzle/0030_org_contracts.sql).
 *
 * Nothing here writes. Contracts are set up out of band and the operator
 * console will own that; the product side only ever needs to read the envelope
 * and report consumption against it.
 */

export type OrgContract = {
  id: string;
  term: ContractTerm;
  /** Covered meters' term envelopes (volume; not billed). */
  meterAllowances: Record<string, number>;
  /** Metered meters' per-cycle included quantity. */
  meteredAllowances: Record<string, number>;
  /** Optional negotiated overage rate per metered meter. */
  meteredRates: Record<string, { unit_amount_cents: number; per: number }>;
  note: string | null;
};

/**
 * The agreement in force for an org, or null.
 *
 * Null is an ordinary, expected answer: a contracted org whose paperwork has
 * not been entered yet, or one between terms. Every caller degrades to showing
 * consumption without an envelope rather than treating it as an error.
 */
export async function activeContract(
  orgId: string,
): Promise<OrgContract | null> {
  const [row] = await withTenant(orgId, (tx) =>
    tx
      .select({
        id: orgContracts.id,
        termStart: orgContracts.termStart,
        termEnd: orgContracts.termEnd,
        meterAllowances: orgContracts.meterAllowances,
        meteredAllowances: orgContracts.meteredAllowances,
        meteredRates: orgContracts.meteredRates,
        note: orgContracts.note,
      })
      .from(orgContracts)
      .where(
        and(
          eq(orgContracts.organizationId, orgId),
          eq(orgContracts.status, "active"),
        ),
      )
      // The partial unique index allows only one, but ordering makes the read
      // deterministic if a backfill ever lands two before the index is applied.
      .orderBy(desc(orgContracts.termStart))
      .limit(1),
  );

  if (!row) return null;
  return {
    id: row.id,
    term: { start: String(row.termStart), end: String(row.termEnd) },
    // jsonb is whatever was written; coerce defensively so one malformed entry
    // cannot take down the usage page for the whole organization.
    meterAllowances: sanitizeAllowances(row.meterAllowances),
    meteredAllowances: sanitizeAllowances(row.meteredAllowances),
    meteredRates: sanitizeRates(row.meteredRates),
    note: row.note,
  };
}

function sanitizeAllowances(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, number> = {};
  for (const [meter, value] of Object.entries(raw as Record<string, unknown>)) {
    const quantity = Number(value);
    if (Number.isFinite(quantity) && quantity > 0) clean[meter] = quantity;
  }
  return clean;
}

/**
 * Coerce the metered_rates jsonb: an entry must be a positive rate or it is
 * dropped, so a malformed override falls back to the published rate rather than
 * pricing at zero or NaN.
 */
function sanitizeRates(
  raw: unknown,
): Record<string, { unit_amount_cents: number; per: number }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, { unit_amount_cents: number; per: number }> = {};
  for (const [meter, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const cents = Number((value as Record<string, unknown>).unit_amount_cents);
    const per = Number((value as Record<string, unknown>).per);
    if (
      Number.isFinite(cents) &&
      cents >= 0 &&
      Number.isFinite(per) &&
      per > 0
    ) {
      clean[meter] = { unit_amount_cents: cents, per };
    }
  }
  return clean;
}

/**
 * Consumption against the agreement, term-to-date.
 *
 * The window is the WHOLE TERM, not the current billing period: the envelope
 * is drawn down cumulatively so seasonal traffic nets out across the year
 * (see src/lib/contracts.ts). Returns null when there is no agreement to
 * measure against.
 */
export async function contractConsumption(input: {
  orgId: string;
  now?: Date;
}): Promise<{ contract: OrgContract; status: ContractStatus } | null> {
  const contract = await activeContract(input.orgId);
  if (!contract) return null;

  const used = await meterQuantities({
    orgId: input.orgId,
    window: termWindow(contract.term),
  });

  return {
    contract,
    status: contractStatus({
      term: contract.term,
      meterAllowances: contract.meterAllowances,
      used,
      now: input.now ?? new Date(),
    }),
  };
}

/**
 * The metered (auto-billed) usage for a contracted org over one billing period.
 *
 * This is the live counterpart to the frozen snapshot's metered lines: the cost
 * a contracted org owes OUTSIDE its base contract for the OPEN period. Covered
 * meters are excluded (they are volume, coordinated at renewal); the window is
 * the current billing CYCLE, not the term, because the per-cycle included
 * allowance resets each cycle.
 *
 * Returns [] for a non-enterprise org or one with no metered usage.
 */
export async function meteredUsage(input: {
  orgId: string;
  window: PeriodWindow;
  contract: ContractBilling | null;
}): Promise<UsageLine[]> {
  const quantities = await meterQuantities({
    orgId: input.orgId,
    window: input.window,
  });

  const lines: UsageLine[] = [];
  for (const [meterId, quantity] of quantities) {
    if (meterBillingMode("enterprise", meterId, input.contract) !== "metered") {
      continue;
    }
    const meter = getMeter(meterId);
    const rate = meteredRate(meterId, input.contract);
    if (!meter || !rate || quantity <= 0) continue;
    lines.push({
      meterId,
      product: meter.product,
      label: meter.label,
      unit: meter.unit,
      rate,
      quantity,
      costCents: rateCostCents(rate, quantity),
      billingMode: "metered",
    });
  }
  lines.sort(
    (a, b) => b.costCents - a.costCents || a.meterId.localeCompare(b.meterId),
  );
  return lines;
}
