import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization, username } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { userEmails } from "../db/schema";
import { brand } from "./brand";
import { sessionCookieDomain } from "./cookie-domain";
import { sendEmail } from "./email";
import { renderBrandedEmail } from "./email-templates";
import { billingEnabled } from "./billing";
import { normalizeOrgSlug, validateOrgSlug } from "./org-slug";
import { appHref } from "./urls";
import { SELF_SERVE_PLANS, isPlanId } from "./plans";
import { userOwnsFreeOrg } from "./plans.server";
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
// One sign-in, visible on www / app / api: the session cookie is scoped to
// the apex domain. Null on localhost and preview hosts (single origin).
const cookieDomain = sessionCookieDomain(
  baseURL,
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "flagon.io",
);

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
  // Plural table names (platform convention; drizzle/0005_plural_tables.sql).
  user: {
    modelName: "users",
    // Self-service account deletion (settings danger zone).
    // Password-confirmed on the client; revisit before billing/orgs exist.
    deleteUser: { enabled: true },
  },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  // Keep user_emails (multi-email source of truth, src/lib/user-emails.ts) in
  // lockstep with BetterAuth's users.email mirror.
  databaseHooks: {
    user: {
      create: {
        // BetterAuth only knows about users.email; also reject sign-ups that
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
    organization({
      // Plural table names per convention (drizzle/0007_organizations.sql).
      schema: {
        organization: {
          modelName: "organizations",
          additionalFields: {
            // The org's plan (src/lib/plans.ts). Selectable at creation when
            // billing is enabled; validated in beforeCreateOrganization.
            plan: { type: "string", required: false, defaultValue: "free" },
          },
        },
        member: { modelName: "members" },
        invitation: { modelName: "invitations" },
        team: { modelName: "teams" },
        // Adapter models resolve by drizzle schema KEY (the pgTable maps it
        // to the team_members SQL name), same as rateLimits -> rate_limits.
        teamMember: { modelName: "teamMembers" },
      },
      creatorRole: "owner",
      // Teams: named groups of org members that own/get access to resources
      // (projects first), mirroring how code hosts scope repository access.
      teams: { enabled: true },
      invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
      // Invitations are email-keyed: inviting an existing account routes to
      // its primary address, and accepting requires being signed in with it.
      sendInvitationEmail: async (data) => {
        const path = appHref(`/invitations/${data.id}`);
        const url = path.startsWith("http") ? path : `${baseURL}${path}`;
        await sendEmail({
          to: data.email,
          subject: `Join ${data.organization.name} on ${brand.name}`,
          ...renderBrandedEmail({
            preview: `${data.inviter.user.name} invited you to ${data.organization.name}.`,
            heading: `Join ${data.organization.name}`,
            paragraphs: [
              `${data.inviter.user.name} invited you to the ${data.organization.name} organization on ${brand.name} (role: ${data.role}).`,
              `No ${brand.name} account yet? Sign up with this email address first, then open the invitation.`,
            ],
            cta: { label: "View invitation", url },
            footnote:
              "The invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.",
          }),
        });
      },
      organizationHooks: {
        // Slugs are URL identity (app.flagon.io/<slug>): normalize and
        // enforce charset + reserved-word rules server-side. Plan selection
        // is enforced here too so the API can't sidestep the UI.
        beforeCreateOrganization: async ({ organization: org, user }) => {
          const slug = normalizeOrgSlug(org.slug ?? "");
          const result = validateOrgSlug(slug);
          if (!result.ok) {
            throw APIError.from("UNPROCESSABLE_ENTITY", {
              message: result.error,
              code: "INVALID_ORGANIZATION_SLUG",
            });
          }

          const requested = (org as { plan?: string }).plan ?? "free";
          const plan = "free";
          if (billingEnabled()) {
            if (!isPlanId(requested) || !SELF_SERVE_PLANS.includes(requested)) {
              throw APIError.from("UNPROCESSABLE_ENTITY", {
                message: "Choose a plan: free or pro.",
                code: "INVALID_PLAN",
              });
            }
            // Pro is never granted here: every org is created on the free
            // plan and the Stripe webhook flips it to pro after checkout
            // completes. A "pro" request only bypasses the one-free-org
            // limit (the caller is heading to checkout).
            if (requested === "free" && (await userOwnsFreeOrg(user.id))) {
              throw APIError.from("UNPROCESSABLE_ENTITY", {
                message:
                  "You already have a Hobby organization. Create this one on Pro, or upgrade your existing organization.",
                code: "FREE_ORG_LIMIT_REACHED",
              });
            }
          }
          // Billing off (self-host / pre-Stripe): no plan selection, no
          // free-org limits; everything resolves all-on regardless.

          return { data: { ...org, slug, plan } };
        },
      },
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
    modelName: "rateLimits",
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
    // Explicit domain: BetterAuth otherwise defaults to the full baseURL
    // hostname (app.flagon.io), which the marketing site can't read.
    crossSubDomainCookies: cookieDomain
      ? { enabled: true, domain: cookieDomain }
      : { enabled: false },
    // Platform convention: ALL ids are UUIDv7 (time-ordered) unless there's
    // an explicit reason otherwise. Applies to user/session/account/
    // verification rows created by BetterAuth.
    database: { generateId: () => uuidv7() },
  },
});
