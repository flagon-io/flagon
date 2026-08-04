import { eq } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { oncallSchedules, oncallScheduleMembers, oncallOverrides } from "../db/schema.js";
import { resolveOnCall } from "./schedule.js";

/**
 * DB-backed on-call resolution: load a schedule's members + overrides and run the
 * pure `resolveOnCall` engine. Used by the routes (current responder), the
 * escalation cron, and the project overview card. Must be called inside withOrg().
 */
export async function scheduleCurrentOnCall(
  tx: TenantTx,
  scheduleId: string,
  now: Date,
): Promise<string | null> {
  const [sched] = await tx
    .select()
    .from(oncallSchedules)
    .where(eq(oncallSchedules.id, scheduleId))
    .limit(1);
  if (!sched) return null;
  const members = await tx
    .select({ userId: oncallScheduleMembers.userId, position: oncallScheduleMembers.position })
    .from(oncallScheduleMembers)
    .where(eq(oncallScheduleMembers.scheduleId, scheduleId));
  const overrides = await tx
    .select({
      userId: oncallOverrides.userId,
      startsAt: oncallOverrides.startsAt,
      endsAt: oncallOverrides.endsAt,
    })
    .from(oncallOverrides)
    .where(eq(oncallOverrides.scheduleId, scheduleId));
  return resolveOnCall(
    { rotationIntervalHours: sched.rotationIntervalHours, anchorAt: sched.anchorAt },
    members,
    overrides,
    now,
  ).current;
}

/** The current on-call for a team, via its (first) team-bound schedule. */
export async function teamCurrentOnCall(
  tx: TenantTx,
  teamId: string,
  now: Date,
): Promise<string | null> {
  const [sched] = await tx
    .select({ id: oncallSchedules.id })
    .from(oncallSchedules)
    .where(eq(oncallSchedules.teamId, teamId))
    .limit(1);
  if (!sched) return null;
  return scheduleCurrentOnCall(tx, sched.id, now);
}
