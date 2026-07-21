import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { projects, usageRollups } from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  addDaysUTC,
  addMonthsUTC,
  isoDay,
  startOfDayUTC,
  type PeriodWindow,
} from "./billing-period";
import {
  METERS,
  PRODUCTS,
  allocateProRata,
  applyIncludedCredit,
  getMeter,
  isProductId,
  lineFromMeter,
  rateCostCents,
  type MeterRate,
  type ProductId,
  type UsageLine,
  type UsageTotals,
} from "./meters";
import { planRate } from "./quota";
import type { PlanId } from "./plans";
import type { Granularity, GroupBy } from "./usage-params";
import {
  ORG_LEVEL,
  type UsageBreakdownRow,
  type UsageBucket,
  type UsageView,
} from "./usage-shared";

/**
 * Usage data access: the live ledger.
 *
 * Rollups are product data, so every query runs inside withTenant (RLS keyed
 * on the org). The usage page and the invoice builder read through the SAME
 * summary, so what a customer sees during the period is exactly what they are
 * billed for at the end of it.
 *
 * This module prices the OPEN period only. Closed periods are read from their
 * frozen snapshot in billing-periods.server.ts, because re-pricing history
 * from a registry that can change is how a console starts disagreeing with
 * the invoices it already sent.
 */

export { isoDay, ORG_LEVEL };
export type { UsageBucket, UsageBreakdownRow, UsageView, GroupBy, Granularity };

export type UsageFilter = {
  /** Restrict to these products. Empty/omitted means all. */
  products?: ProductId[];
  /** Project ids, or ORG_LEVEL for usage not attributed to a project. */
  projects?: string[];
  /** Restrict to these meter ids. Empty/omitted means all. */
  meters?: string[];
};

/**
 * Writes STRAIGHT INTO the rollup, accumulating per org+project+meter+day.
 *
 * NOT the ingest path. It carries no receipt and reserves no quota, so a
 * replayed call bills twice - which is exactly why request-driven usage goes
 * through recordUsageEvent() in usage-events.server.ts instead, and reaches
 * this table only via compaction.
 *
 * Kept for the cases that are genuinely rollup-grain already: backfills,
 * corrections, and tests that want to seed a ledger without replaying events.
 */
export async function recordUsage(input: {
  orgId: string;
  meter: string;
  quantity: number;
  projectId?: string | null;
  at?: Date;
}): Promise<void> {
  if (!getMeter(input.meter)) {
    throw new Error(`Unknown meter: ${input.meter}`);
  }
  if (input.quantity <= 0) return;

  const day = isoDay(input.at ?? new Date());
  const projectId = input.projectId ?? null;

  // ON CONFLICT targets the COALESCE expression index from 0016_usage.sql,
  // which drizzle's onConflictDoUpdate can't express, so this is raw SQL.
  await withTenant(input.orgId, (tx) =>
    tx.execute(sql`
      INSERT INTO usage_rollups (organization_id, project_id, meter, day, quantity)
      VALUES (${input.orgId}::uuid, ${projectId}::uuid, ${input.meter}, ${day}::date, ${input.quantity})
      ON CONFLICT (
        organization_id,
        COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
        meter,
        day
      )
      DO UPDATE SET
        quantity = usage_rollups.quantity + EXCLUDED.quantity,
        updated_at = now()
    `),
  );
}

/**
 * Translates a filter into SQL. Product and meter filters both resolve to a
 * set of meter ids through the registry, so a product filter automatically
 * picks up meters added to that product later.
 */
function filterConditions(filter: UsageFilter | undefined): SQL[] {
  const conditions: SQL[] = [];
  if (!filter) return conditions;

  let meterIds: string[] | null = null;
  if (filter.products?.length) {
    const products = new Set<string>(filter.products);
    meterIds = METERS.filter((meter) => products.has(meter.product)).map(
      (meter) => meter.id,
    );
  }
  if (filter.meters?.length) {
    const requested = new Set(filter.meters);
    meterIds = (meterIds ?? [...requested]).filter((id) => requested.has(id));
  }
  if (meterIds) {
    // An empty set must match nothing, not everything.
    conditions.push(
      meterIds.length ? inArray(usageRollups.meter, meterIds) : sql`false`,
    );
  }

  if (filter.projects?.length) {
    const wantsOrgLevel = filter.projects.includes(ORG_LEVEL);
    const ids = filter.projects.filter((id) => id !== ORG_LEVEL);
    const clauses: SQL[] = [];
    if (ids.length) clauses.push(inArray(usageRollups.projectId, ids));
    if (wantsOrgLevel) clauses.push(isNull(usageRollups.projectId));
    const combined = clauses.length > 1 ? or(...clauses) : clauses[0];
    conditions.push(combined ?? sql`false`);
  }

  return conditions;
}

