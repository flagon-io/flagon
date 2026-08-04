/**
 * On-call rotation resolution — pure and deterministic (like the eval/stats
 * engines), so it runs the same on the request path, in the escalation cron, and
 * in tests. `now` is passed in; nothing here reads the clock or a DB.
 *
 * A schedule is a rotation of ordered members. Who is on-call at an instant:
 *   1. an active OVERRIDE (a one-off cover) wins, else
 *   2. the rotation slot: floor((now - anchor) / interval) mod memberCount.
 * Works identically for a team-bound or a standalone schedule — resolution is
 * purely off the member list.
 */
export type ScheduleInput = { rotationIntervalHours: number; anchorAt: Date };
export type Member = { userId: string; position: number };
export type Override = { userId: string; startsAt: Date; endsAt: Date };

export type OnCallResolution = {
  current: string | null;
  next: string | null;
  source: "override" | "rotation" | "none";
};

export function resolveOnCall(
  schedule: ScheduleInput,
  members: Member[],
  overrides: Override[],
  now: Date,
): OnCallResolution {
  const t = now.getTime();
  // An override active at `now` covers the rotation.
  const active = overrides.find(
    (o) => o.startsAt.getTime() <= t && t < o.endsAt.getTime(),
  );

  const sorted = [...members].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) {
    return { current: active?.userId ?? null, next: null, source: active ? "override" : "none" };
  }

  const interval = Math.max(1, schedule.rotationIntervalHours) * 3_600_000;
  const elapsed = t - schedule.anchorAt.getTime();
  // ((x % n) + n) % n keeps the index in range even before the anchor.
  const idx = ((Math.floor(elapsed / interval) % sorted.length) + sorted.length) % sorted.length;
  const rotationCurrent = sorted[idx].userId;
  const rotationNext = sorted[(idx + 1) % sorted.length].userId;

  if (active) {
    // Override is on now; the rotation's current is who resumes after it.
    return { current: active.userId, next: rotationCurrent, source: "override" };
  }
  return { current: rotationCurrent, next: rotationNext, source: "rotation" };
}
