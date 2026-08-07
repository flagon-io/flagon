import {
  placeCall as twilioPlaceCall,
  sendSms as twilioSendSms,
  verifyCredentials,
} from "./twilio.js";

/**
 * The bring-your-own-provider registry.
 *
 * Each entry declares a provider the customer configures with THEIR OWN
 * credentials, which Flagon then uses on their behalf. A provider is entirely
 * data + two small functions (normalize, test), so adding one (SendGrid, a
 * Datadog sink, …) is a single object here plus, if it delivers something, a
 * client module like twilio.ts. The API route, the console, and the docs all
 * read from this one list — there is no second place to update.
 *
 * NOT modelled here: Flagon-built "app" integrations (Slack / Discord OAuth
 * installs, where we own the credentials) and the general outbound-webhook
 * surface. Both are separate systems; this registry is only BYO credentials.
 */

export type IntegrationFieldType = "text" | "tel";

/** One field the customer fills in when configuring a provider. */
export type IntegrationField = {
  key: string;
  label: string;
  type: IntegrationFieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  /**
   * Secret fields are encrypted at rest and never returned (only a masked last-4
   * hint); non-secret fields live in `config` and come back verbatim for display.
   */
  secret: boolean;
};

/** What a configured provider can do — lets a caller find "who can send an SMS". */
export type IntegrationCapability = "sms" | "voice";

/**
 * A behavior toggle the org controls SEPARATELY from credentials: it decides HOW
 * Flagon uses the integration, not whether the account is valid. An option can
 * gate a capability (`gatesCapability`), so turning it off stops Flagon using
 * that capability even though the credentials still work. Non-secret; stored under
 * `config.options`.
 */
export type IntegrationOption = {
  key: string;
  label: string;
  help?: string;
  default: boolean;
  gatesCapability?: IntegrationCapability;
};

/** Split, validated values ready to persist. */
export type NormalizedConfig = {
  config: Record<string, string>;
  secrets: Record<string, string>;
};

export type ProviderTestResult = { ok: boolean; message?: string };

export type IntegrationProvider = {
  key: string;
  label: string;
  /** The console grouping ("Notifications", "Observability", …). */
  category: string;
  summary: string;
  /** Docs deep-link under /docs, if any. */
  docsPath?: string;
  capabilities: IntegrationCapability[];
  fields: IntegrationField[];
  /** Behavior toggles the org sets independently of credentials (see below). */
  options: IntegrationOption[];
  /**
   * Validate raw submitted values and split them into non-secret `config` and
   * `secrets`. Throws an Error (message shown to the user) on invalid input.
   */
  normalize(input: Record<string, unknown>): NormalizedConfig;
  /** Live credential check against the third party. Never throws. */
  test(values: NormalizedConfig): Promise<ProviderTestResult>;
  /**
   * Deliver an SMS through the customer's account. Present only on providers that
   * declare the "sms" capability; delivery paths gate on its presence. Never throws.
   */
  sendSms?(
    values: NormalizedConfig,
    to: string,
    body: string,
  ): Promise<{ ok: boolean; message?: string }>;
  /**
   * Place a voice call that speaks `spoken` and hangs up. Present only on
   * providers that declare the "voice" capability. Never throws.
   */
  sendVoice?(
    values: NormalizedConfig,
    to: string,
    spoken: string,
  ): Promise<{ ok: boolean; message?: string }>;
};

/** Generic required-field validation shared by every provider. */
function collect(
  fields: IntegrationField[],
  input: Record<string, unknown>,
): NormalizedConfig {
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of fields) {
    const raw = input[f.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (f.required) throw new Error(`${f.label} is required.`);
      continue;
    }
    (f.secret ? secrets : config)[f.key] = value;
  }
  return { config, secrets };
}

