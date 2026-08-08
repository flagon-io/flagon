import { createHmac } from "node:crypto";
import { z } from "zod";
import { createEmailSender } from "../lib/email/sender.js";
import type { IntegrationCapability } from "../integrations/providers.js";

// Resolving the org's connected integration touches the DB client; import it lazily so
// the registry (email / webhook delivery, config schemas) stays usable without a DB.
async function findCapable(orgId: string, capability: IntegrationCapability) {
  const { findCapable: resolve } = await import("../integrations/store.js");
  return resolve(orgId, capability);
}

/**
 * The alert-channel delivery registry — the send-side counterpart to the monitor
 * registry. Each channel TYPE knows how to validate its own config, describe its
 * destination, and DELIVER an alert. Adding a type (Slack, PagerDuty, …) is one
 * object here; the route validates against `configSchema`, gates on
 * `gatesCapability`, and the notify path fans out through `deliver()`.
 *
 * Two families of backing:
 *   - built-in    (`gatesCapability: null`) — email (native sender), webhook (fetch)
 *   - integration (`gatesCapability: "sms"|"voice"`) — routed through the org's
 *     connected BYO Integration (Twilio today), resolved at delivery time via
 *     `findCapable`. The channel stores only the destination (a phone number); the
 *     credentials never live on the channel.
 *
 * Every `deliver()` is best-effort and NEVER throws — a delivery failure returns
 * `{ ok: false, message }` so one broken channel can't fail a run or the others.
 */

export type AlertKind = "alert" | "reminder" | "recovery";

/** Everything a channel needs to render + deliver one alert, built once per fire. */
export type AlertContent = {
  kind: AlertKind;
  checkKey: string;
  checkName: string;
  orgSlug: string;
  status: string; // "failing" | "degraded" | "passing"
  latencyMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
  link: string;
  subject: string;
  text: string; // plain-text (sms / webhook fallback)
  html: string; // email body
};

export type DeliverResult = { ok: boolean; message?: string };

export type AlertChannelType = {
  key: string;
  label: string;
  description: string;
  /** Integrations capability delivery needs; null = built-in (email / webhook). */
  gatesCapability: IntegrationCapability | null;
  /** Validates + normalizes the channel's config on create / update. */
  configSchema: z.ZodType<Record<string, unknown>>;
  /** A short, human-readable destination for lists (address / phone / url). */
  destination(config: Record<string, unknown>): string;
  /** Deliver content for an org. Never throws. */
  deliver(
    orgId: string,
    config: Record<string, unknown>,
    content: AlertContent,
  ): Promise<DeliverResult>;
};

function str(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

const email: AlertChannelType = {
  key: "email",
  label: "Email",
  description: "Email a destination whenever a subscribed check fails, degrades, or recovers.",
  gatesCapability: null,
  configSchema: z.object({ address: z.string().email() }),
  destination: (config) => str(config, "address"),
  async deliver(_orgId, config, content) {
    const address = str(config, "address");
    if (!address.includes("@")) return { ok: false, message: "This channel has no email address." };
    try {
      await createEmailSender().send({ to: address, subject: content.subject, html: content.html });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "The email could not be sent." };
    }
  },
};

const sms: AlertChannelType = {
  key: "sms",
  label: "SMS",
  description: "Text a phone number on failure and recovery, through your connected Twilio.",
  gatesCapability: "sms",
  configSchema: z.object({ phone: z.string().trim().min(3).max(32) }),
  destination: (config) => str(config, "phone"),
  async deliver(orgId, config, content) {
    const to = str(config, "phone");
    if (!to) return { ok: false, message: "This channel has no phone number." };
    const capable = await findCapable(orgId, "sms");
    if (!capable?.provider.sendSms) return { ok: false, message: "No SMS integration is connected." };
    return capable.provider.sendSms(capable.values, to, content.text);
  },
};

const phone: AlertChannelType = {
  key: "phone",
  label: "Phone call",
  description: "Place a phone call on failure, through your connected Twilio.",
  gatesCapability: "voice",
  configSchema: z.object({ phone: z.string().trim().min(3).max(32) }),
  destination: (config) => str(config, "phone"),
  async deliver(orgId, config, content) {
    const to = str(config, "phone");
    if (!to) return { ok: false, message: "This channel has no phone number." };
    const capable = await findCapable(orgId, "voice");
    if (!capable?.provider.sendVoice) return { ok: false, message: "No voice integration is connected." };
    const spoken =
      content.kind === "recovery"
        ? `Flagon alert. The check ${content.checkName} has recovered and is passing again.`
        : `Flagon alert. The check ${content.checkName} is failing. Please check your dashboard.`;
    return capable.provider.sendVoice(capable.values, to, spoken);
  },
};

const webhook: AlertChannelType = {
  key: "webhook",
  label: "Webhook",
  description: "POST a JSON payload to any endpoint, optionally signed with a shared secret.",
  gatesCapability: null,
  configSchema: z.object({
    url: z
      .string()
      .url()
      .refine((u) => /^https?:\/\//i.test(u), "The webhook URL must start with http:// or https://."),
    secret: z.string().max(200).optional(),
  }),
  destination: (config) => str(config, "url"),
  async deliver(_orgId, config, content) {
    const url = str(config, "url");
    if (!/^https?:\/\//i.test(url)) return { ok: false, message: "This channel has no webhook URL." };
    const payload = JSON.stringify({
      check: content.checkName,
      checkKey: content.checkKey,
      alertType: content.kind,
      status: content.status,
      responseTime: content.latencyMs,
      httpStatus: content.httpStatus,
      error: content.errorMessage,
      link: content.link,
      org: content.orgSlug,
    });
    const headers: Record<string, string> = { "content-type": "application/json" };
    const secret = str(config, "secret");
    if (secret) headers["x-flagon-signature"] = createHmac("sha256", secret).update(payload).digest("hex");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? { ok: true } : { ok: false, message: `The endpoint returned ${res.status}.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "The webhook could not be delivered." };
    }
  },
};

const TYPES: AlertChannelType[] = [email, sms, phone, webhook];
const BY_KEY = new Map(TYPES.map((t) => [t.key, t]));

/** Every registered channel type, in display order. */
export function listChannelTypes(): AlertChannelType[] {
  return TYPES;
}

/** Look up a channel type by key, or undefined if unknown. */
export function getChannelType(key: string): AlertChannelType | undefined {
  return BY_KEY.get(key);
}

/** A short destination label for a stored channel (address / phone / url). */
export function channelDestination(type: string, config: Record<string, unknown>): string {
  return getChannelType(type)?.destination(config) ?? "";
}
