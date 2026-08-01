import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { members, organizations, users } from "../db/auth-tables.js";
import { usageCounters } from "../db/schema.js";
import { withOrg } from "../db/tenant.js";
import { orgPlan } from "../lib/org-context.js";
import { planIncludedEvents, planOverage } from "../lib/plans.js";
import { createEmailSender } from "../lib/email/sender.js";
import { usageThresholdTemplate } from "../lib/email/templates.js";
import { currentBillingPeriod } from "./allowance.js";

/**
 * Warn-first usage notifications: email an org's managers the first time it crosses
 * 80% and 100% of its included events in a period, at most once per threshold per
 * period. This is the proactive half of warn-first (the usage page banner is the
 * passive half): the org is warned it is approaching / has reached its allowance
 * well before any hard cap is ever turned on.
 *
 * Meant to be called from the exposures route's DEFERRED work (never the response
 * path). It is fully self-contained (fetches the plan itself) and NEVER throws —
 * a notification failure must not fail metering. Only capped plans (Hobby) warn;
 * bill/contract plans meter or true-up, so there's nothing to warn about crossing.
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

/** The console usage page for an org (absolute, for the email CTA). */
function usageUrl(slug: string): string {
  return `${APP_URL}/${slug}/usage`;
}

/**
 * Claim the given threshold's notification stamp for this period, exactly once.
 * The UPDATE flips notified_*_at from NULL to now() only if the count is at/over the
 * threshold and it hasn't been claimed — so concurrent ingests can't double-send.
 * Returns true if THIS call won the claim (and should therefore send).
 */
async function claimThreshold(
  organizationId: string,
  period: string,
  threshold: number,
  which: 80 | 100,
): Promise<boolean> {
  const claimed = await withOrg(organizationId, (tx) =>
    tx
      .update(usageCounters)
      .set(
        which === 80
          ? { notified80At: sql`now()` }
          : { notified100At: sql`now()` },
      )
      .where(
        and(
          eq(usageCounters.organizationId, organizationId),
          eq(usageCounters.period, period),
          gte(usageCounters.count, threshold),
          isNull(which === 80 ? usageCounters.notified80At : usageCounters.notified100At),
          // Once the org has been told it hit 100%, never fall back to an 80% email
          // (a later ingest would otherwise still find notified_80_at NULL).
          ...(which === 80 ? [isNull(usageCounters.notified100At)] : []),
        ),
      )
      .returning({ count: usageCounters.count }),
  );
  return claimed.length > 0;
}

/** Emails of an org's managers (owner + admins) — who a usage warning goes to. */
async function managerEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(members.organizationId, organizationId),
        inArray(members.role, ["owner", "admin"]),
      ),
    );
  // De-duplicate and drop any empty addresses.
  return [...new Set(rows.map((r) => r.email).filter((e): e is string => Boolean(e)))];
}

export async function notifyUsageThresholds(
  organizationId: string,
): Promise<void> {
  try {
    const plan = await orgPlan(organizationId);
    // Only capped free-tier plans warn about approaching their ceiling.
    if (planOverage(plan) !== "cap") return;
    const included = planIncludedEvents(plan);
    if (included <= 0) return;

    const period = currentBillingPeriod().from.slice(0, 7);

    // Claim the highest crossed, un-notified threshold. Check 100 first: a batch
    // that jumps straight past the cap should send the "reached" email, not "80%".
    let sent: number | null = null;
    if (await claimThreshold(organizationId, period, included, 100)) sent = 100;
    else if (
      await claimThreshold(organizationId, period, Math.floor(included * 0.8), 80)
    )
      sent = 80;
    if (sent === null) return;

    const [org] = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!org) return;

    const recipients = await managerEmails(organizationId);
    if (recipients.length === 0) return;

    // The exact count for the email body (re-read within the org scope).
    const [row] = await withOrg(organizationId, (tx) =>
      tx
        .select({ count: usageCounters.count })
        .from(usageCounters)
        .where(
          and(
            eq(usageCounters.organizationId, organizationId),
            eq(usageCounters.period, period),
          ),
        ),
    );
    const usedEvents = Number(row?.count ?? included);

    const { subject, html } = usageThresholdTemplate({
      organizationName: org.name,
      threshold: sent,
      usedEvents,
      includedEvents: included,
      usageUrl: usageUrl(org.slug),
    });
    const email = createEmailSender();
    await Promise.all(
      recipients.map((to) => email.send({ to, subject, html })),
    );
  } catch (err) {
    // Never let a notification failure fail metering; just log it.
    console.error("[usage] threshold notification failed:", err);
  }
}
