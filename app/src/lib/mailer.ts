// Transactional email for the auth flows the app owns (OTP, password reset).
// Uses Resend when RESEND_API_KEY is set; otherwise logs to the console so local
// development needs no provider. Templates live in src/emails. Org invitation
// emails are sent by the API (api/internal/mail), not here, so every front door
// sends the same one.
import { otpEmail, type Email } from "@/emails/otp";
import { resetPasswordEmail } from "@/emails/reset-password";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Send a rendered email. In dev (no RESEND_API_KEY) it logs the text version. */
export async function sendEmail(to: string, email: Email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // In production a missing key means verification/reset mail silently never
    // arrives, which strands every new signup. Fail loudly instead of no-oping.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is not set: refusing to drop a transactional email in production.",
      );
    }
    console.log(`[email] to ${to} - ${email.subject}\n${email.text}`);
    return;
  }

  const from = process.env.RESEND_FROM ?? "Flagon <onboarding@resend.dev>";
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!res.ok) {
    // Surface the failure so signup/login reports it instead of silently
    // "succeeding" with an email that never arrived.
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  context: string,
  verifyUrl?: string,
) {
  await sendEmail(email, otpEmail({ code: otp, context, verifyUrl }));
}

export async function sendResetPasswordEmail(email: string, url: string) {
  await sendEmail(email, resetPasswordEmail({ url }));
}
