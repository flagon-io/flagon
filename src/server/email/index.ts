/**
 * Email entrypoint. Selects a provider from env and exposes a single
 * `sendEmail()` used by the template helpers in send.tsx.
 *
 *   EMAIL_PROVIDER   "resend" | "log"  (default: resend if RESEND_API_KEY, else log)
 *   RESEND_API_KEY   Resend secret
 *   EMAIL_FROM       "Flagon <noreply@flagon.io>" (default: onboarding@resend.dev for testing)
 *
 * Sends are best-effort: a failure is logged but never throws into the calling
 * flow (signup, invite, etc. must not break because email hiccupped).
 */

import { LogProvider } from './log-provider';
import { ResendProvider } from './resend-provider';
import type { EmailMessage, EmailProvider } from './provider';

let instance: EmailProvider | undefined;

function provider(): EmailProvider {
  if (!instance) {
    const which = (
      process.env.EMAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? 'resend' : 'log')
    ).toLowerCase();
    instance = which === 'resend' ? new ResendProvider() : new LogProvider();
  }
  return instance;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || process.env.EMAIL_PROVIDER === 'log';
}

const FROM = process.env.EMAIL_FROM ?? 'Flagon <onboarding@resend.dev>';

export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await provider().send({ ...message, from: FROM });
  } catch (err) {
    console.error('[email] send failed:', err);
  }
}

export type { EmailMessage, EmailProvider } from './provider';
