import { Resend } from 'resend';
import type { EmailMessage, EmailProvider } from './provider';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly client = new Resend(process.env.RESEND_API_KEY);

  async send(message: EmailMessage & { from: string }): Promise<void> {
    const { error } = await this.client.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    });
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}
