import type { Granularity, GroupBy } from "./usage-params";

/**
 * The shapes the usage chart and table render from.
 *
 * Split out of usage.server.ts so client components can import the TYPES
 * without dragging the database client into the browser bundle, and so the
 * live view and a frozen historical period can be rendered by the same
 * components.
 */

/** Sentinel for usage not attributed to a project, in filters and group keys. */
export const ORG_LEVEL = "__org__";

export type UsageBucket = {
  /** First day of the bucket (ISO), and its stable key. */
  key: string;
  start: string;
  end: string;
  /** Cost in cents per group key, allowance already drawn down. */
  byGroup: Record<string, number>;
  totalCents: number;
};

export type UsageBreakdownRow = {
  /** Group key: product id, project id (or ORG_LEVEL), or meter id. */
  key: string;
  label: string;
  quantity: number;
  costCents: number;
};

export type UsageView = {
  from: string;
  to: string;
  groupBy: GroupBy;
  granularity: Granularity;
  /** Chronological buckets for the chart. */
  buckets: UsageBucket[];
  /** Period totals per group, for the table and the legend. */
  rows: UsageBreakdownRow[];
  /** What the filtered slice cost, before any credit. */
  usageCents: number;
};

/**
 * Running totals across buckets. A cumulative view is how you see the
 * included allowance being eaten: the line climbs toward the credit and the
 * moment it crosses, the overage starts.
 */
export function cumulate(buckets: UsageBucket[]): UsageBucket[] {
  const running: Record<string, number> = {};
  let total = 0;
  return buckets.map((bucket) => {
    total += bucket.totalCents;
    for (const [key, cents] of Object.entries(bucket.byGroup)) {
      running[key] = (running[key] ?? 0) + cents;
    }
    return { ...bucket, byGroup: { ...running }, totalCents: total };
  });
}
