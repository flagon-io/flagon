/**
 * BetterAuth configuration - the control plane's identity layer.
 *
 *   - email/username + password authentication (people like usernames)
 *   - organizations, membership, roles, invitations
 *   - UUIDv7 ids for every auth row (matches the rest of the schema)
 *   - invite-only signups: the first account is free (that's you, in prod);
 *     after that, a signup is only allowed if its email is an APPROVED waitlist
 *     entry. Everyone else joins the waitlist and waits for approval.
 *
 * New users land with NO organization on purpose - onboarding asks them to
 * create one (see /app/new), which keeps the "every user ends up in ≥1 org"
 * invariant while giving them control over the name/slug.
 */

import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { jwt, organization, username } from 'better-auth/plugins';
import { and, count, eq } from 'drizzle-orm';
import { JWT_AUDIENCE, JWT_EXPIRATION, JWT_ISSUER } from './jwt-config';
import { userOrgRoles } from './principal';
import { seedDefaultEnvironments } from '@/server/environments/defaults';
import { db } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import {
  isMultiTenant,
  isWaitlistEnabled,
  SINGLE_TENANT_ORG_SLUG,
  socialProviderStatus,
} from '@/server/config';
import { invitations, members, organizations, users } from '@/server/db/schema/auth';
import { waitlist } from '@/server/db/schema/app';
import { sendOrgInvite, sendPasswordReset } from '@/server/email/send';
import * as schema from '@/server/db/schema';

/** Single-org mode: add the user to the one shared organization (creating it once). */
async function ensureSharedOrgMembership(userId: string): Promise<void> {
  const find = () =>
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, SINGLE_TENANT_ORG_SLUG))
      .limit(1);

  let [org] = await find();
  if (!org) {
    await db
      .insert(organizations)
      .values({ id: uuidv7(), name: 'Default', slug: SINGLE_TENANT_ORG_SLUG })
      .onConflictDoNothing();
    [org] = await find();
    // This path bypasses the org plugin's afterCreate hook, so seed envs here.
    if (org) await seedDefaultEnvironments(org.id);
  }
  if (!org) return;

  // First member of the shared org is the owner; everyone else is a member.
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(members)
    .where(eq(members.organizationId, org.id));
  await db
    .insert(members)
    .values({ organizationId: org.id, userId, role: memberCount === 0 ? 'owner' : 'member' })
    .onConflictDoNothing();
}

/** Is this email allowed to create an account right now? */
async function signupAllowed(email: string): Promise<boolean> {
  // Waitlist off (local/self-host default): registration is open.
  if (!isWaitlistEnabled()) return true;

  const normalized = email.toLowerCase();

  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  // First account ever (the founder) is always allowed.
  if (userCount === 0) return true;

  // An approved waitlist entry is allowed.
  const [entry] = await db
    .select({ status: waitlist.status })
    .from(waitlist)
    .where(eq(waitlist.email, normalized))
    .limit(1);
  if (entry?.status === 'approved') return true;

  // A pending, unexpired org invitation IS the invite — the waitlist only guards
  // people arriving unprompted, so let invited addresses create their account.
  const [invite] = await db
    .select({ expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.email, normalized), eq(invitations.status, 'pending')))
    .limit(1);
  if (invite && invite.expiresAt.getTime() > Date.now()) return true;

  return false;
}

// Root domain (e.g. "flagon.io") enables a shared session across every
// subdomain: app., api., sudo., and the apex. Unset locally (single origin).
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

export const auth = betterAuth({
  appName: 'Flagon',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Accept auth requests originating from any of our surfaces.
  trustedOrigins: rootDomain
    ? [
        `https://${rootDomain}`,
        `https://app.${rootDomain}`,
        `https://sudo.${rootDomain}`,
        `https://api.${rootDomain}`,
      ]
    : undefined,

  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),

  advanced: {
    // App-generated UUIDv7 ids (forward-compatible with Postgres 18 `uuidv7()`).
    database: { generateId: () => uuidv7() },
    // Share the session cookie across all subdomains so one login works
    // everywhere (the dashboard, the API, and the sudo console).
    ...(rootDomain
      ? { crossSubDomainCookies: { enabled: true, domain: `.${rootDomain}` } }
      : {}),
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, token }) => {
      await sendPasswordReset({ to: user.email, token });
    },
  },

  // Each provider is included only when its env pair is set, so social login
  // can be turned on later without a code change.
  socialProviders: {
    ...(socialProviderStatus().google
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(socialProviderStatus().github
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(socialProviderStatus().apple
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID!,
            clientSecret: process.env.APPLE_CLIENT_SECRET!,
          },
        }
      : {}),
  },

  plugins: [
    username(),
    organization({
      invitationExpiresIn: 60 * 60 * 24 * 7,
      // We don't run email verification yet, so don't gate invite accept on it.
      requireEmailVerificationOnInvitation: false,
      // Teams own projects (Catalog ownership). A default team is created with each org.
      teams: { enabled: true, defaultTeam: { enabled: true } },
      organizationHooks: {
        // Environments are an org-level platform primitive: seed the default set
        // (Production, Staging) the moment an org is created, so projects and flags
        // have a consistent environment grid from day one.
        afterCreateOrganization: async ({ organization }) => {
          await seedDefaultEnvironments(organization.id);
        },
      },
      sendInvitationEmail: async (data) => {
        await sendOrgInvite({
          to: data.email,
          orgName: data.organization.name,
          inviterName: data.inviter.user?.name ?? 'A teammate',
          invitationId: data.id,
        });
      },
    }),
    // JWT seam: publishes a JWKS + a session→JWT exchange (`/api/auth/token`) and
    // gives us `auth.api.signJWT` to mint tokens for PAT/org exchange. The session
    // payload carries the user's live org roles so backends authorize from claims.
    jwt({
      jwks: {
        keyPairConfig: { alg: 'EdDSA' },
        // Rotate the signing key every 90 days; keep the prior public key servable
        // for 7 days so any in-flight (≤15m) JWT still verifies across a rotation.
        rotationInterval: 60 * 60 * 24 * 90,
        gracePeriod: 60 * 60 * 24 * 7,
      },
      jwt: {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expirationTime: JWT_EXPIRATION,
        definePayload: async ({ user }) => ({ act: 'user', orgs: await userOrgRoles(user.id) }),
      },
    }),
    nextCookies(),
  ],

  databaseHooks: {
    user: {
      create: {
        // Enforce invite-only signup at the moment of account creation.
        before: async (user) => {
          if (!(await signupAllowed(user.email))) {
            throw new APIError('FORBIDDEN', {
              message: 'Signups are invite-only. Join the waitlist for early access.',
            });
          }
          return { data: user };
        },
        after: async (user) => {
          // Mark the waitlist entry as converted (best-effort).
          await db
            .update(waitlist)
            .set({ status: 'converted' })
            .where(eq(waitlist.email, user.email.toLowerCase()));
          // Single-org mode: auto-assign to the shared org (skips onboarding).
          if (!isMultiTenant()) {
            await ensureSharedOrgMembership(user.id);
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
