import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  billingPeriodLines,
  billingPeriods,
  organizations,
  projects,
  usageRollups,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  currentPeriodFor,
  isoDay,
  previousPeriod,
  recentPeriods,
  type PeriodWindow,
} from "./billing-period";
import { ORG_LEVEL, type UsageBreakdownRow } from "./usage-shared";
import {
  PRODUCTS,
  allocateProRata,
  applyIncludedCredit,
  getMeter,
  isProductId,
  meterRate,
  rateCostCents,
  type MeterRate,
  type UsageLine,
  type UsageTotals,
} from "./meters";
import { isPlanId, type PlanId } from "./plans";
import { rateForMeter, type Entitlements } from "./entitlements";
import { orgEntitlementContext } from "./entitlements.server";

/**
 * How a meter was billed on a frozen line. New periods only ever write
 * `"priced"`; `"covered"`/`"metered"` survive only as HISTORICAL values on
 * periods closed under the old enterprise-contract billing, which the readers
 * below must keep rendering.
 */
export type BillingMode = "priced" | "covered" | "metered";

/**
 * Closed billing periods: the frozen record.
 *
 * usage.server.ts prices the OPEN period from the live registry. The moment a
 * period ends it is CLOSED into billing_periods + billing_period_lines with
 * the rate that applied, and from then on it is read, never recomputed.
 *
 * Two things depend on that:
 *
 *   History. A customer looking at March next year sees the numbers March was
 *   billed, not what March would cost at today's prices.
 *
 *   Idempotent invoicing. The period row IS the ledger of whether Stripe has
 *   been told about this window. A redelivered webhook finds status
 *   'invoiced' and stops, which is a far stronger guarantee than scanning
 *   Stripe's invoice items for a matching key.
 */

export type PeriodStatus = "open" | "closed" | "invoiced" | "void";

/**
 * The billing context for an org: its plan and the window it is currently
 * accruing into. Every usage surface starts here, so the console and the
 * invoice can never be looking at different months.
 */