function windowConditions(orgId: string, window: PeriodWindow): SQL[] {
  return [
    eq(usageRollups.organizationId, orgId),
    gte(usageRollups.day, isoDay(window.from)),
    lte(usageRollups.day, isoDay(window.to)),
  ];
}

export type UsageSummary = UsageTotals & {
  from: string;
  to: string;
};

/**
 * Everything used in the window, priced by the registry. Meters with no usage
 * are omitted; unknown meter ids (a product removed from the registry
 * entirely) are skipped rather than guessed at.
 *
 * Filters narrow what is SHOWN. The unfiltered summary is what gets billed,
 * so the invoice builder always calls this without a filter.
 */
export async function usageSummary(input: {
  orgId: string;
  window: PeriodWindow;
  includedCreditCents: number;
  filter?: UsageFilter;
  /**
   * Whose allowances to price against. Some meters (flags.syncs) have a
   * per-plan included quantity rather than a meter-level one, so the same
   * quantity costs different amounts on different plans. Defaults to the
   * capped plan, which never over-states an allowance.
   */
  plan?: PlanId;
}): Promise<UsageSummary> {
  const rows = await withTenant(input.orgId, (tx) =>
    tx
      .select({
        meter: usageRollups.meter,
        quantity: sql<number>`sum(${usageRollups.quantity})::bigint`,
      })
      .from(usageRollups)
      .where(
        and(
          ...windowConditions(input.orgId, input.window),
          ...filterConditions(input.filter),
        ),
      )
      .groupBy(usageRollups.meter),
  );

  const plan = input.plan ?? "free";
  const lines: UsageLine[] = [];
  for (const row of rows) {
    const meter = getMeter(row.meter);
    if (!meter) continue;
    const quantity = Number(row.quantity);
    if (quantity <= 0) continue;
    lines.push(
      lineFromMeter(meter, quantity, planRate(plan, meter.id) ?? undefined),
    );
  }
  lines.sort(
    (a, b) => b.costCents - a.costCents || a.meterId.localeCompare(b.meterId),
  );

  return {
    ...applyIncludedCredit(lines, input.includedCreditCents),
    from: isoDay(input.window.from),
    to: isoDay(input.window.to),
  };
}

/**
 * Quantity per meter in the window, unpriced.
 *
 * usageSummary answers the same question and then prices the result, which is
 * wrong for a contracted organization: the money is not what they owe, and
 * pricing a year of traffic just to throw the cents away would also apply a
 * monthly credit across a term that is not a month.
 *
 * Meters with no usage are absent rather than zero. Unknown meter ids (a
 * product retired from the registry) are kept: a contract review has to see
 * consumption the registry no longer describes, not silently lose it.
 */
export async function meterQuantities(input: {
  orgId: string;
  window: PeriodWindow;
  filter?: UsageFilter;
}): Promise<Map<string, number>> {
  const rows = await withTenant(input.orgId, (tx) =>
    tx
      .select({
        meter: usageRollups.meter,
        quantity: sql<number>`sum(${usageRollups.quantity})::bigint`,
      })
      .from(usageRollups)
      .where(
        and(
          ...windowConditions(input.orgId, input.window),
          ...filterConditions(input.filter),
        ),
      )
      .groupBy(usageRollups.meter),
  );

  const totals = new Map<string, number>();
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (quantity > 0) totals.set(row.meter, quantity);
  }
  return totals;
}

/**
 * Raw day-grain rows for the window: the one query every breakdown and series
 * is derived from. Kept in one place so a filter can never apply to the chart
 * but not the table.
 */
async function usageRows(input: {
  orgId: string;
  window: PeriodWindow;
  filter?: UsageFilter;
}): Promise<
  { day: string; meter: string; projectId: string | null; quantity: number }[]
> {
  const rows = await withTenant(input.orgId, (tx) =>
    tx
      .select({
        day: usageRollups.day,
        meter: usageRollups.meter,
        projectId: usageRollups.projectId,
        quantity: sql<number>`sum(${usageRollups.quantity})::bigint`,
      })
      .from(usageRollups)
      .where(
        and(
          ...windowConditions(input.orgId, input.window),
          ...filterConditions(input.filter),
        ),
      )
      .groupBy(usageRollups.day, usageRollups.meter, usageRollups.projectId),
  );
  return rows.map((row) => ({
    day: String(row.day),
    meter: row.meter,
    projectId: row.projectId ?? null,
    quantity: Number(row.quantity),
  }));
}

