import { betterAuth } from "better-auth";
import { username, emailOTP, twoFactor } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { pool } from "@/lib/db";
import { resolveSSOUserToCurrentSession } from "@/lib/sso-resolve";
import { APIError } from "better-auth/api";
import { createPrimaryUserEmail, syncPrimaryUserEmail } from "@/lib/user-emails";
import { mirrorUserProfile } from "@/lib/user-profile";
import { isUserSoftDeleted } from "@/lib/user-account";
import { provisionSSOMembership } from "@/lib/sso-provision";
import { sendOtpEmail, sendResetPasswordEmail } from "@/lib/mailer";

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

  // SAML posts its assertion back cross-site (IdP -> our ACS), so a SameSite=Lax
  // session cookie wouldn't ride along and we couldn't link the SSO identity to the
  // already-signed-in account (GitHub's model). In production (HTTPS) use
  // SameSite=None; Secure so the cookie survives that POST; in local dev keep Lax
  // over HTTP so normal login still works. CSRF stays covered by Better Auth's
  // origin checks, not SameSite.
  advanced: {
    defaultCookieAttributes:
      process.env.NODE_ENV === "production"
        ? { sameSite: "none", secure: true }
        : { sameSite: "lax" },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Password reset by emailed link (expires in 1h). Without this a user who
    // forgets their password is permanently locked out.
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },

  // Throttle auth endpoints (signup, OTP send/verify, sign-in, password reset)
  // so public signup can't be used for email-bombing or OTP brute-force.
  // Backed by the auth DB (a `rateLimit` table) so the limit is shared across
  // Vercel instances - not per-instance memory. To move to Redis later, wire a
  // `secondaryStorage` adapter and switch storage to "secondary-storage".
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 20,
    customRules: {
      "/sign-up/email": { window: 60, max: 5 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/verify-email": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 10 },
    },
  },

  // Verifying an email (by code OR by clicking the link) also signs the user in,
  // so the verification step lands them in the app instead of back at login.
  emailVerification: {
    autoSignInAfterVerification: true,
  },

  // Plural table names (users, sessions, ...) to match our DB naming convention.
  // The rename-auth-tables migration step renames existing singular tables so
  // data is preserved. Columns keep BetterAuth's camelCase.
  session: { modelName: "sessions" },
  // Account linking is how one Flagon account carries several org SSO identities
  // (GitHub's model). allowDifferentEmails: the SSO identity an org's IdP asserts
  // often won't match your account's primary email - linking must still attach it.
  // trustedProviders stays empty so nothing auto-links by email for a LOGGED-OUT
  // user; linking to an existing account only happens for the CURRENT signed-in
  // user, decided explicitly in the SSO resolveUser hook below.
  account: {
    modelName: "accounts",
    accountLinking: { enabled: true, allowDifferentEmails: true },
  },
  verification: { modelName: "verifications" },

  // Extended public-profile fields. These live on the user in the
  // app's auth DB (the user account is app-owned); the BetterAuth CLI migrate
  // creates the columns. All optional; editable via authClient.updateUser.
  user: {
    modelName: "users",
    additionalFields: {
      bio: { type: "string", required: false },
      pronouns: { type: "string", required: false },
      websiteUrl: { type: "string", required: false },
      company: { type: "string", required: false },
      location: { type: "string", required: false },
      // JSON-encoded array of social profile URLs.
      socialLinks: { type: "string", required: false },
      // Which verified email (if any) to show publicly; "" means don't show one.
      publicEmail: { type: "string", required: false },
      // Soft-delete marker. input:false so it's server-managed only (never set
      // via updateUser); a non-null value locks the account out (see the session
      // hook below) and can be cleared to restore the account.
      deletedAt: { type: "date", required: false, input: false },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // Block sign-in for soft-deleted accounts (every sign-in path creates a
        // session, so this is the single choke point). Restoring clears deletedAt.
        before: async (session) => {
          if (await isUserSoftDeleted(session.userId)) {
            throw new APIError("FORBIDDEN", {
              message: "This account has been deleted. Contact support to restore it.",
            });
          }
        },
      },
    },
    user: {
      create: {
        // Mirror the account's first (already OTP-verified) email into our
        // own user_emails table, which is what supports multiple emails, and
        // seed the API's public-profile mirror.
        after: async (user) => {
          await createPrimaryUserEmail(user.id, user.email, user.emailVerified);
          await mirrorUserProfile(user);
        },
      },
      update: {
        // Keep user_emails in sync when BetterAuth itself changes user.email
        // or user.emailVerified, and re-mirror the public profile to the API
        // (name/username/bio/... all update through here).
        after: async (user) => {
          if (user.email) {
            await syncPrimaryUserEmail(user.id, user.email, user.emailVerified ?? false);
          }
          await mirrorUserProfile(user);
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
    // TOTP two-factor (authenticator apps) + backup codes. Enrolled users get a
    // second step at sign-in (see the twoFactorRedirect handling in login).
    twoFactor({ issuer: "Flagon", schema: { twoFactor: { modelName: "two_factors" } } }),
    // Usernames alongside email+password.
    username(),
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        // For email verification, include a click-to-verify link (which carries
        // the code) in addition to the code itself - so users can click OR type.
        const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
        const verifyUrl =
          type === "email-verification"
            ? `${base}/verify-email?email=${encodeURIComponent(email)}&otp=${otp}`
            : undefined;
        await sendOtpEmail(email, otp, type, verifyUrl);
      },
    }),
    // Enterprise SSO (OIDC + SAML). Providers are registered PER ORGANIZATION
    // (each carries its Flagon organizationId), so org A can use Okta and org B
    // Azure AD. Flagon orgs live in the Go API, not BetterAuth's org plugin, so we
    // DON'T use organizationProvisioning; instead provisionUser hands the verified
    // user to the Go API to ensure their membership. Plural table name to match
    // our convention.
    sso({
      schema: { ssoProvider: { modelName: "sso_providers" } },
      // GitHub's model: if you're ALREADY signed in when you go through an org's
      // SSO, link that org's SSO identity to your CURRENT account - whatever email
      // the IdP asserts - instead of resolving a separate identity by email. So one
      // account carries many org SSO identities (org A -> Okta, org B -> Azure,
      // different emails, one login). Linking to your own account is safe: the
      // verified assertion proves you control that IdP identity, and you initiated
      // it. When nobody's signed in, "continue" = the plugin default (sign into the
      // already-linked account, or create a new one).
      resolveUser: resolveSSOUserToCurrentSession,
      provisionUser: async ({ user, provider }) => {
        await provisionSSOMembership({
          userId: user.id,
          email: user.email,
          organizationId: provider.organizationId,
        });
      },
      // Re-run on every login so upstream membership stays in sync (idempotent).
      provisionUserOnEveryLogin: true,
    }),
  ],
});
