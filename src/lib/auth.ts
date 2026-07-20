import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { userEmails } from "../db/schema";
import { brand } from "./brand";
import { sendEmail } from "./email";
import { renderBrandedEmail } from "./email-templates";
import { findByEmail } from "./user-emails";
import { uuidv7 } from "./uuidv7";
import {
  isValidUsername,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "./username";

/**
 * BetterAuth server instance. Credentials: username + email +
 * password. Auth tables (user/session/account/verification) are GLOBAL, not
 * org-scoped, so they carry no RLS. Multiple emails per user is a future
 * addition (BetterAuth has no built-in support yet).
 *
 * Users sign in at app.flagon.io (same-origin: /api/auth passes through the
 * proxy on the app subdomain). The session cookie is shared across *.flagon.io
 * so www and api see it too.
 */
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const crossSubDomain = new URL(baseURL).hostname.includes(".");

const trustedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXT_PUBLIC_MARKETING_URL,
  process.env.NEXT_PUBLIC_API_URL,
].filter((v): v is string => Boolean(v));

export const auth = betterAuth({
  baseURL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: `Reset your ${brand.name} password`,
        ...renderBrandedEmail({
          preview: "Use the link inside to choose a new password.",
          heading: "Reset your password",
          paragraphs: [
            `Someone (hopefully you) requested a password reset for the ${brand.name} account tied to this email address.`,
          ],
          cta: { label: "Reset password", url },
          footnote:
            "The link expires in 1 hour. If you didn't request this, you can safely ignore this email; your password will not change.",
        }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: `Verify your ${brand.name} email address`,
        ...renderBrandedEmail({
          preview: "Confirm this address to finish setting up your account.",
          heading: `Welcome to ${brand.name}`,
          paragraphs: [
            "Please confirm this email address belongs to you to finish setting up your account.",
          ],
          cta: { label: "Verify email address", url },
          footnote:
            "If you didn't create an account, you can safely ignore this email.",
        }),
      });
    },
  },
  user: {
    // Self-service account deletion (settings danger zone).
    // Password-confirmed on the client; revisit before billing/orgs exist.
    deleteUser: { enabled: true },
  },
  // Keep user_emails (multi-email source of truth, src/lib/user-emails.ts) in
  // lockstep with BetterAuth's "user".email mirror.
  databaseHooks: {
    user: {
      create: {
        // BetterAuth only knows about "user".email; also reject sign-ups that
        // collide with anyone's ALTERNATE address.
        before: async (newUser) => {
          if (await findByEmail(newUser.email)) {
            throw APIError.from("UNPROCESSABLE_ENTITY", {
              message: "User already exists. Use another email.",
              code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            });
          }
          return { data: newUser };
        },
        // Every new user starts with their sign-up address as the primary row.
        after: async (createdUser) => {
          await db.insert(userEmails).values({
            id: uuidv7(),
            userId: createdUser.id,
            email: createdUser.email,
            verified: createdUser.emailVerified,
            isPrimary: true,
          });
        },
      },
      update: {
        // BetterAuth-side updates (e.g. verify-email flipping emailVerified)
        // flow into the primary row.
        after: async (updatedUser) => {
          await db
            .update(userEmails)
            .set({
              email: updatedUser.email,
              verified: updatedUser.emailVerified,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userEmails.userId, updatedUser.id),
                eq(userEmails.isPrimary, true),
              ),
            );
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
      usernameValidator: isValidUsername,
    }),
    // Must stay last: lets auth.api.* calls made from server actions write
    // their Set-Cookie headers through Next's cookie store.
    nextCookies(),
  ],
  trustedOrigins,
  // Postgres-backed rate limiting (rate_limit table): in-memory is useless on
  // serverless, and Postgres beats standing up Redis at this scale. Stricter
  // rules on the credential endpoints.
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 60, max: 10 },
    },
  },
  advanced: {
    // Brand the cookies: flagon.session_token instead of the library default.
    // Changing this invalidates existing sessions (old cookie name is simply
    // ignored), which is fine pre-launch.
    cookiePrefix: "flagon",
    crossSubDomainCookies: { enabled: crossSubDomain },
    // Platform convention: ALL ids are UUIDv7 (time-ordered) unless there's
    // an explicit reason otherwise. Applies to user/session/account/
    // verification rows created by BetterAuth.
    database: { generateId: () => uuidv7() },
  },
});
