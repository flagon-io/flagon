// Single placeholder for "send this OTP somewhere" until a real transactional
// email provider (Resend/Postmark/etc.) is wired in.
export async function sendOtpEmail(email: string, otp: string, context: string) {
  console.log(`[auth] ${context} OTP for ${email}: ${otp}`);
}
