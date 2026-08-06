import type { AlertChannel, DeliveryPayload } from "../db/schema.js";
import { decryptSecret } from "../lib/crypto.js";
import { createEmailSender } from "../lib/email/sender.js";

/**
 * Provider drivers — the code that actually talks to a destination. Each takes the
 * normalized DeliveryPayload and renders it into that provider's shape (Slack Block
 * Kit / a webhook JSON body / an email). Pure delivery: no DB, no retries, no state
 * (the sweep owns all of that). Never throws — every path resolves to a DeliveryOutcome
 * so the sweep can record it.
 */

export type DeliveryOutcome = { ok: boolean; statusCode?: number; error?: string };

const TIMEOUT_MS = 10_000;

/** Severity → a Slack-friendly emoji + color, for a scannable alert. */
const SEV_EMOJI: Record<string, string> = {
  sev1: "🔴",
  sev2: "🟠",
  sev3: "🟡",
  sev4: "🔵",
  info: "🔵",
  down: "🔴",
  up: "🟢",
};

export async function deliver(channel: AlertChannel, payload: DeliveryPayload): Promise<DeliveryOutcome> {
  try {
    switch (channel.type) {
      case "slack_webhook":
        return await deliverSlack(channel, payload);
      case "webhook":
        return await deliverWebhook(channel, payload);
      case "email":
        return await deliverEmail(channel, payload);
      default:
        return { ok: false, error: `unknown channel type: ${channel.type}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function emoji(payload: DeliveryPayload): string {
  return SEV_EMOJI[payload.severity ?? ""] ?? SEV_EMOJI[payload.kind?.split(".")[1] ?? ""] ?? "🔔";
}

async function deliverSlack(channel: AlertChannel, payload: DeliveryPayload): Promise<DeliveryOutcome> {
  const enc = channel.config.url;
  if (!enc) return { ok: false, error: "slack channel has no webhook url" };
  const url = decryptSecret(enc);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `${emoji(payload)} ${payload.title}`.slice(0, 150), emoji: true } },
  ];
  if (payload.body) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: payload.body.slice(0, 3000) } });
  }
  if (payload.fields?.length) {
    blocks.push({
      type: "section",
      fields: payload.fields.slice(0, 10).map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}`.slice(0, 2000) })),
    });
  }
  if (payload.url) {
    blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Flagon" }, url: payload.url }] });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: payload.title, blocks }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, statusCode: res.status, error: (text || `HTTP ${res.status}`).slice(0, 500) };
  return { ok: true, statusCode: res.status };
}

async function deliverWebhook(channel: AlertChannel, payload: DeliveryPayload): Promise<DeliveryOutcome> {
  const enc = channel.config.url;
  if (!enc) return { ok: false, error: "webhook channel has no url" };
  const url = decryptSecret(enc);
  const method = (channel.config.method ?? "POST").toUpperCase();
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(channel.config.headers ?? {}) },
    body: JSON.stringify({ type: payload.kind ?? "notification", ...payload }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, statusCode: res.status, error: (text || `HTTP ${res.status}`).slice(0, 500) };
  return { ok: true, statusCode: res.status };
}

async function deliverEmail(channel: AlertChannel, payload: DeliveryPayload): Promise<DeliveryOutcome> {
  const to = channel.config.addresses ?? [];
  if (to.length === 0) return { ok: false, error: "email channel has no addresses" };
  const fields = (payload.fields ?? []).map((f) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${f.label}</td><td style="padding:2px 0"><b>${f.value}</b></td></tr>`).join("");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px">
    <h2 style="margin:0 0 8px">${escapeHtml(payload.title)}</h2>
    ${payload.body ? `<p style="color:#333">${escapeHtml(payload.body)}</p>` : ""}
    ${fields ? `<table style="border-collapse:collapse;margin:8px 0">${fields}</table>` : ""}
    ${payload.url ? `<p><a href="${payload.url}">Open in Flagon</a></p>` : ""}
  </div>`;
  const email = createEmailSender();
  await Promise.all(to.map((addr) => email.send({ to: addr, subject: payload.title, html })));
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
