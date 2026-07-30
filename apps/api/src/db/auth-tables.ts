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
import { uuidv7 } from "../lib/uuid.js";

/**
 * The full auth schema, as the QUERY surface for BetterAuth (now hosted in the
 * API) and the API's own auth-table reads/writes.
 *
 * DDL OWNERSHIP STAYS WITH THE CONSOLE: these tables are created and migrated by
 * apps/app (apps/app/src/db/schema.ts + apps/app/drizzle/, tracked in the
 * `drizzle_auth` schema). This file must stay column-for-column in sync with
 * that source, but is deliberately kept OUT of the API's own migration pipeline
 * (apps/api/drizzle.config.ts points at ./schema.ts only) — it is a query
 * surface, not tables this app creates. The two apps share one Postgres; only
 * the console applies the auth DDL.
 *
 * BetterAuth's drizzle adapter is handed `authSchema` (below) directly, so these
 * tables do not need to be registered in the runtime db client. Ids are UUIDv7
 * (BetterAuth generates them via advanced.database.generateId; our own tables
 * default via `$defaultFn`).
 */

// --- BetterAuth core ---------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
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

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    // Subscription tier (hobby | pro | enterprise); billing lifecycle columns
    // written by the API's Stripe webhook (see lib/billing.ts).
    plan: text("plan").notNull().default("hobby"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    // Org base permission: who may create projects ('managers' | 'members').
    // See apps/app/src/db/schema.ts (DDL owner) + migration 0002.
    projectCreationPolicy: text("project_creation_policy").notNull().default("managers"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("organizations_stripe_customer_id_key").on(t.stripeCustomerId),
  ],
);

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

// --- Multiple emails per user (GitHub-style) --------------------------------

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
    uniqueIndex("user_emails_one_primary")
      .on(t.userId)
      .where(sql`is_primary`),
  ],
);

// --- Access tokens (personal + organization) --------------------------------

export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    type: text("type").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    lastFour: text("last_four").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
    check(
      "access_tokens_owner_check",
      sql`(${t.type} = 'personal' AND ${t.userId} IS NOT NULL AND ${t.organizationId} IS NULL)
        OR (${t.type} = 'organization' AND ${t.organizationId} IS NOT NULL AND ${t.userId} IS NULL)`,
    ),
  ],
);

/**
 * The query surface handed to BetterAuth's drizzle adapter: singular model names
 * → plural tables (the adapter indexes `authSchema[model]`). The adapter queries
 * these directly, so they need not be registered in the runtime db client.
 */
export const authSchema = {
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