const twilio: IntegrationProvider = {
  key: "twilio",
  label: "Twilio",
  category: "Notifications",
  summary:
    "Send SMS and voice pages through your own Twilio account. Lights up SMS delivery for incident on-call.",
  docsPath: "/docs/platform/integrations",
  capabilities: ["sms", "voice"],
  options: [
    {
      key: "sms",
      label: "SMS pages",
      help: "Text responders their incident pages.",
      default: true,
      gatesCapability: "sms",
    },
    {
      key: "voice",
      label: "Voice calls",
      help: "Call responders and read the incident aloud. Needs a phone number as the sender, not a Messaging Service SID.",
      default: false,
      gatesCapability: "voice",
    },
  ],
  fields: [
    {
      key: "accountSid",
      label: "Account SID",
      type: "text",
      required: true,
      placeholder: "AC…",
      help: "From your Twilio console dashboard.",
      secret: false,
    },
    {
      key: "authToken",
      label: "Auth token",
      type: "text",
      required: true,
      placeholder: "Your Twilio auth token",
      help: "Encrypted at rest and never shown again.",
      secret: true,
    },
    {
      key: "from",
      label: "From number or Messaging Service SID",
      type: "tel",
      required: true,
      placeholder: "+15551234567 or MG…",
      help: "The sender pages come from. SMS can use an E.164 number or a Messaging Service SID; voice calls need a phone number.",
      secret: false,
    },
  ],
  normalize(input) {
    const out = collect(this.fields, input);
    const sid = out.config.accountSid ?? "";
    if (!sid.startsWith("AC")) {
      throw new Error("Account SID should start with \"AC\".");
    }
    return out;
  },
  async test({ config, secrets }) {
    return verifyCredentials({
      accountSid: config.accountSid ?? "",
      authToken: secrets.authToken ?? "",
    });
  },
  async sendSms({ config, secrets }, to, body) {
    return twilioSendSms(
      {
        accountSid: config.accountSid ?? "",
        authToken: secrets.authToken ?? "",
        from: config.from ?? "",
      },
      to,
      body,
    );
  },
  async sendVoice({ config, secrets }, to, spoken) {
    return twilioPlaceCall(
      {
        accountSid: config.accountSid ?? "",
        authToken: secrets.authToken ?? "",
        from: config.from ?? "",
      },
      to,
      spoken,
    );
  },
};

const PROVIDERS: IntegrationProvider[] = [twilio];

const BY_KEY = new Map(PROVIDERS.map((p) => [p.key, p]));

/** Every registered BYO provider, in display order. */
export function listProviders(): IntegrationProvider[] {
  return PROVIDERS;
}

/** Look up a provider by key, or undefined if unknown. */
export function getProvider(key: string): IntegrationProvider | undefined {
  return BY_KEY.get(key);
}

/** The default option values for a provider, as stored on first connect. */
export function defaultOptions(provider: IntegrationProvider): Record<string, boolean> {
  return Object.fromEntries(provider.options.map((o) => [o.key, o.default]));
}

function storedOptions(config: Record<string, unknown> | undefined): Record<string, boolean> {
  const raw = (config?.options ?? {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "boolean") out[k] = v;
  return out;
}

/** Effective boolean for one option, falling back to its default. */
export function optionEnabled(
  provider: IntegrationProvider,
  config: Record<string, unknown> | undefined,
  key: string,
): boolean {
  const opt = provider.options.find((o) => o.key === key);
  if (!opt) return false;
  const stored = storedOptions(config)[key];
  return typeof stored === "boolean" ? stored : opt.default;
}

/**
 * Whether a capability is currently ENABLED for this integration — the provider
 * supports it AND the org hasn't turned off the option that gates it. Delivery
 * paths use this so an org's on/off choice is honored, not just the credentials.
 */
export function capabilityEnabled(
  provider: IntegrationProvider,
  config: Record<string, unknown> | undefined,
  capability: IntegrationCapability,
): boolean {
  if (!provider.capabilities.includes(capability)) return false;
  const gate = provider.options.find((o) => o.gatesCapability === capability);
  if (!gate) return true;
  return optionEnabled(provider, config, gate.key);
}

/** Merge a partial set of option values onto existing config, ignoring unknown keys. */
export function mergeOptions(
  provider: IntegrationProvider,
  config: Record<string, unknown> | undefined,
  updates: Record<string, boolean>,
): Record<string, boolean> {
  const known = new Set(provider.options.map((o) => o.key));
  const next = { ...defaultOptions(provider), ...storedOptions(config) };
  for (const [k, v] of Object.entries(updates)) {
    if (known.has(k) && typeof v === "boolean") next[k] = v;
  }
  return next;
}
