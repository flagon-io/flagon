import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { planRetentionDays } from "./plans.js";

/**
 * How far back an org may ANALYZE outcome history (flag impact + experiments).
 *
 * Every exposure/track event is billed at ingest regardless of this — retention
 * only bounds the analysis WINDOW, which keeps stored detail cheap and makes more
 * history a paid upsell. The window is the plan base (lib/plans.ts) unless the org
 * carries a higher override (a purchased add-on), stored as `retentionDays` in the
 * org's metadata JSON — the same marker channel enterprise/comped overrides use.
 * `null` means unlimited (Enterprise / contract).
 */
export async function effectiveRetentionDays(orgId: string): Promise<number | null> {
  const row = (
    await db
      .select({ plan: organizations.plan, metadata: organizations.metadata })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
  )[0];
  const base = planRetentionDays(row?.plan ?? "hobby");
  if (base === null) return null; // unlimited — a wider override can't shrink it.
  const override = parseOverride(row?.metadata ?? null);
  return override !== null && override > base ? override : base;
}

/** A positive integer `retentionDays` override from the org metadata JSON, or null. */
function parseOverride(metadata: string | null): number | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { retentionDays?: unknown };
    const v = parsed?.retentionDays;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
  } catch {
    return null;
  }
}

/**
 * The earliest UTC day (YYYY-MM-DD) an analysis may include for a retention window,
 * or null for an unlimited window. Events/exposures on days >= this are in scope.
 */
export function retentionSinceDay(
  retentionDays: number | null,
  nowMs = Date.now(),
): string | null {
  if (retentionDays === null) return null;
  const d = new Date(nowMs);
  d.setUTCDate(d.getUTCDate() - retentionDays);
  return d.toISOString().slice(0, 10);
}
