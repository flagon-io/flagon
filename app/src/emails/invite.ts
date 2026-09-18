import { emailLayout, FONT } from "./layout";
import type { Email } from "./otp";

/** A branded org-invitation email with an accept button + fallback URL. The
 * accept link doubles as email verification, so the invitee can register (or
 * sign in) and join in one step. */
export function inviteEmail(opts: {
  url: string;
  orgName: string;
  inviter?: string;
  role: string;
}): Email {
  const who = opts.inviter ? `${opts.inviter} invited you` : "You've been invited";
  const intro = `${who} to join <strong>${opts.orgName}</strong> on Flagon as ${article(opts.role)} ${opts.role}.`;

  const body = `
    <h1 class="heading" style="margin:0 0 8px;font-family:${FONT};font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#0b0b0d;">Join ${opts.orgName} on Flagon</h1>
    <p class="body-text" style="margin:0 0 22px;font-family:${FONT};font-size:14px;line-height:1.65;color:#52525a;">
      ${intro}
    </p>
    <a href="${opts.url}" class="button" style="display:block;margin:0 0 18px;padding:12px 20px;text-align:center;background:#0d9488;border-radius:10px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
      Accept invitation
    </a>
    <p class="muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.65;color:#9a9aa2;">
      This link expires in 7 days. If you weren&rsquo;t expecting this, you can safely ignore this email.
    </p>`;

  return {
    subject: `Join ${opts.orgName} on Flagon`,
    html: emailLayout({ preview: `${who} to join ${opts.orgName} on Flagon.`, body }),
    text: `${stripTags(who)} to join ${opts.orgName} on Flagon as ${article(opts.role)} ${opts.role}.\n\nAccept your invitation by opening this link (expires in 7 days):\n\n${opts.url}\n\nIf you weren't expecting this, you can safely ignore this email.`,
  };
}

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? "an" : "a";
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}
