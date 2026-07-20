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
  logo: text("logo"),
  metadata: text("metadata"),
  plan: text("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Org membership (BetterAuth organization plugin; drizzle/0007). Auth-layer
 * table: plugin-authorized, no RLS (see the migration's authorization note).
 */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("members_org_user_uidx").on(t.organizationId, t.userId),
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
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    teamId: text("team_id"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invitations_organization_id_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
    index("invitations_inviter_id_idx").on(t.inviterId),
  ],
);

/**
 * Teams: named groups of org members (drizzle/0012_teams.sql). Auth-layer
 * tables managed by the BetterAuth organization plugin - no RLS, like
 * members/invitations. Teams will hold access grants to org resources
 * (projects, flags) as those surfaces land.
 */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("teams_org_name_uidx").on(t.organizationId, sql`lower(${t.name})`),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("team_members_team_user_uidx").on(t.teamId, t.userId),
    index("team_members_user_id_idx").on(t.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("projects_organization_id_slug_key").on(t.organizationId, t.slug),
    index("projects_organization_id_idx").on(t.organizationId),
  ],
);

/**
 * Project access grants (drizzle/0014_project_roles.sql): users and teams
 * hold a role (read/write/admin) on a project, repository-style. Product
 * data: tenant-scoped RLS via the denormalized organization_id.
 */
export const projectRoles = pgTable(
  "project_roles",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("project_roles_project_id_subject_type_subject_id_key").on(
      t.projectId,
      t.subjectType,
      t.subjectId,
    ),
    index("project_roles_project_id_idx").on(t.projectId),
    index("project_roles_subject_idx").on(t.subjectType, t.subjectId),
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

/**
 * Sales leads from the contact-sales form (drizzle/0010_leads.sql). Not a
 * public API resource; consumed by internal tooling. No RLS.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull().default("enterprise"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company").notNull(),
    companySize: text("company_size"),
    message: text("message"),
    source: text("source"),
    ip: text("ip"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_status_idx").on(t.status),
    index("leads_created_at_idx").on(t.createdAt),
    index("leads_ip_created_at_idx").on(t.ip, t.createdAt),
  ],
);

export const schema = {
  organizations,
  members,
  invitations,
  teams,
  teamMembers,
  projects,
  projectRoles,
  userEmails,
  rateLimits,
  leads,
};
