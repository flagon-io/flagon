/**
 * BetterAuth-owned tables (core + organization, SSO, Stripe, username plugins).
 *
 * Ids are `uuid` populated with app-generated UUIDv7 (see id.ts) via BetterAuth's
 * advanced.database.generateId. Switching the column DEFAULT to native
 * `uuidv7()` on Postgres 18 later needs no data migration.
 */

import { boolean, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../id';

// --- Core ------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // username plugin: normalized (lowercase, unique) + original-case display form.
  username: text('username').unique(),
  displayUsername: text('display_username'),
  // Added by the Stripe plugin.
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  token: text('token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Organization plugin: the org the session is currently acting in.
  activeOrganizationId: uuid('active_organization_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Organization plugin ---------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // owner | admin | member | viewer
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('members_org_user_unique').on(t.organizationId, t.userId)],
);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'),
  // pending | accepted | rejected | canceled
  status: text('status').notNull().default('pending'),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- SSO plugin (per-org enterprise OIDC/SAML) -----------------------------

export const ssoProviders = pgTable('sso_providers', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  issuer: text('issuer').notNull(),
  domain: text('domain').notNull(),
  oidcConfig: text('oidc_config'),
  samlConfig: text('saml_config'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull().unique(),
  organizationId: uuid('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
});

// --- Stripe plugin ---------------------------------------------------------

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  plan: text('plan').notNull(),
  // Generic reference (org id) as managed by the Stripe plugin; kept text.
  referenceId: text('reference_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').notNull().default('incomplete'),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  seats: integer('seats'),
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
});

// --- JWT plugin (JWKS signing keys) ----------------------------------------
// Holds the asymmetric key pair(s) the `jwt` plugin signs/serves. Platform-wide
// (not tenant-scoped, no RLS). The plugin's `jwks` model resolves to this table
// via the adapter's `usePlural` (jwks → jwkss).
export const jwkss = pgTable('jwkss', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});
