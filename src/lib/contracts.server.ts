import { and, desc, eq } from "drizzle-orm";
import { orgContracts } from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  contractStatus,
  termWindow,
  type ContractStatus,
  type ContractTerm,
} from "./contracts";
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
  meterAllowances: Record<string, number>;
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
