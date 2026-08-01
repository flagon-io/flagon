import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, username } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  authSchema,
  members,
  organizations,
  userEmails,
} from "../db/auth-tables.js";
import { env } from "../env.js";
import { createEmailSender } from "./email/sender.js";
import {
  invitationTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "./email/templates.js";
import { isReserved } from "./reserved.js";
import { uuidv7 } from "./uuid.js";
import { DEFAULT_PLAN, isSelectablePlan, planAllowsInvites } from "./plans.js";
import { resolvePrimaryEmail } from "./user-emails.js";

/**
 * The API OWNS authentication for all of Flagon.
 *
 * BetterAuth is mounted here (see index.ts: app.on(["GET","POST"], "/api/auth/*"))
 * and issues its queries through the API's drizzle client + the full auth schema.
 * The console (app.flagon.io) is now a client: its authClient points at this API,
 * and its getSession() forwards the cookie here. This is a verbatim port of the
 * old console instance (apps/app/src/lib/auth.ts) MINUS the Next-specific
 * nextCookies() plugin — in Hono the cookies ride the Response the handler
 * returns. The DDL still lives in the console's migration (see auth-tables.ts).
 *
 * Cookie identity (prefix, domain, secret) is byte-identical to the old console
 * config so existing sessions stay valid across the move.
 */

const email = createEmailSender();

// Sibling origins allowed to drive auth (CORS + BetterAuth trustedOrigins). Fall
// back to the NEXT_PUBLIC_* names so the API trusts app./www. even when only
// those are configured — otherwise cross-origin sign-in is rejected. The API's
// OWN origin is its baseURL.
const APP_URL =
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const WEB_URL =
  process.env.WEB_URL ?? process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
const SELF_URL =
  process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? "3002"}`;

// Cross-subdomain cookies only in deployed environments (app./www./api. share the
// apex). Set AUTH_COOKIE_DOMAIN=".flagon.io" in prod; unset locally.
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

/**
 * Point a BetterAuth email-action link back at the CONSOLE.
 *
 * The verify-email / reset-password handlers only redirect when their link carries
 * a `callbackURL`; BetterAuth defaults it to a RELATIVE "/" (or empty), which now
 * resolves to the API's own origin — so the link renders JSON instead of returning
 * the user to the app. Since auth moved here, we rewrite a missing or relative
 * callback to an absolute app URL (a trusted origin, so originCheck passes). An
 * already-absolute callback is left untouched, so an explicit client redirect still
 * wins. `fallbackPath` is where a bare link should land (e.g. "/reset-password").
 */
function withAppCallback(url: string, fallbackPath: string): string {
  try {
    const u = new URL(url);
    const cb = u.searchParams.get("callbackURL");
    if (!cb || cb.startsWith("/")) {
      const path = cb && cb !== "/" ? cb : fallbackPath;
      u.searchParams.set("callbackURL", `${APP_URL}${path}`);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export const auth = betterAuth({
  appName: "Flagon",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: SELF_URL,

  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),

  trustedOrigins: [APP_URL, WEB_URL, SELF_URL],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      const { subject, html } = resetPasswordTemplate(withAppCallback(url, "/reset-password"));
      await email.send({ to: user.email, subject, html });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({
      user,
      token,
    }: {
      user: { email: string };
      token: string;
    }) => {
      // Link to the CONSOLE, not the API: the app's /verify-email page calls the
      // API to verify (see apps/app), so the user lands in the product and never
      // sees an API response. (BetterAuth's own `url` points at this API's
      // verify-email endpoint, which we deliberately don't use here.)
      const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      const { subject, html } = verifyEmailTemplate(verifyUrl);
      await email.send({ to: user.email, subject, html });
    },
  },

  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // Brute-force protection. In-memory (per serverless instance) on purpose: a
  // better-auth "database" store would create/expect its own rate-limit table and
  // collide with the API's existing `rate_limits` table.
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
  // address exists. This moved here from the console's signInAction.
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
      usernameValidator: (value) =>
        /^[a-z0-9](?:[a-z0-9-]{1,37}[a-z0-9])?$/i.test(value) &&
        !isReserved(value),
    }),
    organization({
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
    // NOTE: no nextCookies() — this runs in Hono; cookies ride the Response.
  ],

  databaseHooks: {
    user: {
      create: {
        // Seed the multi-email source-of-truth with the signup address as primary.
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
    database: { generateId: () => uuidv7() },
    // Same namespace as before (proxy.ts reads this prefix); MUST stay "flagon".
    cookiePrefix: "flagon",
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  },
});
