import { and, eq, inArray } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { alertChannels, notificationDeliveries, type DeliveryPayload } from "../db/schema.js";

/**
 * Enqueue a notification to a set of alert channels — the ONE way producers (checks,
 * incidents, flag events) emit outbound messages. Writes a `notification_deliveries`
 * row per enabled channel and returns immediately; the drain sweep delivers. Runs
 * inside the caller's tenant transaction so it commits atomically with the state
 * change that triggered it (a check flips to down AND its alerts are queued, or
 * neither). Idempotent: the dedupe key (event + channel) makes overlapping enqueues
 * and flapping producers land exactly one row per (event, channel).
 */
export async function enqueueNotifications(
  tx: TenantTx,
  opts: {
    orgId: string;
    /** Alert-channel KEYS (producers reference channels by key; resolved to ids here). */
    channelKeys: string[];
    sourceType: "check" | "incident" | "flag_event" | "usage" | "test";
    sourceId?: string | null;
    /** A stable id for THIS event, e.g. "check.down:<checkId>:<stateChangeId>". */
    eventKey: string;
    payload: DeliveryPayload;
  },
): Promise<number> {
  const keys = [...new Set(opts.channelKeys)].filter(Boolean);
  if (keys.length === 0) return 0;
  // Resolve keys to enabled channels in this org (RLS already scopes to the tenant).
  const chans = await tx
    .select({ id: alertChannels.id, type: alertChannels.type })
    .from(alertChannels)
    .where(and(inArray(alertChannels.key, keys), eq(alertChannels.enabled, true)));
  let queued = 0;
  for (const ch of chans) {
    const inserted = await tx
      .insert(notificationDeliveries)
      .values({
        organizationId: opts.orgId,
        channelId: ch.id,
        provider: ch.type,
        sourceType: opts.sourceType,
        sourceId: opts.sourceId ?? null,
        eventKey: opts.eventKey,
        dedupeKey: `${opts.eventKey}:${ch.id}`,
        payload: opts.payload,
      })
      .onConflictDoNothing({ target: notificationDeliveries.dedupeKey })
      .returning({ id: notificationDeliveries.id });
    queued += inserted.length;
  }
  return queued;
}
