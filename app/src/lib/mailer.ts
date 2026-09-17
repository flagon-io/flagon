// Transactional email. Uses Resend when RESEND_API_KEY is set; otherwise falls
// back to logging the code to the console so local development needs no email
// provider. Set RESEND_FROM to a verified sender in production (defaults to
// Resend's shared onboarding sender, which only delivers to the account owner).
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendOtpEmail(email: string, otp: string, context: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[auth] ${context} OTP for ${email}: ${otp}`);
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
      to: [email],
      subject: "Your Flagon verification code",
      text: `Your Flagon ${context} code is ${otp}.\n\nIt expires shortly. If you didn't request this, you can ignore this email.`,
    }),
  });

  if (!res.ok) {
    // Surface the failure so signup/login reports it instead of silently
    // "succeeding" with an email that never arrived.
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}
