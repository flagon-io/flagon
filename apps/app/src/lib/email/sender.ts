import "server-only";

/**
 * Email delivery, behind an adapter.
 *
 * Everything that sends mail (verification, password reset, org invites) talks
 * to this interface, never to a provider SDK directly, so swapping Resend for
 * something else later is one file. `createEmailSender()` picks the
 * implementation from the environment: Resend when `RESEND_API_KEY` is set,
 * otherwise a console logger so local dev needs no account and the reset /
 * verification links just print to the terminal.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Derived from `html` when omitted. */
  text?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const DEFAULT_FROM = "Flagon <robin@flagon.io>";

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

class ResendSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    // Imported lazily so the Resend SDK is only loaded when it is actually
    // used, keeping it out of code paths (and bundles) that never send mail.
    const { Resend } = await import("resend");
    const resend = new Resend(this.apiKey);
    const { error } = await resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? htmlToText(message.html),
    });
    if (error) {
      throw new Error(`Resend failed to send email: ${error.message}`);
    }
  }
}

class ConsoleSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    // Dev fallback: print enough to click through the flow from the terminal.
    console.log(
      [
        "",
        "──────────── ✉  email (dev, not sent) ────────────",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text ?? htmlToText(message.html),
        "──────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  }
}

let cached: EmailSender | null = null;

export function createEmailSender(): EmailSender {
  if (cached) return cached;
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  cached = apiKey ? new ResendSender(apiKey, from) : new ConsoleSender();
  return cached;
}
