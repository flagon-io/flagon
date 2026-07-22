import { apiError, apiJson } from "@/lib/api";
import { getFlag } from "@/lib/flags.server";
import { flagUsageDetail, orgEmitsExposures } from "@/lib/flag-usage.server";
import {
  assessFlag,
  checksPerHour,
  passRate,
  variantDistribution,
} from "@/lib/flag-metrics";
import type { FlagType } from "@/lib/flags";
import { resolveFlagOrg } from "../../context";

/**
 * GET /api/v1/orgs/:slug/flags/:key/usage - per-flag usage analytics.
 *
 * The same numbers the flag detail page renders: the check series, variant and
 * targeting breakdowns, the checks/hr rate, pass rate, and the staleness
 * assessment. All derived from client-reported exposures (plus server-side
 * single-flag evals); a flag with no exposures returns zeros and a null
 * last_checked_at rather than an error.
 *
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; key: string }> },
) {
  const { slug, key } = await params;
  const context = await resolveFlagOrg(request, slug, "flags:read");
  if ("error" in context) return context.error;

  const flag = await getFlag(context.org.id, key);
  if (!flag) return apiError(404, "flag_not_found", `Flag '${key}' not found.`);

  const [usage, emitsExposures] = await Promise.all([
    flagUsageDetail(context.org.id, key),
    orgEmitsExposures(context.org.id),
  ]);
  const now = new Date();
  const lastCheckedAt = usage.lastCheckedAt;
  const assessment = assessFlag(flag, {
    now,
    // Staleness uses real app access (exposures), not billed evaluations.
    lastCheckedAt: usage.exposedLastAt ? new Date(usage.exposedLastAt) : null,
    orgEmitsExposures: emitsExposures,
  });

  return apiJson({
    flag_key: key,
    // Billed evaluations (bulk + single-flag), reconciling with the invoice.
    total_checks: usage.totalChecks,
    checks_per_hour: checksPerHour(usage.series, now),
    pass_rate: passRate(usage.byVariant, flag.type as FlagType),
    last_checked_at: lastCheckedAt,
    // Client-hook app reads (real usage), the staleness signal.
    exposures_30d: usage.exposedChecks,
    last_exposed_at: usage.exposedLastAt,
    stale: assessment.stale,
    stale_reasons: assessment.reasons,
    variants: variantDistribution(usage.byVariant).map((v) => ({
      variant: v.variantKey,
      count: v.count,
      share: v.share,
    })),
    reasons: usage.byReason,
    series: usage.series.map((point) => ({
      hour: point.at,
      count: point.count,
    })),
  });
}
