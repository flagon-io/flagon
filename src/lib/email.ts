import { brand } from "./brand";

/**
 * Outbound email with a pluggable provider, chosen by environment:
 *
 * - RESEND_API_KEY set -> Resend (https://resend.com), via its plain HTTP API
 *   (no SDK dependency, easy to swap out later).
 * - Nothing configured -> console provider: the full message is printed to the
 *   server logs instead of being sent. Local dev and minimal self-hosts stay
 *   functional (grab the reset/verification link from the logs), and the log
 *   line makes it obvious delivery is not configured.
 *
 * Adding another provider = implement EmailProvider and add a branch in
 * resolveEmailProvider.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailProvider {
  /** Stable identifier, e.g. "resend" or "console". */
  id: string;
  send(message: EmailMessage): Promise<void>;
}

type Env = Record<string, string | undefined>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    id: "resend",
    async send(message) {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Resend rejected the email (${res.status} ${res.statusText}): ${body}`,
        );
      }
    },
  };
}

export function consoleProvider(): EmailProvider {
  return {
    id: "console",
    async send(message) {
      console.warn(
        "[email] Delivery is NOT configured (set RESEND_API_KEY). Printing the message instead:",
      );
      console.warn(`[email] To:      ${message.to}`);
      console.warn(`[email] Subject: ${message.subject}`);
      console.warn(`[email] ${message.text.split("\n").join("\n[email] ")}`);
    },
  };
}

/** Sender address; override with EMAIL_FROM for self-hosted domains. */
export function resolveFrom(env: Env = process.env): string {
  return env.EMAIL_FROM ?? `${brand.name} <noreply@${brand.domain}>`;
}

export function resolveEmailProvider(env: Env = process.env): EmailProvider {
  if (env.RESEND_API_KEY) {
    return resendProvider(env.RESEND_API_KEY, resolveFrom(env));
  }
  return consoleProvider();
}

/** True when a real provider (not the console fallback) will deliver mail. */
export function isEmailConfigured(env: Env = process.env): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Send through whichever provider the environment selects (resolved lazily). */
export async function sendEmail(message: EmailMessage): Promise<void> {
  await resolveEmailProvider().send(message);
}
