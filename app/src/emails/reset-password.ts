import { emailLayout, FONT } from "./layout";
import type { Email } from "./otp";

/** A branded password-reset email with a click-to-reset button + fallback URL. */
export function resetPasswordEmail(opts: { url: string }): Email {
  const body = `
    <h1 class="heading" style="margin:0 0 8px;font-family:${FONT};font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#0b0b0d;">Reset your password</h1>
    <p class="body-text" style="margin:0 0 22px;font-family:${FONT};font-size:14px;line-height:1.65;color:#52525a;">
      Click the button below to choose a new password. This link expires in 1 hour.
    </p>
    <a href="${opts.url}" class="button" style="display:block;margin:0 0 18px;padding:12px 20px;text-align:center;background:#0d9488;border-radius:10px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
      Reset password
    </a>
    <p class="muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.65;color:#9a9aa2;">
      If you didn&rsquo;t request this, you can safely ignore this email &mdash; your password won&rsquo;t change.
    </p>`;

  return {
    subject: "Reset your Flagon password",
    html: emailLayout({ preview: "Reset your Flagon password", body }),
    text: `Reset your Flagon password by opening this link (expires in 1 hour):\n\n${opts.url}\n\nIf you didn't request this, you can safely ignore this email.`,
  };
}
