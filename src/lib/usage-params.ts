import { isProductId, type ProductId } from "./meters";
import { ORG_LEVEL } from "./usage-shared";

/**
 * How a usage view is asked for, over the wire.
 *
 * ONE parser for the REST endpoint and the console page. The console's URL is
 * the API's query string, so a link someone shares and the API call that
 * reproduces it are the same request: `?product=flags&group_by=project` means
 * the same thing in both, and neither can drift into supporting a filter the
 * other silently ignores.
 *
 * PURE: importable from client components (the filter bar builds URLs with
 * the same helpers that read them).
 */
export type GroupBy = "product" | "project" | "meter";
export type Granularity = "daily" | "weekly" | "monthly";

export const GROUP_BY_VALUES: GroupBy[] = ["product", "project", "meter"];
export const GRANULARITY_VALUES: Granularity[] = ["daily", "weekly", "monthly"];

export type UsageQuery = {
  /** Period start (ISO day), or null for the current period. */
  period: string | null;
  products: ProductId[];
  /** Project ids, or ORG_LEVEL for usage with no project. */
  projects: string[];
  meters: string[];
  groupBy: GroupBy;
  granularity: Granularity;
  cumulative: boolean;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Repeatable OR comma-separated, so both `?product=a&product=b` and
 * `?product=a,b` work. Callers paste from docs; both forms are common.
 */
function multi(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseUsageQuery(params: URLSearchParams): UsageQuery {
  const period = params.get("period");
  const groupBy = params.get("group_by");
  const granularity = params.get("granularity");
  const cumulative = params.get("cumulative");

  return {
    period: period && ISO_DAY.test(period) ? period : null,
    // Unknown product ids are dropped rather than erroring: a stale bookmark
    // from before a product was renamed should still render something.
    products: multi(params, "product").filter((value): value is ProductId =>
      isProductId(value),
    ),
    projects: multi(params, "project"),
    meters: multi(params, "meter"),
    groupBy: GROUP_BY_VALUES.includes(groupBy as GroupBy)
      ? (groupBy as GroupBy)
      : "product",
    granularity: GRANULARITY_VALUES.includes(granularity as Granularity)
      ? (granularity as Granularity)
      : "daily",
    cumulative: cumulative === "1" || cumulative === "true",
  };
}

/** Round-trips a query back to a search string, omitting defaults. */
export function usageQueryToParams(query: Partial<UsageQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.period) params.set("period", query.period);
  for (const product of query.products ?? []) params.append("product", product);
  for (const project of query.projects ?? []) params.append("project", project);
  for (const meter of query.meters ?? []) params.append("meter", meter);
  if (query.groupBy && query.groupBy !== "product") {
    params.set("group_by", query.groupBy);
  }
  if (query.granularity && query.granularity !== "daily") {
    params.set("granularity", query.granularity);
  }
  if (query.cumulative) params.set("cumulative", "1");
  return params;
}

export { ORG_LEVEL };
