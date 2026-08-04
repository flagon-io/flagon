import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import { incidents } from "../db/schema.js";
import { activeStep } from "../oncall/escalation.js";
import { loadPolicy, resolveLevelTargets } from "./escalate.js";
import { notifyIncident } from "./notify.js";
import { captureError } from "../lib/monitoring.js";

/**
 * Escalation sweep — the time-based half of on-call escalation. For every open,
 * UNACKED incident that has a policy, compute the level that should be active now
 * (cumulative delays since declare); if it advanced past the last-paged level,
 * page the new level's targets and bump `escalated_level`. Acknowledging stops it.
 *
 * Runs on the cron (see routes/internal/cron.route.ts, every ~5 min). Idempotent:
 * the `escalated_level` guard means a level is paged at most once. Per-org isolation
 * (RLS forces the withOrg loop); a failed org is captured and skipped.
 */
export async function sweepEscalations(): Promise<{ orgs: number; paged: number }> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
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
          const active = activeStep(levels, repeatCount, inc.startedAt, inc.acknowledgedAt, now);
          // `escalated_level` is the last GLOBAL step paged (step 0 = declare). Only
          // page when the active step has advanced — so each step, including repeats
          // of the ladder, is paged exactly once until someone acknowledges.
          if (!active || active.step <= inc.escalatedLevel) continue;
          const userIds = await resolveLevelTargets(tx, active.level, now);
          await tx
            .update(incidents)
            .set({ escalatedLevel: active.step, updatedAt: now })
            .where(eq(incidents.id, inc.id));
          out.push({ number: inc.number, title: inc.title, severity: inc.severity, status: inc.status, userIds });
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
