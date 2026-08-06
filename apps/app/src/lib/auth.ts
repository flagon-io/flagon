import "server-only";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor, username } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members, organizations, schema, userEmails } from "@/db/schema";
import { env } from "@/env";
import { createEmailSender } from "@/lib/email/sender";
import {
  invitationTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/lib/email/templates";
import { isValidUsername } from "@/lib/username";
import { uuidv7 } from "@/lib/uuid";
import { DEFAULT_PLAN, isSelectablePlan, planAllowsInvites } from "@/lib/plans";
import { resolvePrimaryEmail } from "@/lib/user-emails";
import { provisioningRoleFor, stampSsoSession } from "@/lib/org-security";
import { APP_URL, WEB_URL, API_URL } from "@/lib/urls";

/**
 * The console owns authentication for all of Flagon.
 *
 * BetterAuth is hosted HERE (mounted at app/api/auth/[...all]/route.ts) and
 * issues its queries through the console's own drizzle client against the shared
 * database. Because auth lives with the console, resolving a session is an
 * in-process call (getSession below), not a cross-service HTTP hop — the console
 * never depends on the API being reachable to know who you are.
 *
 * The API (apps/api) does NOT import this module. It authenticates its own
 * requests against the same database independently: PATs/OATs by a hashed lookup,
 * and the session cookie by verifying BetterAuth's signed cookie cache (see
 * apps/api/src/lib/auth-context.ts). So there is exactly ONE BetterAuth instance
 * (here), and no service calls another to answer "who are you".
 *
 * Verify every import against the installed BetterAuth version before editing;
 * subpaths and option shapes move between releases (pinned: better-auth 1.6.x).
 */

const email = createEmailSender();

// Cross-subdomain cookies only in deployed environments, where the console
// (app.), marketing site (www.), and API (api.) share the apex domain and must
// share one session cookie. Set AUTH_COOKIE_DOMAIN=".flagon.io" in prod; leave
// it unset locally so the cookie stays scoped to localhost (shared across ports).
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

export const auth = betterAuth({
  appName: "Flagon",
  // Validated at boot (see @/env): guaranteed present, long enough, and never
  // the dev placeholder in production. The API shares this secret so it can
  // verify the cookies this instance signs.
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
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      const { subject, html } = resetPasswordTemplate(url);
      await email.send({ to: user.email, subject, html });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      const { subject, html } = verifyEmailTemplate(url);
      await email.send({ to: user.email, subject, html });
    },
  },

  session: {
    // A short-lived signed snapshot in a cookie lets the proxy make an optimistic
    // signed-in/out decision without a database round-trip, and lets the API
    // verify a session without hitting the database on the hot path; the console
    // page still does the authoritative in-process check.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // Brute-force protection on the auth endpoints. In-memory (per instance) on
  // purpose: a better-auth "database" store would want its own rate-limit table
  // and collide with the API's existing `rate_limits` table. The generous global
  // window covers everything; credential-sensitive routes get strict per-IP
  // windows on top. Normal session traffic keeps the default, so real users are
  // never throttled.
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

  // Sign in with ANY verified alias: rewrite the submitted email to the account
  // primary before the credential check (GitHub-style multi-email). Unknown or
  // unverified addresses pass through unchanged, so this never reveals whether an
  // address exists.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const submitted = ctx.body?.email;
      if (typeof submitted !== "string" || !submitted) return;
      const primary = await resolvePrimaryEmail(submitted);
      if (primary === submitted.trim().toLowerCase()) return;
      return { context: { body: { ...ctx.body, email: primary } } };
    }),
  },

  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 39,
      // The backstop. BetterAuth takes a boolean, so it cannot say WHICH rule
      // failed; the signup and profile forms call validateUsername for that and
      // share this exact predicate, so the two can never disagree.
      usernameValidator: isValidUsername,
    }),
    organization({
      // The subscription tier, stored on the org row; set by billing, not users.
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
        // A new Pro org is stamped `incomplete` (locked) until Stripe Checkout
        // completes and the webhook flips it active — stops free Pro at creation.
        afterCreateOrganization: async ({ organization: org }) => {
          if (org.plan === "pro") {
            await db
              .update(organizations)
              .set({ subscriptionStatus: "incomplete" })
              .where(eq(organizations.id, org.id));
          }
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
        // Organization deletion is GUARDED, not self-serve. The API's tenant data
        // (flags, experiments, usage) lives in a separate pipeline with no foreign
        // key to this auth org row, so a raw delete here would ORPHAN it. Block it
        // until a safe cross-service cascade + soft-delete/retention lands (see the
        // org-lifecycle design). This protects data even if a client calls delete.
        beforeDeleteOrganization: async () => {
          throw new APIError("FORBIDDEN", {
            message:
              "Organization deletion isn't self-serve yet. Contact support to remove an organization.",
          });
        },
      },
    }),
    // Two-factor (TOTP + backup codes). Enrollment is opt-in per user on the
    // account security page; an org can then REQUIRE it of its members (see the
    // enforcement gate in [org]/layout.tsx). `issuer` is what shows in the
    // member's authenticator app.
    twoFactor({ issuer: "Flagon" }),
    // Organization SSO (SAML 2.0 + OIDC). A provider is linked to an ORG
    // (organizationId); members keep their own personal accounts. On SSO login
    // the plugin JIT-provisions org membership, and we stamp a per-org SSO
    // session so the enforcement gate can require an active one.
    sso({
      // Auto-add the SSO user to the linked org. BetterAuth provisioning only
      // supports member|admin, so the org's `sso_default_role` maps through
      // provisioningRoleFor (read-only roles are assigned manually or via SCIM).
      organizationProvisioning: {
        disabled: false,
        getRole: async ({ provider }) =>
          provider.organizationId
            ? provisioningRoleFor(provider.organizationId)
            : "member",
      },
      // Refresh the SSO session (and re-sync membership) on every login, not
      // just first registration — this is what keeps the enforcement TTL alive.
      provisionUserOnEveryLogin: true,
      provisionUser: async ({ user, provider }) => {
        if (!provider.organizationId) return;
        // Record/renew the org SSO session the enforcement gate checks.
        await stampSsoSession(provider.organizationId, user.id);
        // Belt-and-suspenders: keep the multi-email source of truth seeded for
        // JIT users (mirrors the databaseHooks.user.create.after seed).
        await db
          .insert(userEmails)
          .values({
            userId: user.id,
            email: user.email.toLowerCase(),
            verified: user.emailVerified ?? false,
            isPrimary: true,
          })
          .onConflictDoNothing();
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
        // verified-or-not primary, so `user_emails` is the source of truth from
        // the first row and `user.email` mirrors the primary.
        after: async (createdUser: {
          id: string;
          email: string;
          emailVerified?: boolean;
        }) => {
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
        // Keep the primary `user_emails` row's verified flag in step when
        // BetterAuth marks the user's email verified.
        after: async (updatedUser: { email: string; emailVerified?: boolean }) => {
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
    // Our own cookie namespace, off BetterAuth's default `better-auth`. `proxy.ts`
    // and the API both read this same prefix; the three MUST stay in sync.
    cookiePrefix: "flagon",
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  },
});

export type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * The current session for the incoming request, or null when signed out.
 * Server-only: reads the request headers via next/headers, resolved IN-PROCESS
 * (no HTTP hop). This is the seam the whole console gates on (pages, layouts,
 * server actions).
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

/**
 * Device sessions for the current user (security page). Empty on failure — but the
 * failure is LOGGED, not silently swallowed: a blank device list while you are
 * signed in almost always means `listSessions` threw (e.g. a stale cookie-cache
 * identity the DB can't reconcile), and hiding that turns a real error into a
 * confusing empty state. The page falls back to the current session so you always
 * see "This device".
 */
export async function getSessions() {
  try {
    return await auth.api.listSessions({ headers: await headers() });
  } catch (err) {
    console.error("[auth] listSessions failed", err);
    return [];
  }
}
