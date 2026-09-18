import { emailLayout, FONT } from "./layout";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const headings: Record<string, string> = {
  "sign-in": "Sign in to Flagon",
  "email-verification": "Verify your email",
  "forget-password": "Reset your password",
};

/** A branded one-time-code email (sign-in, verification, password reset). When
 * a verifyUrl is given, a click-to-verify button is shown above the code. */
export function otpEmail(opts: { code: string; context: string; verifyUrl?: string }): Email {
  const heading = headings[opts.context] ?? "Your Flagon code";

  const button = opts.verifyUrl
    ? `
    <a href="${opts.verifyUrl}" class="button" style="display:block;margin:0 0 18px;padding:12px 20px;text-align:center;background:#0d9488;border-radius:10px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
      Verify email address
    </a>
    <p class="body-text" style="margin:0 0 14px;text-align:center;font-family:${FONT};font-size:13px;color:#9a9aa2;">
      or enter this code
    </p>`
    : `
    <p class="body-text" style="margin:0 0 22px;font-family:${FONT};font-size:14px;line-height:1.65;color:#52525a;">
      Enter this code to continue. It expires in 30 minutes.
    </p>`;

  const body = `
    <h1 class="heading" style="margin:0 0 8px;font-family:${FONT};font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#0b0b0d;">${heading}</h1>
    ${button}
    <div class="code-box" style="margin:0 0 22px;padding:18px;text-align:center;background:#f6f7f8;border:1px solid #eceef0;border-radius:12px;">
      <span style="font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#0d9488;padding-left:10px;">${opts.code}</span>
    </div>
    <p class="muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.65;color:#9a9aa2;">
      If you didn&rsquo;t request this, you can safely ignore this email.
    </p>`;

  const textLink = opts.verifyUrl ? `\n\nOr verify by opening: ${opts.verifyUrl}` : "";

  return {
    subject: "Your Flagon verification code",
    html: emailLayout({ preview: `Your Flagon code is ${opts.code}`, body }),
    text: `Your Flagon ${opts.context} code is ${opts.code}.${textLink}\n\nIt expires in 30 minutes. If you didn't request this, you can safely ignore this email.`,
  };
}
