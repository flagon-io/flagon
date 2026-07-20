import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth-schema";

/**
 * Typed query layer. Mirrors the SQL migrations in drizzle/. Row-level
 * security, FORCE RLS, policies, and grants are defined in the SQL migrations
 * (they need more control than the schema DSL exposes); this file is the query
 * surface.
 */

export const organizations = pgTable("organizations", {
  // UUIDv7 default (drizzle/0003_uuidv7.sql); native uuidv7() once on PG18.
  id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("projects_organization_id_key_unique").on(t.organizationId, t.key),
    index("projects_organization_id_idx").on(t.organizationId),
  ],
);

/**
 * All email addresses a user owns (drizzle/0002_user_emails.sql). Source of
 * truth for multi-email; "user".email mirrors the primary row via hooks in
 * src/lib/auth.ts. Global auth table: no RLS, no org scope.
 */
export const userEmails = pgTable(
  "user_emails",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verified: boolean("verified").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_emails_email_lower_uidx").on(sql`lower(${t.email})`),
    index("user_emails_user_id_idx").on(t.userId),
  ],
);

/**
 * BetterAuth rate limiting storage (drizzle/0004_rate_limit.sql). Global
 * infra table: no RLS, no org scope. Keyed by client identifier; the unique
 * index on key is required by the limiter's race handling.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("rate_limit_key_uidx").on(t.key)],
);

export const schema = { organizations, projects, userEmails, rateLimits };
