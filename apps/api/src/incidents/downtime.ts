import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { incidents, incidentServices, incidentSeverityLevels, projects } from "../db/schema.js";
import { ensureSeverityLevels } from "./severity-levels.js";

/**
 * Weighted downtime + uptime accounting, on two INDEPENDENT axes.
 *
 * There is no fixed SLA here — we measure what happened and let orgs frame it (see
 * objectives). Severity carries two knobs (see incident_severity_levels):
 *
 *  - SERVICE impact (`downtime_weight`, 0..1): how much a minute at this severity counts
 *    against the AFFECTED project's own uptime. A full outage counts fully; a minor
 *    severity might count 25%; informational counts nothing.
 *  - PLATFORM impact (`platform_mode`): how the incident rolls into the GLOBAL total,
 *    DECOUPLED from per-service — `full` = the whole platform is down (a SEV1);
 *    `proportional` = counts by affected-services / total-services share (a SEV2, "n/14");
 *    `none` = no platform impact even though it still dents the affected service.
 *
 * So a service-scoped severity can dent one project's uptime while moving the platform
 * total by nothing. Overlaps never double-count: per instant we take the max active
 * weight per service, and the most-impactful mode (a single `full` incident pins the
 * platform at 100% down). Computed on read, so re-weighting a severity is immediate.
 */

export type ProjectUptime = {
  projectKey: string;
  name: string;
  uptimePct: number; // 0..100
  weightedDowntimeSeconds: number;
  incidentCount: number;
};

export type DowntimeReport = {
  windowStart: string;
  windowEnd: string;
  windowSeconds: number;
  totalServices: number;
  perProject: ProjectUptime[];
  // Totals are the PLATFORM axis (not a mean of services): platform uptime over the
  // window, the weighted platform downtime, and the distinct incident count.
  totals: { uptimePct: number; weightedDowntimeSeconds: number; incidentCount: number };
};

type ServiceInterval = { start: number; end: number; weight: number };
type PlatformRow = { projectId: string; start: number; end: number; weight: number; mode: string };

/**
 * Per-service weighted downtime (seconds): the integral of the max active service weight.
 * Boundaries are interval endpoints; each sub-segment is charged its width times the
 * heaviest incident covering it.
 */
export function weightedDowntimeSeconds(intervals: ServiceInterval[]): number {
  if (intervals.length === 0) return 0;
  const bounds = Array.from(new Set(intervals.flatMap((iv) => [iv.start, iv.end]))).sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (b <= a) continue;
    let w = 0;
    for (const iv of intervals) if (iv.start <= a && iv.end >= b && iv.weight > w) w = iv.weight;
    if (w > 0) total += (b - a) * w;
  }
  return total;
}

/**
 * Platform weighted downtime (seconds) across all services. At each instant a `full`
 * incident pins impact at 1 (whole platform down); otherwise impact is the affected
 * services' summed weight over the total service count (so a proportional SEV on 1 of 14
 * services contributes 1/14). `none`-mode rows are excluded — they never touch the total.
 */
export function platformDowntimeSeconds(rows: PlatformRow[], totalServices: number): number {
  const contributing = rows.filter((r) => r.mode === "full" || r.mode === "proportional");
  if (contributing.length === 0 || totalServices <= 0) return 0;
  const bounds = Array.from(new Set(contributing.flatMap((r) => [r.start, r.end]))).sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (b <= a) continue;
    const active = contributing.filter((r) => r.start <= a && r.end >= b);
    let impact: number;
    if (active.some((r) => r.mode === "full")) {
      impact = 1;
    } else {
      const perService = new Map<string, number>();
      for (const r of active) perService.set(r.projectId, Math.max(perService.get(r.projectId) ?? 0, r.weight));
      let sum = 0;
      for (const w of perService.values()) sum += w;
      impact = Math.min(1, sum / totalServices);
    }
    if (impact > 0) total += (b - a) * impact;
  }
  return total;
}

function uptimeFromDowntime(downtimeSeconds: number, windowSeconds: number): number {
  if (windowSeconds <= 0) return 100;
  return Math.max(0, Math.min(100, (1 - downtimeSeconds / windowSeconds) * 100));
}

