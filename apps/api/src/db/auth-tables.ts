import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * READ models for the auth tables owned and migrated by the console
 * (apps/app owns their DDL; see apps/app/src/db/schema.ts). The API only reads
 * them (and touches `access_tokens.last_used_at`) to authenticate requests, so
 * these are deliberately kept OUT of this app's `schema`/migration pipeline:
 * they are query surfaces, not tables this app creates. Column definitions must
 * stay in sync with the console's schema.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  username: text("username"),
  displayUsername: text("display_username"),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  plan: text("plan").notNull().default("hobby"),
});

export const members = pgTable("members", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull().default("member"),
});

export const accessTokens = pgTable("access_tokens", {
  id: uuid("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  prefix: text("prefix").notNull(),
  lastFour: text("last_four").notNull(),
  userId: uuid("user_id"),
  organizationId: uuid("organization_id"),
  createdByUserId: uuid("created_by_user_id"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