export async function orgBillingContext(orgId: string): Promise<{
  plan: PlanId;
  includedCreditCents: number;
  /**
   * The org's fully resolved terms (plan -> price version). Carried so callers
   * that need per-meter allowances or caps do not re-resolve them, and so an
   * org's numbers are consistent across every surface that starts here.
   */
  entitlements: Entitlements;
  current: PeriodWindow;
}> {
  const [org] = await db
    .select({
      plan: organizations.plan,
      currentPeriodStart: organizations.currentPeriodStart,
      currentPeriodEnd: organizations.currentPeriodEnd,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const plan: PlanId = org && isPlanId(org.plan) ? org.plan : "free";
  // Resolved through the org's plan version rather than read from PLANS: an org
  // on a bespoke Pro version gets the credit that version sells.
  const { entitlements } = await orgEntitlementContext(orgId);
  return {
    plan,
    includedCreditCents: entitlements.includedCreditCents,
    entitlements,
    current: currentPeriodFor(org ?? {}),
  };
}

/**
 * The periods a customer can look back at: the open one, then every window
 * behind it. Closed periods come from their frozen rows; windows with no row
 * (nothing was ever billed, or the org predates a close) are still offered,
 * derived from the cycle, and render live from rollups.
 */
export async function selectablePeriods(input: {
  orgId: string;
  current: PeriodWindow;
  count?: number;
}): Promise<
  {
    window: PeriodWindow;
    key: string;
    status: PeriodStatus;
    isCurrent: boolean;
  }[]
> {
  const closed = await listPeriods({ orgId: input.orgId, limit: 36 });
  const byStart = new Map(closed.map((period) => [period.periodStart, period]));

  const windows = recentPeriods(input.current, input.count ?? 11);
  return windows.map((window, index) => {
    const key = isoDay(window.from);
    return {
      window,
      key,
      status: byStart.get(key)?.status ?? "open",
      isCurrent: index === 0,
    };
  });
}

/** Resolve a `period=` key back to its window by walking cycles backwards. */
export function windowForKey(
  current: PeriodWindow,
  key: string,
  maxLookback = 60,
): PeriodWindow | null {
  let window = current;
  for (let i = 0; i <= maxLookback; i += 1) {
    if (isoDay(window.from) === key) return window;
    if (isoDay(window.from) < key) return null;
    window = previousPeriod(window);
  }
  return null;
}

export type BillingPeriod = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PeriodStatus;
  plan: string;
  includedCreditCents: number;
  usageCents: number;
  creditAppliedCents: number;
  overageCents: number;
  stripeInvoiceId: string | null;
};

export type FrozenLine = {
  meterId: string;
  product: string;
  projectId: string | null;
  projectName: string | null;
  quantity: number;
  rate: MeterRate;
  costCents: number;
  /** How this meter was billed: priced | covered | metered (drizzle/0032). */
  billingMode: BillingMode;
};

/**
 * Aggregates the window's rollups into per-meter, per-project lines priced at
 * TODAY's rates. Called at close time only; the rates it reads are the ones
 * that get frozen.
 *
 * The included allowance is applied per meter across the whole org, because
 * that is what the plan actually grants, then split across projects pro rata
 * so the per-project view sums to the invoice exactly.
 */
async function freezeLines(
  orgId: string,
  window: PeriodWindow,
  entitlements: Entitlements,
): Promise<FrozenLine[]> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .select({
        meter: usageRollups.meter,
        projectId: usageRollups.projectId,
        quantity: sql<number>`sum(${usageRollups.quantity})::bigint`,
      })
      .from(usageRollups)
      .where(
        and(
          eq(usageRollups.organizationId, orgId),
          gte(usageRollups.day, isoDay(window.from)),
          lte(usageRollups.day, isoDay(window.to)),
        ),
      )
      .groupBy(usageRollups.meter, usageRollups.projectId),
  );

  const byMeter = new Map<
    string,
    { projectId: string | null; quantity: number }[]
  >();
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (quantity <= 0) continue;
    const entries = byMeter.get(row.meter) ?? [];
    entries.push({ projectId: row.projectId ?? null, quantity });
    byMeter.set(row.meter, entries);
  }

  const projectIds = [
    ...new Set(
      rows
        .map((row) => row.projectId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = projectIds.length
    ? await withTenant(orgId, (tx) =>
        tx
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(
            and(
              eq(projects.organizationId, orgId),
              inArray(projects.id, projectIds),
            ),
          ),
      )
    : [];
  const nameById = new Map(names.map((project) => [project.id, project.name]));

  const lines: FrozenLine[] = [];
  for (const [meterId, entries] of byMeter) {
    const meter = getMeter(meterId);
    // A meter pulled from the registry before its usage was ever closed has
    // no rate to freeze, so it cannot be billed. Skipping is the only safe
    // option: guessing a rate would invent a charge.
    if (!meter) continue;

    // The org's RESOLVED rate: the plan's published rate unless its price
    // version moved the allowance or the per-unit price. Frozen onto the line,
    // so a re-price later can never re-price a period that has already billed.
    const rate = rateForMeter(entitlements, meterId) ?? meterRate(meter);
    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const lineCost = rateCostCents(rate, total);
    const shares = allocateProRata(
      lineCost,
      entries.map((entry) => entry.quantity),
    );
    for (const [index, entry] of entries.entries()) {
      lines.push({
        meterId,
        product: meter.product,
        projectId: entry.projectId,
        projectName: entry.projectId
          ? (nameById.get(entry.projectId) ?? "Deleted project")
          : null,
        quantity: entry.quantity,
        rate,
        costCents: shares[index],
        billingMode: "priced",
      });
    }
  }
  return lines;
}

/**
 * Freezes a window into a closed period. Idempotent: a period that is already
 * closed or invoiced is returned untouched, because re-closing it would be
 * exactly the re-pricing this table exists to prevent.
 */
export async function closePeriod(input: {
  orgId: string;
  window: PeriodWindow;
  plan: string;
}): Promise<BillingPeriod> {
  const planId = isPlanId(input.plan) ? input.plan : "free";
  const periodStart = isoDay(input.window.from);
  const periodEnd = isoDay(input.window.to);

  const existing = await getPeriod({ orgId: input.orgId, periodStart });
  if (existing && existing.period.status !== "open") return existing.period;

  // The org's resolved terms, frozen into this period along with the lines. A
  // custom-priced customer's credit must be the one they were sold, and it must
  // stop moving the moment the period closes - re-reading the plan constant here
  // was what made a $100/mo Pro customer's closed periods show $20 of credit.
  const { entitlements } = await orgEntitlementContext(input.orgId);
  const includedCreditCents = entitlements.includedCreditCents;

  const lines = await freezeLines(input.orgId, input.window, entitlements);
  const usageCents = lines.reduce((total, line) => total + line.costCents, 0);
  const creditAppliedCents = Math.min(usageCents, includedCreditCents);
  const overageCents = usageCents - creditAppliedCents;

  return withTenant(input.orgId, async (tx) => {
    const inserted = await tx.execute(sql`
      INSERT INTO billing_periods (
        organization_id, period_start, period_end, status, plan,
        included_credit_cents, usage_cents, credit_applied_cents,
        overage_cents, closed_at
      )
      VALUES (
        ${input.orgId}::uuid, ${periodStart}::date, ${periodEnd}::date,
        'closed', ${planId}, ${includedCreditCents}, ${usageCents},
        ${creditAppliedCents}, ${overageCents}, now()
      )
      ON CONFLICT (organization_id, period_start) DO UPDATE SET
        period_end = EXCLUDED.period_end,
        status = 'closed',
        plan = EXCLUDED.plan,
        included_credit_cents = EXCLUDED.included_credit_cents,
        usage_cents = EXCLUDED.usage_cents,
        credit_applied_cents = EXCLUDED.credit_applied_cents,
        overage_cents = EXCLUDED.overage_cents,
        closed_at = now(),
        updated_at = now()
      RETURNING id
    `);
    const periodId = (inserted as unknown as { id: string }[])[0].id;

    // Replace wholesale: a close that ran while the period was still open
    // (a preview) must not leave stale lines behind.
    await tx
      .delete(billingPeriodLines)
      .where(eq(billingPeriodLines.billingPeriodId, periodId));

    if (lines.length) {
      await tx.insert(billingPeriodLines).values(
        lines.map((line) => ({
          organizationId: input.orgId,
          billingPeriodId: periodId,
          meter: line.meterId,
          product: line.product,
          projectId: line.projectId,
          projectName: line.projectName,
          quantity: line.quantity,
          unitAmountCents: line.rate.unitAmountCents,
          per: line.rate.per,
          includedQuantity: line.rate.includedQuantity,
          costCents: line.costCents,
          billingMode: line.billingMode,
        })),
      );
    }

    return {
      id: periodId,
      periodStart,
      periodEnd,
      status: "closed" as const,
      plan: planId,
      includedCreditCents,
      usageCents,
      creditAppliedCents,
      overageCents,
      stripeInvoiceId: null,
    };
  });
}

function toBillingPeriod(
  row: typeof billingPeriods.$inferSelect,
): BillingPeriod {
  return {
    id: row.id,
    periodStart: String(row.periodStart),
    periodEnd: String(row.periodEnd),
    status: row.status as PeriodStatus,
    plan: row.plan,
    includedCreditCents: row.includedCreditCents,
    usageCents: row.usageCents,
    creditAppliedCents: row.creditAppliedCents,
    overageCents: row.overageCents,
    stripeInvoiceId: row.stripeInvoiceId,
  };
}

/** A closed period and its frozen lines, or null if it was never closed. */
export async function getPeriod(input: {
  orgId: string;
  periodStart: string;
}): Promise<{ period: BillingPeriod; lines: FrozenLine[] } | null> {
  return withTenant(input.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(billingPeriods)
      .where(
        and(
          eq(billingPeriods.organizationId, input.orgId),
          eq(billingPeriods.periodStart, input.periodStart),
        ),
      )
      .limit(1);
    if (!row) return null;

    const lineRows = await tx
      .select()
      .from(billingPeriodLines)
      .where(eq(billingPeriodLines.billingPeriodId, row.id));

    return {
      period: toBillingPeriod(row),
      lines: lineRows.map((line) => ({
        meterId: line.meter,
        product: line.product,
        projectId: line.projectId,
        projectName: line.projectName,
        quantity: line.quantity,
        rate: {
          unitAmountCents: line.unitAmountCents,
          per: line.per,
          includedQuantity: line.includedQuantity,
        },
        costCents: line.costCents,
        billingMode: (line.billingMode as BillingMode) ?? "priced",
      })),
    };
  });
}

/** An org's closed periods, newest first: the "previous periods" menu. */
export async function listPeriods(input: {
  orgId: string;
  limit?: number;
}): Promise<BillingPeriod[]> {
  const rows = await withTenant(input.orgId, (tx) =>
    tx
      .select()
      .from(billingPeriods)
      .where(eq(billingPeriods.organizationId, input.orgId))
      .orderBy(desc(billingPeriods.periodStart))
      .limit(input.limit ?? 24),
  );
  return rows.map(toBillingPeriod);
}

/**
 * Marks a closed period as sent to Stripe. The status flip is what makes
 * invoicing exactly-once, so it happens AFTER the invoice items land.
 */
export async function markInvoiced(input: {
  orgId: string;
  periodId: string;
  stripeInvoiceId: string;
}): Promise<void> {
  await withTenant(input.orgId, (tx) =>
    tx
      .update(billingPeriods)
      .set({
        status: "invoiced",
        stripeInvoiceId: input.stripeInvoiceId,
        invoicedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingPeriods.organizationId, input.orgId),
          eq(billingPeriods.id, input.periodId),
        ),
      ),
  );
}

