import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations, users } from "../db/auth-tables.js";
import { notificationChannels } from "../db/schema.js";
import { createEmailSender } from "../lib/email/sender.js";
import { incidentTemplate } from "../lib/email/templates.js";
import { logger } from "../lib/logger.js";
import { captureError } from "../lib/monitoring.js";
import { findCapable } from "../integrations/store.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

/**
 * Fan a page out to a set of targets over one channel and log a partial failure.
 * The send callback never throws (providers return a result object), so this is
 * safe inside the fire-and-forget paging path.
 */
async function deliver(
  channel: string,
  number: number,
  targets: string[],
  send: (to: string) => Promise<{ ok: boolean; message?: string }>,
): Promise<void> {
  const results = await Promise.all(targets.map((to) => send(to)));
  const delivered = results.filter((r) => r.ok).length;
  if (delivered < targets.length) {
    logger.info(`[incidents] some ${channel} pages failed`, {
      number,
      delivered,
      attempted: targets.length,
    });
  }
}

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
    // always (the account's primary address + any email-type channel). SMS and
    // voice deliver when the org has connected a BYO provider with that capability
    // (Twilio does both); push stays scaffolded until its provider lands.
    const rows = await db.select({ email: users.email }).from(users).where(inArray(users.id, userIds));
    const channels = await db.select({ type: notificationChannels.type, value: notificationChannels.value }).from(notificationChannels).where(inArray(notificationChannels.userId, userIds));
    const emailChannels = channels.filter((c) => c.type === "email").map((c) => c.value);
    const dedupe = (type: string) =>
      [...new Set(channels.filter((c) => c.type === type).map((c) => c.value).filter(Boolean))];
    const smsChannels = dedupe("sms");
    const voiceChannels = dedupe("voice");

    const incidentUrl = `${APP_URL}/${org.slug}/incidents/${opts.number}`;
    const recipients = [
      ...new Set([...rows.map((r) => r.email), ...emailChannels].filter((e): e is string => Boolean(e))),
    ];

    // SMS via the org's own Twilio (or any sms-capable BYO provider), if connected.
    if (smsChannels.length > 0) {
      const sms = await findCapable(opts.organizationId, "sms");
      if (sms?.provider.sendSms) {
        const text = `Flagon incident #${opts.number} ${opts.kind} (${opts.severity}): ${opts.title}. ${incidentUrl}`;
        await deliver("sms", opts.number, smsChannels, (to) =>
          sms.provider.sendSms!(sms.values, to, text),
        );
      } else {
        logger.info("[incidents] sms channels pending: no SMS provider connected", {
          number: opts.number,
          pending: smsChannels.length,
        });
      }
    }

    // Voice calls that speak the incident, for the same BYO providers.
    if (voiceChannels.length > 0) {
      const voice = await findCapable(opts.organizationId, "voice");
      if (voice?.provider.sendVoice) {
        // Spoken aloud: keep it short and URL-free (a link can't be read out).
        const spoken = `Flagon incident number ${opts.number} ${opts.kind}. Severity ${opts.severity}. ${opts.title}. Check the Flagon console to respond.`;
        await deliver("voice", opts.number, voiceChannels, (to) =>
          voice.provider.sendVoice!(voice.values, to, spoken),
        );
      } else {
        logger.info("[incidents] voice channels pending: no voice provider connected", {
          number: opts.number,
          pending: voiceChannels.length,
        });
      }
    }

    const pushPending = channels.filter((c) => c.type === "push");
    if (pushPending.length > 0) {
      logger.info("[incidents] scaffolded channels not yet deliverable", {
        number: opts.number,
        pending: pushPending.map((c) => c.type),
      });
    }

    // SMS/voice (if any) have already gone out above; email is independent.
    if (recipients.length === 0) return;

    const { subject, html } = incidentTemplate({
      organizationName: org.name,
      number: opts.number,
      title: opts.title,
      severity: opts.severity,
      status: opts.status,
      kind: opts.kind,
      incidentUrl,
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