/**
 * Compute per-service uptime + the platform total for an org over a rolling window.
 * `projectKey` scopes the per-service list (the platform total always spans every
 * service, so it is stable regardless of the filter). Runs inside a caller RLS tx.
 */
export async function computeDowntime(
  tx: TenantTx,
  orgId: string,
  opts: { windowDays?: number; projectKey?: string; now?: Date } = {},
): Promise<DowntimeReport> {
  const windowDays = Math.max(1, Math.min(365, Math.round(opts.windowDays ?? 30)));
  const end = opts.now ?? new Date();
  const start = new Date(end.getTime() - windowDays * 86_400_000);
  const t0 = start.getTime();
  const t1 = end.getTime();
  const windowSeconds = (t1 - t0) / 1000;

  // Guarantee the org's severity ladder exists before any uptime/status computation,
  // independent of how incidents were created (a new org self-seeds the standard ladder
  // here on first read, same as the declare path). No-op once seeded.
  await ensureSeverityLevels(tx, orgId);

  // Every project: the total is the platform denominator; the list drives per-service rows.
  const allProjects = await tx.select({ id: projects.id, key: projects.key, name: projects.name }).from(projects).orderBy(projects.name);
  const totalServices = allProjects.length;
  const listed = opts.projectKey ? allProjects.filter((p) => p.key === opts.projectKey) : allProjects;

  // Incident intervals overlapping the window, joined to affected projects + the severity's
  // service weight and platform mode. A missing level (shouldn't happen post-backfill)
  // defaults to full service weight, no platform impact.
  const rawRows = await tx
    .select({
      projectId: incidentServices.projectId,
      incidentId: incidents.id,
      startedAt: incidents.startedAt,
      resolvedAt: incidents.resolvedAt,
      weight: incidentSeverityLevels.downtimeWeight,
      mode: incidentSeverityLevels.platformMode,
    })
    .from(incidentServices)
    .innerJoin(incidents, eq(incidents.id, incidentServices.incidentId))
    .leftJoin(
      incidentSeverityLevels,
      and(eq(incidentSeverityLevels.organizationId, incidents.organizationId), eq(incidentSeverityLevels.key, incidents.severity)),
    )
    .where(and(lte(incidents.startedAt, end), or(isNull(incidents.resolvedAt), gte(incidents.resolvedAt, start))));

  const perService = new Map<string, { intervals: ServiceInterval[]; incidentIds: Set<string> }>();
  const platformRows: PlatformRow[] = [];
  const distinctIncidents = new Set<string>();
  for (const r of rawRows) {
    const s = Math.max(r.startedAt.getTime(), t0) / 1000;
    const e = Math.min((r.resolvedAt ?? end).getTime(), t1) / 1000;
    if (e <= s) continue;
    const weight = r.weight ?? 1;
    const mode = r.mode ?? "none";
    let bucket = perService.get(r.projectId);
    if (!bucket) perService.set(r.projectId, (bucket = { intervals: [], incidentIds: new Set() }));
    bucket.intervals.push({ start: s, end: e, weight });
    bucket.incidentIds.add(r.incidentId);
    platformRows.push({ projectId: r.projectId, start: s, end: e, weight, mode });
    distinctIncidents.add(r.incidentId);
  }

  const perProject: ProjectUptime[] = listed.map((p) => {
    const bucket = perService.get(p.id);
    const downtime = bucket ? weightedDowntimeSeconds(bucket.intervals) : 0;
    return {
      projectKey: p.key,
      name: p.name,
      uptimePct: uptimeFromDowntime(downtime, windowSeconds),
      weightedDowntimeSeconds: Math.round(downtime),
      incidentCount: bucket ? bucket.incidentIds.size : 0,
    };
  });

  const platformDowntime = platformDowntimeSeconds(platformRows, totalServices);
  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    windowSeconds,
    totalServices,
    perProject,
    totals: {
      uptimePct: uptimeFromDowntime(platformDowntime, windowSeconds),
      weightedDowntimeSeconds: Math.round(platformDowntime),
      incidentCount: distinctIncidents.size,
    },
  };
}
