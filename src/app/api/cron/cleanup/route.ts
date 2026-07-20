import { apiError, apiJson } from "@/lib/api";
import { cleanupExpired } from "@/lib/maintenance";

/**
 * Daily maintenance sweep (see src/lib/maintenance.ts), scheduled by the
 * crons entry in vercel.json. Vercel invokes it with
 * `Authorization: Bearer <CRON_SECRET>` when that env var is set; self-hosts
 * point their own scheduler here with the same header. Infra endpoint - not
 * part of the public API contract.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError(
      503,
      "cron_not_configured",
      "Set CRON_SECRET to enable the maintenance endpoint.",
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError(401, "unauthorized", "Invalid cron secret.");
  }

  const removed = await cleanupExpired();
  return apiJson({ removed });
}
