import { betterAuth } from "better-auth";
import { username, emailOTP } from "better-auth/plugins";
import { pool } from "@/lib/db";
import { createPrimaryUserEmail, syncPrimaryUserEmail } from "@/lib/user-emails";
import { sendOtpEmail } from "@/lib/mailer";

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
const githubConfigured = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
);

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  databaseHooks: {
    user: {
      create: {
        // Mirror the account's first (already OTP-verified) email into our
        // own user_email table, which is what supports multiple emails.
        after: async (user) => {
          await createPrimaryUserEmail(user.id, user.email, user.emailVerified);
        },
      },
      update: {
        // Keep user_email in sync when BetterAuth itself changes user.email
        // or user.emailVerified (our own /api/emails endpoints handle the
        // rest of the multi-email management directly).
        after: async (user) => {
          if (user.email) {
            await syncPrimaryUserEmail(user.id, user.email, user.emailVerified ?? false);
          }
        },
      },
    },
  },

  socialProviders: {
    ...(googleConfigured && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    }),
    ...(githubConfigured && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    }),
  },

  plugins: [
    // GitHub-style usernames alongside email+password.
    username(),
    emailOTP({
      // Verify email with a 6-digit code (like PostHog) instead of a link.
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        await sendOtpEmail(email, otp, type);
      },
    }),
  ],
});
