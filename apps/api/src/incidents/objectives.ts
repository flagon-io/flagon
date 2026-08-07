import { and, eq } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { reliabilityObjectives, projects, type ReliabilityObjective } from "../db/schema.js";
import { computeDowntime } from "./downtime.js";

/**
 * Reliability objectives (optional SLO/SLA) and their attainment. An objective is an
 * org-defined target: a percentage over a rolling window, scoped org-wide or to one
 * project. Attainment measures the actual weighted uptime over that window/scope and
 * turns the gap into an error budget (the slice of the window an org is allowed to be
 * down, and how much of it has been spent).
 */

export type ObjectiveAttainment = {
  key: string;
  name: string;
  label: string;
  scopeType: string;
  scopeProjectKey: string | null;
  targetPct: number;
  windowDays: number;
  measuredUptimePct: number;
  attained: boolean;
  errorBudgetPct: number; // total allowed downtime share (100 - target)
  errorBudgetConsumedPct: number; // 100 - measured (>= 0)
  errorBudgetRemainingPct: number; // budget - consumed (may go negative when blown)
  errorBudgetBurnedRatio: number; // consumed / budget (0..1+, 0 when budget is 0)
};

/** Compute attainment + error budget for one objective over its own window and scope. */
export async function attainmentFor(
  tx: TenantTx,
  orgId: string,
  obj: ReliabilityObjective,
  now?: Date,
): Promise<ObjectiveAttainment> {
  let scopeProjectKey: string | null = null;
  if (obj.scopeType === "project" && obj.scopeProjectId) {
    const p = await tx
      .select({ key: projects.key })
      .from(projects)
      .where(eq(projects.id, obj.scopeProjectId))
      .limit(1)
      .then((r) => r[0]);
    scopeProjectKey = p?.key ?? null;
  }
  const report = await computeDowntime(tx, orgId, {
    windowDays: obj.windowDays,
    projectKey: scopeProjectKey ?? undefined,
    now,
  });
  // Project scope: that project's uptime; org scope: the org headline (mean of projects).
  const measured =
    obj.scopeType === "project" ? (report.perProject[0]?.uptimePct ?? 100) : report.totals.uptimePct;
  const target = obj.targetPct;
  const budget = Math.max(0, 100 - target);
  const consumed = Math.max(0, 100 - measured);
  return {
    key: obj.key,
    name: obj.name,
    label: obj.label,
    scopeType: obj.scopeType,
    scopeProjectKey,
    targetPct: target,
    windowDays: obj.windowDays,
    measuredUptimePct: measured,
    attained: measured >= target,
    errorBudgetPct: budget,
    errorBudgetConsumedPct: consumed,
    errorBudgetRemainingPct: budget - consumed,
    errorBudgetBurnedRatio: budget > 0 ? consumed / budget : consumed > 0 ? 1 : 0,
  };
}

/** Attainment for every ENABLED objective in an org (empty when the org defined none). */
export async function attainmentForObjectives(
  tx: TenantTx,
  orgId: string,
  now?: Date,
): Promise<ObjectiveAttainment[]> {
  const objs = await tx
    .select()
    .from(reliabilityObjectives)
    .where(and(eq(reliabilityObjectives.organizationId, orgId), eq(reliabilityObjectives.enabled, true)));
  const out: ObjectiveAttainment[] = [];
  for (const o of objs) out.push(await attainmentFor(tx, orgId, o, now));
  return out;
}
