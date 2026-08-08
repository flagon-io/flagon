import type { Check, CheckResult } from "../db/schema.js";
import { captureError } from "../lib/monitoring.js";
import type { AlertFire } from "./state.js";
import { channelsByIds } from "./channels.js";
import {
  getChannelType,
  type AlertContent,
  type AlertKind,
  type DeliverResult,
} from "./channel-types.js";

/**
 * Check alert delivery. A transition from the state machine (checks/state.ts) that
 * FIRES becomes a notification here. Alerts fan out to the check's subscribed ALERT
 * CHANNELS (Checkly's reusable channels — email / SMS / phone / webhook, each backed by
 * an Integration where needed), plus the check's own legacy `alertEmails` as implicit
 * email recipients. Each channel is gated by its send-on-failure / degraded / recovery
 * flags. Every delivery is best-effort and NEVER throws — a delivery failure must not
 * fail the run; it is captured and the other channels still fire.
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

function subjectFor(kind: AlertKind, check: Check): string {
  switch (kind) {
    case "alert":
      return `[Flagon] ${check.name} is failing`;
    case "reminder":
      return `[Flagon] Reminder: ${check.name} is still failing`;
    case "recovery":
      return `[Flagon] Recovered: ${check.name} is passing again`;
  }
}

/** Build the render-once content every subscribed channel delivers. */
export function buildAlertContent(
  orgSlug: string,
  check: Check,
  kind: AlertKind,
  result: CheckResult | null,
): AlertContent {
  const link = `${APP_URL}/${orgSlug}/checks/${check.key}`;
  const status = result?.status ?? (kind === "recovery" ? "passing" : "failing");
  const lead =
    kind === "recovery"
      ? `Your check <strong>${check.name}</strong> has recovered and is passing again.`
      : kind === "reminder"
        ? `Your check <strong>${check.name}</strong> is still failing.`
        : `Your check <strong>${check.name}</strong> has started failing.`;

  const detail: string[] = [];
  if (result) {
    if (result.latencyMs != null) detail.push(`Response time: ${result.latencyMs} ms`);
    if (result.httpStatus != null) detail.push(`HTTP status: ${result.httpStatus}`);
    if (result.errorMessage) detail.push(`Error: ${result.errorMessage}`);
  }
  const html = [
    `<p>${lead}</p>`,
    detail.length ? `<p>${detail.join("<br>")}</p>` : "",
    `<p><a href="${link}">View the check in Flagon</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  const textLead =
    kind === "recovery"
      ? `${check.name} has recovered.`
      : kind === "reminder"
        ? `${check.name} is still failing.`
        : `${check.name} is failing.`;
  const text = [
    `[Flagon] ${textLead}`,
    result?.latencyMs != null ? `${result.latencyMs}ms` : "",
    result?.errorMessage ? result.errorMessage : "",
    link,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    kind,
    checkKey: check.key,
    checkName: check.name,
    orgSlug,
    status,
    latencyMs: result?.latencyMs ?? null,
    httpStatus: result?.httpStatus ?? null,
    errorMessage: result?.errorMessage ?? null,
    link,
    subject: subjectFor(kind, check),
    text,
    html,
  };
}

/** Content for a "send a test" from a channel's config page — a self-describing sample. */
export function buildTestContent(orgSlug: string, channelName: string): AlertContent {
  const link = `${APP_URL}/${orgSlug}/checks`;
  return {
    kind: "alert",
    checkKey: "test",
    checkName: "Test alert",
    orgSlug,
    status: "failing",
    latencyMs: null,
    httpStatus: null,
    errorMessage: null,
    link,
    subject: `[Flagon] Test alert from "${channelName}"`,
    text: `[Flagon] Test alert from "${channelName}". If you got this, the channel works. ${link}`,
    html: `<p>This is a test notification from your Flagon alert channel <strong>${channelName}</strong>. If you received this, the channel is working.</p><p><a href="${link}">Open Checks</a></p>`,
  };
}

/** Whether a channel's event flags want this transition. */
function channelWants(
  channel: { sendOnFailure: boolean; sendOnDegraded: boolean; sendOnRecovery: boolean },
  kind: AlertKind,
  status: string,
): boolean {
  if (kind === "recovery") return channel.sendOnRecovery;
  if (status === "degraded") return channel.sendOnDegraded;
  return channel.sendOnFailure;
}

/** Deliver through one channel type, capturing (never throwing) any failure. */
async function deliverSafe(
  type: string,
  config: Record<string, unknown>,
  orgId: string,
  content: AlertContent,
): Promise<DeliverResult> {
  const channelType = getChannelType(type);
  if (!channelType) return { ok: false, message: `Unknown channel type "${type}".` };
  try {
    const res = await channelType.deliver(orgId, config, content);
    if (!res.ok) {
      captureError(`[checks] alert delivery failed via ${type} for ${content.checkKey}`, res.message, {
        check: content.checkKey,
        org: content.orgSlug,
        type,
      });
    }
    return res;
  } catch (err) {
    captureError(`[checks] alert delivery threw via ${type} for ${content.checkKey}`, err, {
      check: content.checkKey,
      org: content.orgSlug,
      type,
    });
    return { ok: false, message: err instanceof Error ? err.message : "delivery failed" };
  }
}

/**
 * Deliver a check alert to every subscribed channel plus the check's legacy raw emails.
 * Best-effort per channel; failures are captured, never thrown.
 */
export async function sendCheckAlert(
  orgId: string,
  orgSlug: string,
  check: Check,
  kind: AlertKind,
  result: CheckResult | null,
): Promise<void> {
  const content = buildAlertContent(orgSlug, check, kind, result);
  const jobs: Promise<DeliverResult>[] = [];

  // Legacy raw emails on the check (kept for back-compat) deliver as implicit email.
  for (const to of new Set((check.alertEmails ?? []).filter(Boolean))) {
    jobs.push(deliverSafe("email", { address: to }, orgId, content));
  }

  // The check's selected alert CHANNELS (the Checkly model). Loading never throws —
  // a DB hiccup just falls back to the raw emails above.
  try {
    for (const channel of await channelsByIds(orgId, check.alertChannelIds ?? [])) {
      if (!channelWants(channel, kind, content.status)) continue;
      jobs.push(deliverSafe(channel.type, channel.config as Record<string, unknown>, orgId, content));
    }
  } catch (err) {
    captureError(`[checks] loading alert channels failed for ${check.key}`, err, {
      check: check.key,
      org: orgId,
    });
  }

  await Promise.all(jobs);
}
