import { eq } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { oncallEscalationLevels, oncallEscalationPolicies, teamMembers } from "../db/schema.js";
import { scheduleCurrentOnCall, teamCurrentOnCall } from "../oncall/resolve.js";
import type { EscalationLevel } from "../oncall/escalation.js";

/** Load a policy's ordered levels + repeat count (what the escalation engine wants). */
export async function loadPolicy(
  tx: TenantTx,
  policyId: string,
): Promise<{ levels: EscalationLevel[]; repeatCount: number }> {
  const [policy] = await tx
    .select({ repeatCount: oncallEscalationPolicies.repeatCount })
    .from(oncallEscalationPolicies)
    .where(eq(oncallEscalationPolicies.id, policyId))
    .limit(1);
  const rows = await tx
    .select({
      position: oncallEscalationLevels.position,
      targetType: oncallEscalationLevels.targetType,
      targetId: oncallEscalationLevels.targetId,
      delayMinutes: oncallEscalationLevels.delayMinutes,
    })
    .from(oncallEscalationLevels)
    .where(eq(oncallEscalationLevels.policyId, policyId))
    .orderBy(oncallEscalationLevels.position);
  return {
    repeatCount: policy?.repeatCount ?? 0,
    levels: rows.map((r) => ({
      position: r.position,
      targetType: r.targetType as EscalationLevel["targetType"],
      targetId: r.targetId,
      delayMinutes: r.delayMinutes,
    })),
  };
}

/**
 * Resolve a level's target to concrete user ids (the DB-backed sibling of the
 * pure `resolveTargets`, since a schedule target needs an async on-call lookup).
 */
export async function resolveLevelTargets(
  tx: TenantTx,
  level: EscalationLevel,
  now: Date,
): Promise<string[]> {
  if (level.targetType === "user") return [level.targetId];
  if (level.targetType === "schedule") {
    const u = await scheduleCurrentOnCall(tx, level.targetId, now);
    return u ? [u] : [];
  }
  const rows = await tx
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, level.targetId));
  return rows.map((r) => r.userId);
}

/**
 * The responders for a team: its on-call (via the team's schedule) when there is
 * one, else the whole team. Shared by the declare path (first page) and the
 * escalation sweep's fallback when a level resolves to nobody, so a real incident
 * is never silently un-paged.
 */
export async function teamResponders(
  tx: TenantTx,
  teamId: string | null,
  now: Date,
): Promise<string[]> {
  if (!teamId) return [];
  const onCall = await teamCurrentOnCall(tx, teamId, now);
  if (onCall) return [onCall];
  const rows = await tx
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  return rows.map((r) => r.userId);
}
