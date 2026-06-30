/**
 * BetterAuth configuration — the control plane's identity layer.
 *
 * Responsibilities:
 *   - email/password (and, later, social + per-org SSO) authentication
 *   - organizations, membership, roles, and invitations (GitHub-style)
 *   - the product invariant: every user owns at least one organization, created
 *     automatically on signup regardless of how they signed up.
 *
 * SSO (OIDC/SAML) and Stripe are layered on via additional plugins as their
 * env configuration becomes available; see README "Roadmap".
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';
import { db } from '@/server/db';
import { newId } from '@/server/db/id';
import { members, organizations } from '@/server/db/schema/auth';
import * as schema from '@/server/db/schema';

/** Build a URL-safe org slug from an email/name plus a short random suffix. */
function deriveSlug(seed: string): string {
  const base =
    seed
      .split('@')[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'org';
  const suffix = newId('x').split('_')[1]!.slice(0, 4).toLowerCase();
  return `${base}-${suffix}`;
}

export const auth = betterAuth({
  appName: 'Flagon',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),

  emailAndPassword: {
    enabled: true,
    // Wire a real provider before production; off keeps local signup frictionless.
    requireEmailVerification: false,
  },

  plugins: [
    organization({
      // Roles map onto the product's RBAC: owner | admin | member | viewer.
      // Invitations expire after a week.
      invitationExpiresIn: 60 * 60 * 24 * 7,
    }),
    // Keeps Set-Cookie working from Next server actions / route handlers.
    nextCookies(),
  ],

  databaseHooks: {
    user: {
      create: {
        // Enforce "≥1 organization per user" at the moment of signup.
        after: async (user) => {
          const orgId = newId('org');
          await db.insert(organizations).values({
            id: orgId,
            name: `${user.name || user.email.split('@')[0]}'s Org`,
            slug: deriveSlug(user.email),
          });
          await db.insert(members).values({
            id: newId('mem'),
            organizationId: orgId,
            userId: user.id,
            role: 'owner',
          });
        },
      },
    },
  },
});

export type Auth = typeof auth;
