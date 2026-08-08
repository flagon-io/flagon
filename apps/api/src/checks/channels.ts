import { and, eq, inArray } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { alertChannels, type AlertChannel } from "../db/schema.js";

/**
 * Alert-channel resolution for delivery. A check subscribes to specific channels (by id);
 * this loads the ENABLED ones among them so the notify path can fan an alert out. This is
 * the Checkly model — reusable channels a check selects, not raw addresses on the check.
 */
export async function channelsByIds(orgId: string, ids: string[]): Promise<AlertChannel[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  return withOrg(orgId, (tx) =>
    tx
      .select()
      .from(alertChannels)
      .where(and(eq(alertChannels.enabled, true), inArray(alertChannels.id, unique))),
  );
}

/** All enabled channels for the org (for the channel picker / management). */
export async function listEnabledChannels(orgId: string): Promise<AlertChannel[]> {
  return withOrg(orgId, (tx) => tx.select().from(alertChannels).where(eq(alertChannels.enabled, true)));
}