/**
 * Quantity per project for one meter in the window, keyed by project id
 * (ORG_LEVEL for usage not attributed to a project).
 *
 * QUANTITY, not cost, and deliberately so: this feeds the project cards, where
 * "2.1M evaluations" is the number a developer recognizes as their own traffic.
 * Cost would be a lie at that grain anyway, since the plan's allowance belongs
 * to the organization and cannot be honestly split per project outside the
 * pro-rata allocation the usage page does.
 */
export async function usageByProject(input: {
  orgId: string;
  window: PeriodWindow;
  meter: string;
}): Promise<Map<string, number>> {
  const rows = await withTenant(input.orgId, (tx) =>
    tx
      .select({
        projectId: usageRollups.projectId,
        quantity: sql<number>`sum(${usageRollups.quantity})::bigint`,
      })
      .from(usageRollups)
      .where(
        and(
          ...windowConditions(input.orgId, input.window),
          eq(usageRollups.meter, input.meter),
        ),
      )
      .groupBy(usageRollups.projectId),
  );

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.projectId ?? ORG_LEVEL, Number(row.quantity));
  }
  return totals;
}

/** The projects that produced usage in the window, for the filter menu. */
export async function usageProjects(input: {
  orgId: string;
  window: PeriodWindow;
}): Promise<{ id: string; name: string }[]> {
  const rows = await usageRows(input);
  const ids = [
    ...new Set(
      rows
        .map((row) => row.projectId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!ids.length) return [];

  const named = await withTenant(input.orgId, (tx) =>
    tx
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, input.orgId),
          inArray(projects.id, ids),
        ),
      ),
  );
  const byId = new Map(named.map((project) => [project.id, project.name]));
  // A project can be deleted while its usage lives on (drizzle/0017).
  return ids
    .map((id) => ({ id, name: byId.get(id) ?? "Deleted project" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The allowance drawdown, applied in time order.
 *
 * An included allowance belongs to the PERIOD, not to a day, so it has to be
 * consumed as usage arrives: the first million evaluations of the cycle cost
 * nothing wherever in the month they land, and cost starts appearing the
 * moment the allowance runs out. Charging each bucket in isolation would make
 * the chart add up to more than the bill.
 *
 * Each bucket is charged the DIFFERENCE between the cumulative cost through
 * it and the cumulative cost before it, so the buckets sum to exactly the
 * period total with no rounding drift.
 */
function drawDown(rate: MeterRate, quantitiesInOrder: number[]): number[] {
  let cumulative = 0;
  let chargedSoFar = 0;
  return quantitiesInOrder.map((quantity) => {
    cumulative += quantity;
    const total = rateCostCents(rate, cumulative);
    const bucketCost = total - chargedSoFar;
    chargedSoFar = total;
    return bucketCost;
  });
}

/**
 * Buckets a window at the requested granularity, ANCHORED TO THE PERIOD START
 * rather than to the calendar. A cycle that runs the 19th to the 19th gets
 * weeks starting on the 19th, so no bucket straddles two bills.
 */
export function bucketsFor(
  window: PeriodWindow,
  granularity: Granularity,
): { key: string; start: Date; end: Date }[] {
  const buckets: { key: string; start: Date; end: Date }[] = [];
  const last = startOfDayUTC(window.to);
  let cursor = startOfDayUTC(window.from);

  while (cursor <= last) {
    const next =
      granularity === "daily"
        ? addDaysUTC(cursor, 1)
        : granularity === "weekly"
          ? addDaysUTC(cursor, 7)
          : addMonthsUTC(cursor, 1);
    const end = addDaysUTC(next, -1);
    buckets.push({
      key: isoDay(cursor),
      start: cursor,
      end: end > last ? last : end,
    });
    cursor = next;
  }
  return buckets;
}

/**
 * The usage page's whole data model in one call: bucketed series plus period
 * totals, sliced and grouped however the customer asked.
 *
 * The chart and the table come from the SAME numbers, so a filtered chart can
 * never tell a different story than the rows underneath it.
 */
export async function usageView(input: {
  orgId: string;
  window: PeriodWindow;
  filter?: UsageFilter;
  groupBy?: GroupBy;
  granularity?: Granularity;
  /** Whose allowances to price against; see usageSummary. */
  plan?: PlanId;
}): Promise<UsageView> {
  const groupBy = input.groupBy ?? "product";
  const granularity = input.granularity ?? "daily";
  const [rows, projectNames] = await Promise.all([
    usageRows(input),
    groupBy === "project"
      ? usageProjects({ orgId: input.orgId, window: input.window })
      : Promise.resolve([]),
  ]);

  const buckets = bucketsFor(input.window, granularity);
  const bucketIndex = new Map<string, number>();
  for (const [index, bucket] of buckets.entries()) {
    for (
      let cursor = new Date(bucket.start);
      cursor <= bucket.end;
      cursor = addDaysUTC(cursor, 1)
    ) {
      bucketIndex.set(isoDay(cursor), index);
    }
  }

  const projectLabel = new Map(projectNames.map((p) => [p.id, p.name]));
  const groupKeyOf = (row: { meter: string; projectId: string | null }) => {
    if (groupBy === "meter") return row.meter;
    if (groupBy === "project") return row.projectId ?? ORG_LEVEL;
    return getMeter(row.meter)?.product ?? "unknown";
  };

  // Quantity per meter per bucket per group. Cost is derived per METER,
  // because the allowance is a property of the meter, then split across the
  // groups that contributed to that bucket.
  const perMeter = new Map<
    string,
    { bucketQuantities: number[]; groupQuantities: Map<string, number>[] }
  >();
  const groupTotals = new Map<
    string,
    { quantity: number; costCents: number }
  >();

  for (const row of rows) {
    const index = bucketIndex.get(row.day);
    if (index === undefined) continue;
    let entry = perMeter.get(row.meter);
    if (!entry) {
      entry = {
        bucketQuantities: buckets.map(() => 0),
        groupQuantities: buckets.map(() => new Map<string, number>()),
      };
      perMeter.set(row.meter, entry);
    }
    entry.bucketQuantities[index] += row.quantity;
    const key = groupKeyOf(row);
    entry.groupQuantities[index].set(
      key,
      (entry.groupQuantities[index].get(key) ?? 0) + row.quantity,
    );
    const total = groupTotals.get(key) ?? { quantity: 0, costCents: 0 };
    total.quantity += row.quantity;
    groupTotals.set(key, total);
  }

  const outBuckets: UsageBucket[] = buckets.map((bucket) => ({
    key: bucket.key,
    start: isoDay(bucket.start),
    end: isoDay(bucket.end),
    byGroup: {},
    totalCents: 0,
    byGroupQuantity: {},
    totalQuantity: 0,
  }));

  // Quantity first, and independently of cost. A bucket fully covered by the
  // allowance costs nothing, and folding quantity into the pricing loop below
  // would drop it from the chart entirely - which is exactly the traffic a
  // contracted customer most needs to see.
  for (const entry of perMeter.values()) {
    for (const [index, groups] of entry.groupQuantities.entries()) {
      for (const [key, quantity] of groups) {
        if (quantity <= 0) continue;
        outBuckets[index].byGroupQuantity[key] =
          (outBuckets[index].byGroupQuantity[key] ?? 0) + quantity;
        outBuckets[index].totalQuantity += quantity;
      }
    }
  }

  let usageCents = 0;
  for (const [meterId, entry] of perMeter) {
    const meter = getMeter(meterId);
    if (!meter) continue;
    // Same plan-aware rate the summary uses, so the chart and the total can
    // never tell different stories about the same period.
    const bucketCosts = drawDown(
      planRate(input.plan ?? "free", meterId) ?? meter,
      entry.bucketQuantities,
    );

    for (const [index, cost] of bucketCosts.entries()) {
      if (cost <= 0) continue;
      usageCents += cost;
      const groups = [...entry.groupQuantities[index]];
      const shares = allocateProRata(
        cost,
        groups.map(([, quantity]) => quantity),
      );
      for (const [position, [key]] of groups.entries()) {
        const share = shares[position];
        if (share <= 0) continue;
        outBuckets[index].byGroup[key] =
          (outBuckets[index].byGroup[key] ?? 0) + share;
        outBuckets[index].totalCents += share;
        const total = groupTotals.get(key);
        if (total) total.costCents += share;
      }
    }
  }

  const labelFor = (key: string): string => {
    if (groupBy === "meter") return getMeter(key)?.label ?? key;
    if (groupBy === "project") {
      return key === ORG_LEVEL
        ? "Organization"
        : (projectLabel.get(key) ?? "Deleted project");
    }
    return isProductId(key) ? PRODUCTS[key].label : key;
  };

  const breakdown: UsageBreakdownRow[] = [...groupTotals]
    .map(([key, total]) => ({
      key,
      label: labelFor(key),
      quantity: total.quantity,
      costCents: total.costCents,
    }))
    .sort(
      (a, b) => b.costCents - a.costCents || a.label.localeCompare(b.label),
    );

  return {
    from: isoDay(input.window.from),
    to: isoDay(input.window.to),
    groupBy,
    granularity,
    buckets: outBuckets,
    rows: breakdown,
    usageCents,
  };
}
