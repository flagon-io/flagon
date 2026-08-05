import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations, users } from "../db/auth-tables.js";
import { notificationChannels } from "../db/schema.js";
import { createEmailSender } from "../lib/email/sender.js";
import { incidentTemplate } from "../lib/email/templates.js";
import { logger } from "../lib/logger.js";
import { captureError } from "../lib/monitoring.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

/**
 * Page a set of responders about an incident by email. Resolves user ids to
 * addresses (via the auth `users` table, no RLS), builds the incident template,
 * and sends. Fully self-contained and NEVER throws — a paging failure must not
 * fail the declare/escalate that triggered it (swallowed → Sentry via monitoring).
 */
export async function notifyIncident(opts: {
  organizationId: string;
  userIds: string[];
  number: number;
  title: string;
  severity: string;
  status: string;
  kind: "declared" | "escalated" | "update";
}): Promise<void> {
  try {
    const userIds = [...new Set(opts.userIds)].filter(Boolean);
    if (userIds.length === 0) return;
    const [org] = await db
      .select({ name: organizations.name, slug: organizations.slug })
      .from(organizations)
      // Never page on behalf of a soft-deleted org (keeps the invariant local even
      // if a future caller doesn't pre-filter, as declare + the sweep both do).
      .where(and(eq(organizations.id, opts.organizationId), isNull(organizations.deletedAt)))
      .limit(1);
    if (!org) return;
    // A page routes through each responder's notification channels. Email delivers
    // today (the account's primary address + any email-type channel); sms/voice/
    // push/slack are scaffolded — recorded here so the fan-out is ready to wire.
    const rows = await db.select({ email: users.email }).from(users).where(inArray(users.id, userIds));
    const channels = await db.select({ type: notificationChannels.type, value: notificationChannels.value }).from(notificationChannels).where(inArray(notificationChannels.userId, userIds));
    const emailChannels = channels.filter((c) => c.type === "email").map((c) => c.value);
    const scaffolded = channels.filter((c) => c.type !== "email");
    if (scaffolded.length > 0) {
      logger.info("[incidents] scaffolded channels not yet deliverable", {
        number: opts.number,
        pending: scaffolded.map((c) => c.type),
      });
    }
    const recipients = [
      ...new Set([...rows.map((r) => r.email), ...emailChannels].filter((e): e is string => Boolean(e))),
    ];
    if (recipients.length === 0) return;

    const { subject, html } = incidentTemplate({
      organizationName: org.name,
      number: opts.number,
      title: opts.title,
      severity: opts.severity,
      status: opts.status,
      kind: opts.kind,
      incidentUrl: `${APP_URL}/${org.slug}/incidents/${opts.number}`,
    });
    const email = createEmailSender();
    await Promise.all(recipients.map((to) => email.send({ to, subject, html })));
  } catch (err) {
    captureError("[incidents] responder notification failed", err, {
      org: opts.organizationId,
      number: opts.number,
    });
  }
}
