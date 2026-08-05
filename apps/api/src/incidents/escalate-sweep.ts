import { and, isNotNull, isNull, lt, ne, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import { incidents } from "../db/schema.js";
import { stepsToPage } from "../oncall/escalation.js";
import { loadPolicy, resolveLevelTargets, teamResponders } from "./escalate.js";
import { notifyIncident } from "./notify.js";
import { captureError } from "../lib/monitoring.js";

/**
 * Escalation sweep — the time-based half of on-call escalation. For every open,
 * UNACKED incident that has a policy, work out which ladder steps have come due
 * since the last-paged one (`escalated_level`) and page each of them exactly once,
 * then advance `escalated_level`. Acknowledging stops it.
 *
 * Runs on the cron (see routes/internal/cron.route.ts, every ~5 min).
 * - Pages EVERY newly-due step, not just the frontier, so a coarse/backlogged cron
 *   or short delays never skip an intermediate on-call (stepsToPage).
 * - The advance is a single CONDITIONAL update (`escalated_level < top` AND still
 *   unacked AND unresolved). Only the sweep that wins that update pages, so two
 *   overlapping sweeps can't double-page, and an ack/resolve landing mid-sweep
 *   cancels the page instead of firing a stale one.
 * - A step that resolves to NOBODY (empty schedule, deleted schedule/team target)
 *   falls back to the incident's owner team and is captured, so an escalation is
 *   never silently swallowed.
 * Per-org isolation (RLS forces the withOrg loop); a failed org is captured/skipped.
 */
export async function sweepEscalations(): Promise<{ orgs: number; paged: number }> {
  // Never page/email on behalf of a soft-deleted org (mirrors the usage report-sweep).
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
  const now = new Date();
  let paged = 0;

  for (const org of orgs) {
    try {
      const pages = await withOrg(org.id, async (tx) => {
        const open = await tx
          .select()
          .from(incidents)
          .where(
            and(
              ne(incidents.status, "resolved"),
              isNull(incidents.acknowledgedAt),
              isNotNull(incidents.escalationPolicyId),
            ),
          );
        const out: {
          number: number;
          title: string;
          severity: string;
          status: string;
          userIds: string[];
        }[] = [];
        for (const inc of open) {
          if (!inc.escalationPolicyId) continue;
          const { levels, repeatCount } = await loadPolicy(tx, inc.escalationPolicyId);
          const pending = stepsToPage(levels, repeatCount, inc.startedAt, inc.acknowledgedAt, now, inc.escalatedLevel);
          if (pending.length === 0) continue;
          const top = pending[pending.length - 1].step;
          // Atomic, idempotent claim of this advance: a concurrent sweep, or an ack/
          // resolve that committed since we read `open`, makes this match no row.
          const [claimed] = await tx
            .update(incidents)
            .set({ escalatedLevel: top, updatedAt: now })
            .where(
              and(
                eq(incidents.id, inc.id),
                lt(incidents.escalatedLevel, top),
                isNull(incidents.acknowledgedAt),
                ne(incidents.status, "resolved"),
              ),
            )
            .returning({ id: incidents.id });
          if (!claimed) continue;
          for (const p of pending) {
            let userIds = await resolveLevelTargets(tx, p.level, now);
            if (userIds.length === 0) {
              // The level pointed at nobody (empty/deleted schedule or team). Fall
              // back to the incident's owner team so a live incident still pages,
              // and surface the misconfiguration.
              userIds = await teamResponders(tx, inc.ownerTeamId, now);
              captureError(
                "[incidents] escalation level resolved to nobody; fell back to owner team",
                new Error("empty escalation target"),
                { org: org.id, number: inc.number, step: p.step, targetType: p.level.targetType, targetId: p.level.targetId },
              );
            }
            out.push({ number: inc.number, title: inc.title, severity: inc.severity, status: inc.status, userIds });
          }
        }
        return out;
      });
      for (const p of pages) {
        await notifyIncident({ organizationId: org.id, userIds: p.userIds, number: p.number, title: p.title, severity: p.severity, status: p.status, kind: "escalated" });
        paged += 1;
      }
    } catch (err) {
      captureError("[incidents] escalation sweep failed", err, { org: org.id });
    }
  }
  return { orgs: orgs.length, paged };
}
