import { apiError, apiJson } from "@/lib/api";
import { reconcileDirtyConfigs } from "@/lib/config-publish.server";

/**
 * Self-healing sweep for the OFREP config store: republish every org left
 * marked dirty (config_pending_at) because its inline write-through failed or
 * never ran. The common case is handled inline on save, so a healthy run finds
 * nothing; this exists so a store outage or a crashed invocation degrades to
 * bounded staleness (one cron interval) instead of a permanently stale artifact.
 *
 * Idempotent and re-entrant: publishing is derived entirely from the database,
 * and the marker is cleared only when it has not advanced, so an overlapping or
 * retried run cannot drop a concurrent change. Infra endpoint, CRON_SECRET-
 * gated, not part of the public API contract.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError(
      503,
      "cron_not_configured",
      "Set CRON_SECRET to enable the config reconcile endpoint.",
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "unauthorized", "Invalid cron secret.");
  }

  return apiJson(await reconcileDirtyConfigs());
}
