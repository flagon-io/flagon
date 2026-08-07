import { and, asc, eq } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { incidentSeverityLevels, type IncidentSeverityLevel } from "../db/schema.js";

/**
 * The STANDARD severity ladder every org starts with (customizable afterward).
 * `downtimeWeight` (0..1) = how much a minute at this severity counts against downtime:
 * sev1 is a full outage, sev4 is informational and moves uptime by nothing. This is
 * the same ladder the 0045 migration backfills, so a seeded org and a self-seeded one
 * are identical.
 */
/** How a severity rolls into the global/platform uptime total. */
export type PlatformMode = "full" | "proportional" | "none";
export const PLATFORM_MODES: PlatformMode[] = ["full", "proportional", "none"];

export const STANDARD_SEVERITY_LEVELS: Array<{
  key: string;
  name: string;
  description: string;
  rank: number;
  color: string;
  downtimeWeight: number;
  platformMode: PlatformMode;
  isDefault: boolean;
}> = [
  { key: "sev1", name: "SEV1", description: "Critical outage. Counts as full platform downtime.", rank: 1, color: "#ef4444", downtimeWeight: 1, platformMode: "full", isDefault: false },
  { key: "sev2", name: "SEV2", description: "Major degradation. Counts against the platform by affected services out of total.", rank: 2, color: "#f97316", downtimeWeight: 1, platformMode: "proportional", isDefault: false },
  { key: "sev3", name: "SEV3", description: "Minor. Shown on the timeline, no impact on uptime.", rank: 3, color: "#f59e0b", downtimeWeight: 0, platformMode: "none", isDefault: true },
  { key: "sev4", name: "SEV4", description: "Informational. Shown on the timeline, no impact on uptime.", rank: 4, color: "#a1a1aa", downtimeWeight: 0, platformMode: "none", isDefault: false },
];

/** An org's ACTIVE levels, ordered by rank (most severe first). */
function activeLevels(tx: TenantTx, orgId: string): Promise<IncidentSeverityLevel[]> {
  return tx
    .select()
    .from(incidentSeverityLevels)
    .where(and(eq(incidentSeverityLevels.organizationId, orgId), eq(incidentSeverityLevels.archived, false)))
    .orderBy(asc(incidentSeverityLevels.rank));
}

/** Get an org's active severity levels, seeding the standard ladder on first use. */
export async function getSeverityLevels(tx: TenantTx, orgId: string): Promise<IncidentSeverityLevel[]> {
  const rows = await activeLevels(tx, orgId);
  if (rows.length > 0) return rows;
  return ensureSeverityLevels(tx, orgId);
}

/**
 * Seed the standard ladder if the org has NEVER had severity levels; returns the
 * active ladder. Idempotent: an org that already has rows (even all archived) is left
 * alone, so we never resurrect a ladder an org deliberately reshaped.
 */
export async function ensureSeverityLevels(tx: TenantTx, orgId: string): Promise<IncidentSeverityLevel[]> {
  const existing = await tx
    .select({ id: incidentSeverityLevels.id })
    .from(incidentSeverityLevels)
    .where(eq(incidentSeverityLevels.organizationId, orgId))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) {
    // onConflictDoNothing so two concurrent first-reads (both seeing an empty ladder)
    // can't collide on the unique (org, key) index and 500 one of them.
    await tx
      .insert(incidentSeverityLevels)
      .values(STANDARD_SEVERITY_LEVELS.map((l) => ({ organizationId: orgId, ...l })))
      .onConflictDoNothing();
  }
  return activeLevels(tx, orgId);
}

/** Rank of a severity key among `levels`; unknown keys sort as least severe (+Infinity). */
export function rankOf(levels: Array<{ key: string; rank: number }>, key: string): number {
  return levels.find((l) => l.key === key)?.rank ?? Number.POSITIVE_INFINITY;
}

/** The key of the org's default severity (the `isDefault` level, else the most severe). */
export function defaultKey(levels: Array<{ key: string; rank: number; isDefault: boolean }>): string | null {
  if (levels.length === 0) return null;
  return levels.find((l) => l.isDefault)?.key ?? [...levels].sort((a, b) => a.rank - b.rank)[0].key;
}

/** The API shape for a severity level (drops ids/archived/timestamps). */
export function serializeLevel(l: IncidentSeverityLevel) {
  return {
    key: l.key,
    name: l.name,
    description: l.description,
    rank: l.rank,
    color: l.color,
    downtimeWeight: l.downtimeWeight,
    platformMode: l.platformMode,
    isDefault: l.isDefault,
  };
}