/**
 * Renders a frozen period in the same shape the live page uses, so a
 * historical period and the current one go through one set of components.
 * Prices come from the frozen rates, never the registry.
 */
export function totalsFromSnapshot(
  period: BillingPeriod,
  lines: FrozenLine[],
): UsageTotals {
  const byMeter = new Map<string, UsageLine>();
  for (const line of lines) {
    const meter = getMeter(line.meterId);
    const existing = byMeter.get(line.meterId);
    if (existing) {
      existing.quantity += line.quantity;
      existing.costCents += line.costCents;
      continue;
    }
    byMeter.set(line.meterId, {
      meterId: line.meterId,
      product: line.product,
      // The registry's current label if the meter still exists; otherwise the
      // id, which is at least honest about what was billed.
      label: meter?.label ?? line.meterId,
      unit: meter?.unit ?? "units",
      rate: line.rate,
      quantity: line.quantity,
      costCents: line.costCents,
      billingMode: line.billingMode,
    });
  }
  const usageLines = [...byMeter.values()].sort(
    (a, b) => b.costCents - a.costCents || a.meterId.localeCompare(b.meterId),
  );
  // The frozen totals win: applyIncludedCredit re-derives them from the same
  // lines, so this is a consistency check as much as a conversion.
  return {
    ...applyIncludedCredit(usageLines, period.includedCreditCents),
    usageCents: period.usageCents,
    creditAppliedCents: period.creditAppliedCents,
    creditRemainingCents: Math.max(
      period.includedCreditCents - period.creditAppliedCents,
      0,
    ),
    overageCents: period.overageCents,
  };
}

/** Frozen lines grouped for the table, matching usageView's row shape. */
export function breakdownFromSnapshot(
  lines: FrozenLine[],
  groupBy: "product" | "project" | "meter",
): UsageBreakdownRow[] {
  const totals = new Map<
    string,
    { label: string; quantity: number; costCents: number }
  >();
  for (const line of lines) {
    const key =
      groupBy === "meter"
        ? line.meterId
        : groupBy === "project"
          ? (line.projectId ?? ORG_LEVEL)
          : line.product;
    const label =
      groupBy === "meter"
        ? (getMeter(line.meterId)?.label ?? line.meterId)
        : groupBy === "project"
          ? (line.projectName ?? "Organization")
          : isProductId(line.product)
            ? PRODUCTS[line.product].label
            : line.product;
    const entry = totals.get(key) ?? { label, quantity: 0, costCents: 0 };
    entry.quantity += line.quantity;
    entry.costCents += line.costCents;
    totals.set(key, entry);
  }
  return [...totals]
    .map(([key, entry]) => ({ key, ...entry }))
    .sort(
      (a, b) => b.costCents - a.costCents || a.label.localeCompare(b.label),
    );
}
