/**
 * Escalation resolution — pure. Given an incident's declared time, ack state, a
 * policy's ordered levels, and how many times the policy REPEATS, decides which
 * step of the (possibly repeated) ladder should be paged right now, and resolves a
 * level's target to concrete user ids. `now` is passed in.
 *
 * A policy pages level 0 immediately, then climbs each level after its
 * `delayMinutes`. When the last level is reached it can REPEAT the whole ladder up
 * to `repeatCount` more times (relentless paging until someone acknowledges) — the
 * PagerDuty/FireHydrant model. `step` is the global index across the repeated
 * sequence, so callers can page each step exactly once. Ack returns null.
 */
export type EscalationLevel = {
  position: number;
  targetType: "schedule" | "team" | "user";
  targetId: string;
  delayMinutes: number;
};

export type ActiveStep = { step: number; level: EscalationLevel };

/** The repeated ladder: `levels` concatenated `repeatCount + 1` times. */
function sequence(levels: EscalationLevel[], repeatCount: number): EscalationLevel[] {
  const sorted = [...levels].sort((a, b) => a.position - b.position);
  const cycles = Math.max(0, repeatCount) + 1;
  const seq: EscalationLevel[] = [];
  for (let c = 0; c < cycles; c++) seq.push(...sorted);
  return seq;
}

export function activeStep(
  levels: EscalationLevel[],
  repeatCount: number,
  declaredAt: Date,
  acknowledgedAt: Date | null,
  now: Date,
): ActiveStep | null {
  if (acknowledgedAt) return null;
  if (levels.length === 0) return null;
  const seq = sequence(levels, repeatCount);
  const elapsedMin = (now.getTime() - declaredAt.getTime()) / 60_000;

  let cumulative = 0;
  let step = 0;
  for (let i = 0; i < seq.length; i++) {
    cumulative += seq[i].delayMinutes;
    if (elapsedMin >= cumulative && i + 1 < seq.length) step = i + 1;
    else break;
  }
  return { step, level: seq[step] };
}

/**
 * Every step in `(afterStep, activeStep]` that should be paged *now*, in order.
 * The cron records the last GLOBAL step it paged; when several delay thresholds
 * elapse between two sweeps (short delays, a coarse/backlogged cron), the frontier
 * `activeStep` alone would skip the intermediate levels and page only the top one
 * — so the primary on-call never hears about it. This returns each skipped step so
 * the caller pages them all exactly once. Empty when acknowledged or already caught
 * up. `afterStep` is the incident's `escalated_level`; step 0 is paged at declare.
 */
export function stepsToPage(
  levels: EscalationLevel[],
  repeatCount: number,
  declaredAt: Date,
  acknowledgedAt: Date | null,
  now: Date,
  afterStep: number,
): ActiveStep[] {
  const active = activeStep(levels, repeatCount, declaredAt, acknowledgedAt, now);
  if (!active) return [];
  const seq = sequence(levels, repeatCount);
  const out: ActiveStep[] = [];
  for (let s = Math.max(afterStep + 1, 0); s <= active.step; s++) {
    out.push({ step: s, level: seq[s] });
  }
  return out;
}

/**
 * Resolve a level's target to concrete user ids. The caller supplies the lookups
 * (a schedule's current on-call, a team's members) so this stays pure.
 */
export type TargetContext = {
  scheduleOnCall: (scheduleId: string) => string | null;
  teamMembers: (teamId: string) => string[];
};

export function resolveTargets(level: EscalationLevel, ctx: TargetContext): string[] {
  switch (level.targetType) {
    case "schedule": {
      const u = ctx.scheduleOnCall(level.targetId);
      return u ? [u] : [];
    }
    case "team":
      return ctx.teamMembers(level.targetId);
    case "user":
      return [level.targetId];
    default:
      return [];
  }
}
