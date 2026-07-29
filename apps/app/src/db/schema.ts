import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../lib/uuid";

/**
 * The console's authentication schema.
 *
 * This app (app.flagon.io) owns authentication, so the auth tables live here
 * rather than in the API's schema. They share the ONE Postgres instance with
 * the API's product tables (`leads`, ...), but the two apps keep independent
 * drizzle migration pipelines pointed at different tracking schemas (see
 * db/migrate.ts) so neither steps on the other.
 *
 * Identifiers: every primary key and foreign key is a native `uuid` holding a
 * UUIDv7 (time-ordered). BetterAuth generates its ids via advanced.database
 * .generateId (see lib/auth.ts); our own tables default them with `$defaultFn`.
 * Postgres 17 has no `uuidv7()`, so generation is in the app, not a DB default.
 *
 * Table naming: SQL tables are PLURAL (`users`, `sessions`, ...). BetterAuth
 * refers to its models by singular names ("user"), so the `schema` object below
 * maps each singular model key to its plural table object; BetterAuth's drizzle
 * adapter indexes `schema[model]` by that key and never sees the SQL name.
 */

// --- BetterAuth core ---------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  // Mirrors the current PRIMARY address. `user_emails` is the source of truth
  // for the full set; this column is what BetterAuth authenticates against and
  // is kept in sync when the primary changes.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // GitHub-style identity (username plugin). Nullable at the DB layer because
  // BetterAuth creates the user row before the username is attached; signup
  // enforces that one is always supplied (see the signup flow).
  username: text("username").unique(),
  displayUsername: text("display_username"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Which organization the console is currently scoped to. Set on sign-in and
    // when the user switches orgs; drives /<org> routing.
    activeOrganizationId: uuid("active_organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    // The password hash for email+password accounts (providerId 'credential').
    // Null for social accounts, which land here later.
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey(),
    // The subject being verified (an email, a reset request, etc.).
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// --- BetterAuth organization plugin -----------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  // Our additional field: the subscription tier (hobby | pro | enterprise).
  // Pro is now a paid, Stripe-backed plan; this column is set by the billing
  // webhook, not by users. It stays the fast, local read every gate consults.
  plan: text("plan").notNull().default("hobby"),
  // Stripe mapping for flat $20/mo Pro. `stripe_customer_id` is the org's
  // Stripe Customer (one per org, unique); `stripe_subscription_id` its active
  // Pro subscription; `subscription_status` mirrors the Stripe subscription
  // status. All three are written by the webhook / billing actions, never by
  // the general settings form. See src/lib/billing.ts.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  // BetterAuth stores arbitrary org metadata as a JSON string here.
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // The webhook resolves an org from a Stripe customer id; enforce one org per
  // customer. NULLs are distinct in Postgres, so unlinked orgs coexist.
  uniqueIndex("organizations_stripe_customer_id_key").on(t.stripeCustomerId),
]);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A user appears at most once per organization.
    uniqueIndex("members_org_user_key").on(t.organizationId, t.userId),
    index("members_user_id_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invitations_org_id_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
  ],
);

// --- Ours: GitHub-style multiple emails per user -----------------------------

/**
 * Every email a user has added, verified or not. `users.email` mirrors the row
 * flagged `is_primary`. Sign-in accepts any VERIFIED address here (resolved to
 * the owning user before the password check), matching GitHub. Emails are
 * stored lower-cased so the unique index is effectively case-insensitive.
 */
export const userEmails = pgTable(
  "user_emails",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verified: boolean("verified").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_emails_email_key").on(t.email),
    index("user_emails_user_id_idx").on(t.userId),
    // At most one primary address per user.
    uniqueIndex("user_emails_one_primary")
      .on(t.userId)
      .where(sql`is_primary`),
  ],
);

// --- Ours: access tokens (personal + organization) for the API ---------------

/**
 * API access tokens, deliberately generic so ONE table backs both personal
 * access tokens (owned by a user) and organization access tokens (owned by an
 * org, so teams do not need service-account users). `type` discriminates the
 * two and a CHECK enforces exactly one owner. `created_by_user_id` records who
 * minted it, for audit, and survives that user's deletion (SET NULL) so an org
 * token outlives its author.
 *
 * The plaintext token (`flagon_pat_<random>` / `flagon_oat_<random>`) is shown
 * once; we persist only its SHA-256 hash, so the API authenticates a presented
 * token with a single hashed lookup and never imports BetterAuth. `prefix` and
 * `lastFour` are non-secret fragments for display.
 *
 * NOTE: feature-flag CLIENT tokens (read-only flag evaluation) will be their
 * own table when flags land. Do not fold them in here.
 */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    type: text("type").notNull(), // 'personal' | 'organization'
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    lastFour: text("last_four").notNull(),
    // Owner. Exactly one of these is set, enforced by the CHECK below.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    // Who minted the token (audit). Kept even if that user is later removed.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Reserved for future scoping (comma/JSON list). Null = full access.
    scopes: text("scopes"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("access_tokens_user_id_idx").on(t.userId),
    index("access_tokens_org_id_idx").on(t.organizationId),
    // Exactly one owner, matching the declared type.
    check(
      "access_tokens_owner_check",
      sql`(${t.type} = 'personal' AND ${t.userId} IS NOT NULL AND ${t.organizationId} IS NULL)
        OR (${t.type} = 'organization' AND ${t.organizationId} IS NOT NULL AND ${t.userId} IS NULL)`,
    ),
  ],
);

// Types
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type UserEmail = typeof userEmails.$inferSelect;
export type AccessToken = typeof accessTokens.$inferSelect;

/**
 * The query/adapter surface. Keys are BetterAuth's singular model names mapped
 * to the plural tables; that is what its drizzle adapter indexes. Our own tables
 * are included too so the drizzle client knows about them.
 */
export const schema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  organization: organizations,
  member: members,
  invitation: invitations,
  userEmail: userEmails,
  accessToken: accessTokens,
};

export { sql };
