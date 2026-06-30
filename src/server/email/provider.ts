/**
 * Email provider contract. Swapping Resend for SendGrid/Postmark/SES later means
 * adding one file that implements EmailProvider and selecting it in index.ts —
 * nothing else changes, because templates render to plain HTML.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage & { from: string }): Promise<void>;
}
