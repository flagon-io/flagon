import "server-only";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization, username } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { db } from "@/db/client";
import { members, organizations, schema, userEmails } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { createEmailSender } from "@/lib/email/sender";
import {
  invitationTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/lib/email/templates";
import { isReserved } from "@/lib/reserved";
import { uuidv7 } from "@/lib/uuid";
import {
  DEFAULT_PLAN,
  isSelectablePlan,
  planAllowsInvites,
} from "@/lib/plans";
import { APP_URL, WEB_URL, API_URL } from "@/lib/urls";

/**
 * The console owns authentication for all of Flagon.
 *
 * BetterAuth is mounted here (see app/api/auth/[...all]/route.ts) and issues its
 * queries through the app's drizzle client. The API does not import this module;
 * it validates the session cookie and PATs against the same database on its own
 * (see apps/api), which keeps BetterAuth out of the serverless API's cold path.
 *
 * Verify every import against the installed BetterAuth version before editing;
 * subpaths and option shapes move between releases (pinned: better-auth 1.6.x).
 */

const email = createEmailSender();

// Cross-subdomain cookies only in deployed environments, where the console
// (app.), marketing site (www.), and API (api.) share the apex domain and must
// share one session cookie. Set AUTH_COOKIE_DOMAIN=".flagon.io" in prod; leave
// it unset locally so the cookie stays scoped to localhost.
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

export const auth = betterAuth({
  appName: "Flagon",
  // Validated at boot (see @/env): guaranteed present, long enough, and never
  // the dev placeholder in production.
  secret: env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? APP_URL,

  database: drizzleAdapter(db, { provider: "pg", schema }),

  // Every origin allowed to drive auth: the console itself, the marketing site
  // (its sign-in link), and the API.
  trustedOrigins: [APP_URL, WEB_URL, API_URL],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Verification is a nag, not a gate (decision: users get in immediately).
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      const { subject, html } = resetPasswordTemplate(url);
      await email.send({ to: user.email, subject, html });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, html } = verifyEmailTemplate(url);
      await email.send({ to: user.email, subject, html });
    },
  },

  session: {
    // A short-lived signed snapshot in a cookie lets middleware make an
    // optimistic signed-in/out decision without a database round-trip; the page
    // still does the authoritative check.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // Brute-force protection on the auth endpoints. Enabled in production (the
  // library default); the generous global window covers everything, and the
  // credential-sensitive routes get strict per-IP windows on top. Normal
  // session traffic (e.g. get-session) keeps the generous default, so real
  // users are never throttled.
  //
  // Storage is in-memory, i.e. per serverless instance. That raises the bar
  // against naive brute-force with no new shared-database table (the API owns
  // the only `rate_limits` table today; a second one here would collide). For
  // distributed-strength limiting, add a secondary store (e.g. Redis) or
  // better-auth "database" storage with its own table later.
  rateLimit: {
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/request-password-reset": { window: 3600, max: 5 },
      "/reset-password": { window: 3600, max: 5 },
    },
  },

  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 39,
      usernameValidator: (value) =>
        // GitHub-style: letters, digits, single hyphens, no leading/trailing
        // hyphen, and not a reserved word.
        /^[a-z0-9](?:[a-z0-9-]{1,37}[a-z0-9])?$/i.test(value) &&
        !isReserved(value),
    }),
    organization({
      // The subscription tier, stored only (no billing during the alpha).
      schema: {
        organization: {
          additionalFields: {
            plan: {
              type: "string",
              required: false,
              defaultValue: "hobby",
              input: true,
            },
          },
        },
      },
      sendInvitationEmail: async (data) => {
        const acceptUrl = `${APP_URL}/invite/${data.id}`;
        const { subject, html } = invitationTemplate({
          organizationName: data.organization.name,
          inviterName: data.inviter.user.name || data.inviter.user.email,
          acceptUrl,
        });
        await email.send({ to: data.email, subject, html });
      },
      organizationHooks: {
        // Two guards on org creation:
        //  1. Coerce any not-currently-available plan (e.g. a crafted request)
        //     down to the default, so the stored marker is always a real plan.
        //  2. An account may own only ONE Hobby organization (Hobby is the
        //     single-user tier). Block a second one.
        beforeCreateOrganization: async ({ organization: org, user }) => {
          const plan =
            typeof org.plan === "string" && isSelectablePlan(org.plan)
              ? org.plan
              : DEFAULT_PLAN;

          if (plan === "hobby") {
            const existing = await db
              .select({ id: organizations.id })
              .from(members)
              .innerJoin(
                organizations,
                eq(members.organizationId, organizations.id),
              )
              .where(
                and(
                  eq(members.userId, user.id),
                  eq(organizations.plan, "hobby"),
                ),
              )
              .limit(1);
            if (existing.length) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "You can only have one Hobby organization. Upgrade to Pro to create more.",
              });
            }
          }

          return { data: { ...org, plan } };
        },
        // Hobby is a single-user plan: inviting teammates requires a paid plan.
        beforeCreateInvitation: async ({ invitation }) => {
          const rows = await db
            .select({ plan: organizations.plan })
            .from(organizations)
            .where(eq(organizations.id, invitation.organizationId))
            .limit(1);
          if (!planAllowsInvites(rows[0]?.plan ?? "hobby")) {
            throw new APIError("FORBIDDEN", {
              message:
                "Inviting teammates requires a paid plan. Hobby is limited to one user.",
            });
          }
        },
      },
    }),
    // nextCookies must be the LAST plugin so it can attach Set-Cookie headers
    // written by any earlier plugin to the Next response.
    nextCookies(),
  ],

  databaseHooks: {
    user: {
      create: {
        // Seed the GitHub-style multi-email table with the signup address as the
        // verified-or-not primary, so `user_email` is the source of truth from
        // the very first row and `user.email` mirrors the primary.
        after: async (createdUser) => {
          await db
            .insert(userEmails)
            .values({
              userId: createdUser.id,
              email: createdUser.email.toLowerCase(),
              verified: createdUser.emailVerified ?? false,
              isPrimary: true,
            })
            .onConflictDoNothing();
        },
      },
      update: {
        // Keep the primary `user_email` row's verified flag in step when
        // BetterAuth marks the user's email verified.
        after: async (updatedUser) => {
          if (updatedUser.emailVerified) {
            await db
              .update(userEmails)
              .set({ verified: true })
              .where(eq(userEmails.email, updatedUser.email.toLowerCase()));
          }
        },
      },
    },
  },

  advanced: {
    // All identifiers are UUIDv7 (time-ordered). BetterAuth calls this for every
    // model's id; our own tables default them via drizzle `$defaultFn`.
    database: { generateId: () => uuidv7() },
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  },
});

export type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * The current session for the incoming request, or null when signed out.
 * Server-only: reads the request headers via next/headers. This is the seam the
 * whole console gates on (page router, layouts, server actions).
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * The current user, or throw. For server actions behind the auth gate, where a
 * missing session is an unexpected/forbidden state rather than a redirect case
 * (the proxy already keeps signed-out visitors off these routes).
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated.");
  return session.user;
}
