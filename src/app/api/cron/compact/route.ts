import { apiError, apiJson } from "@/lib/api";
import { sweepUsageEvents } from "@/lib/usage-events.server";

/**
 * Hourly usage compaction: folds raw usage_events into usage_rollups and ages
 * out receipts past their retention window.
 *
 * Separate from /api/cron/cleanup, which stays daily. Compaction sets the lag
 * on every usage number a customer can see, so it wants a much tighter cadence
 * than expiry sweeps do; running session and verification cleanup twenty-four
 * times as often to get it would be paying for the wrong thing.
 *
 * Idempotent and re-entrant: compaction is exactly-once by construction
 * (see src/lib/usage-events.server.ts), so an overlapping or retried run
 * cannot double-count. Infra endpoint, CRON_SECRET-gated, not part of the
 * public API contract.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError(
      503,
      "cron_not_configured",
      "Set CRON_SECRET to enable the compaction endpoint.",
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "unauthorized", "Invalid cron secret.");
  }

  return apiJson({ usage: await sweepUsageEvents() });
}
