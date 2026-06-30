import type { EmailMessage, EmailProvider } from './provider';

/**
 * Fallback when no email provider is configured (local dev). Logs the message
 * instead of sending, so flows that send email don't fail and you can see what
 * would have gone out.
 */
export class LogProvider implements EmailProvider {
  readonly name = 'log';

  async send(message: EmailMessage & { from: string }): Promise<void> {
    console.log(
      `\n[email:log] would send →\n  to:      ${message.to}\n  from:    ${message.from}\n  subject: ${message.subject}\n  (set RESEND_API_KEY to actually send)\n`,
    );
  }
}
