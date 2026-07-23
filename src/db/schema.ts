import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  boolean,
  bigint,
  integer,
  jsonb,
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
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logo: text("logo"),
  metadata: text("metadata"),
  plan: text("plan").notNull().default("free"),
  /**
   * The plan VERSION this org is on (drizzle/0037). Where its price,
   * entitlements and limits all resolve from, and what makes "who is still on
   * 2024 pricing?" a join rather than a Stripe reconciliation. Null falls back
   * to the plan's active version.
   */
  planVersionId: uuid("plan_version_id"),
  /**
   * A version change scheduled for the next renewal.
   *
   * Re-pricing mid-cycle means usage already accrued under terms that no longer
   * exist when the invoice is cut. Deferring to a cycle boundary keeps each
   * period priced entirely under one set of terms.
   */
  pendingPlanVersionId: uuid("pending_plan_version_id"),
  pendingPlanVersionAt: timestamp("pending_plan_version_at", {
    withTimezone: true,
  }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /**
   * The org's current Stripe subscription cycle (drizzle/0017), mirrored from
   * the subscription. The org is the billing entity, so this window - not the
   * calendar month - is the period the usage page and the invoice both use.
   * Null until the org subscribes.
   */
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /**
   * Set when this org has raw usage events awaiting compaction (drizzle/0025).
   * The compaction sweep drives off this instead of scanning every org, which
   * it cannot avoid otherwise: "which orgs have pending events" is a
   * cross-tenant read of tenant data. Cleared only when a run drains the org,
   * so it fails toward doing work rather than skipping it.
   */
  usagePendingAt: timestamp("usage_pending_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
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
    uniqueIndex("teams_org_name_uidx").on(
      t.organizationId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
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
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** One line for a list. The README is overviewMarkdown (drizzle/0029). */
    description: text("description").notNull().default(""),
    website: text("website").notNull().default(""),
    topics: text("topics").array().notNull().default([]),
    overviewMarkdown: text("overview_markdown").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
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
 * Catalog ownership metadata. Ownership does not grant project access.
 *
 * An owner is a team OR a person (drizzle/0026), never both and never neither:
 * a CHECK constraint enforces it, because responsibility on a real org chart
 * is often one named engineer rather than a team.
 */
export const projectOwners = pgTable(
  "project_owners",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    /** users.id is text (BetterAuth), not uuid. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("project_owners_project_id_team_id_key").on(t.projectId, t.teamId),
    index("project_owners_project_id_idx").on(t.projectId),
    index("project_owners_team_id_idx").on(t.teamId),
    index("project_owners_user_id_idx").on(t.userId),
  ],
);

/** Organization-wide boolean feature flags (drizzle/0018). */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("boolean"),
    variants: jsonb("variants")
      // `label` is optional and human-facing only; the key is what rules
      // reference and what OFREP reports (drizzle/0028 backfilled it for
      // flags created when the console still asked for keys by hand).
      .$type<Array<{ key: string; value: unknown; label?: string }>>()
      .notNull(),
    defaultVariant: text("default_variant").notNull(),
    rules: jsonb("rules").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("feature_flags_organization_id_key_key").on(t.organizationId, t.key),
    index("feature_flags_organization_id_idx").on(t.organizationId),
  ],
);

/** OFREP machine credentials. Only a SHA-256 digest is persisted. */
export const clientTokens = pgTable(
  "client_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull().unique(),
    token: text("token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("client_tokens_organization_id_idx").on(t.organizationId)],
);

/** Reusable organization-level audiences used by targeting rules. */
export const segments = pgTable(
  "segments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("segments_organization_id_key_key").on(t.organizationId, t.key),
    index("segments_organization_id_idx").on(t.organizationId),
  ],
);

/** Shared PAT and organization-token registry. Hash lookup is access-checked
 * by src/lib/access-tokens.server.ts; plaintext tokens are shown once. */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("access_tokens_subject_idx").on(t.subjectType, t.subjectId)],
);

/**
 * Usage rollups (drizzle/0016_usage.sql): one row per organization +
 * project + meter + day, keyed by the meter ids in src/lib/meters.ts.
 * Product data: tenant-scoped RLS, queried through withTenant.
 */
export const usageRollups = pgTable(
  "usage_rollups",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Dimension column, deliberately NOT a foreign key (drizzle/0017): usage
     * has to outlive the project that produced it, and the old ON DELETE SET
     * NULL folded a deleted project's history into the org-level bucket.
     */
    projectId: uuid("project_id"),
    meter: text("meter").notNull(),
    day: date("day").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_rollups_org_day_idx").on(t.organizationId, t.day),
    index("usage_rollups_org_project_day_idx").on(
      t.organizationId,
      t.projectId,
      t.day,
    ),
    index("usage_rollups_org_meter_day_idx").on(
      t.organizationId,
      t.meter,
      t.day,
    ),
  ],
);

/**
 * Raw usage events (drizzle/0024_usage_events.sql): the durable, idempotent
 * write path that feeds usage_rollups.
 *
 * usageRollups is the compacted ledger everything READS. This is what gets
 * WRITTEN, one row per caller-supplied event id, so a replayed edge batch or
 * a retried OFREP request cannot bill twice: the unique index on
 * (organization_id, meter, event_key) is the idempotency receipt.
 *
 * Rows are folded into usageRollups by the compaction worker and cleaned up
 * after a retention window; compactedAt is the marker for both.
 *
 * Product data: tenant-scoped RLS, query through withTenant.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Dimension column, not a foreign key - see usageRollups.projectId. */
    projectId: uuid("project_id"),
    meter: text("meter").notNull(),
    /** The caller's idempotency key; see src/lib/usage-events.server.ts. */
    eventKey: text("event_key").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    /** When the usage happened, not when it was received. */
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Rollup grain, derived from occurredAt at insert time. */
    day: date("day").notNull(),
    /** Set in the same transaction as the rollup upsert. NULL = pending. */
    compactedAt: timestamp("compacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_events_receipt_idx").on(
      t.organizationId,
      t.meter,
      t.eventKey,
    ),
    index("usage_events_pending_idx").on(t.organizationId, t.id),
  ],
);

/**
 * The live evaluation quota, at UTC-month grain
 * (drizzle/0024_usage_events.sql).
 *
 * Incremented in the SAME transaction that writes a usage event's receipt, so
 * a request that is rejected for quota leaves neither the receipt nor the
 * reservation behind. This table answers "may this request proceed" and
 * nothing else - money is always read from usageRollups and the frozen period
 * snapshots.
 *
 * Product data: tenant-scoped RLS, query through withTenant.
 */
export const evaluationCounters = pgTable(
  "evaluation_counters",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meter: text("meter").notNull(),
    /**
     * First day of the window this counter covers (drizzle/0027): the ORG'S
     * billing window, not the calendar month, so a cap counts the same period
     * the invoice does. An org with no subscription has no cycle, so this is
     * the first of the calendar month.
     */
    periodStart: date("period_start").notNull(),
    used: bigint("used", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("evaluation_counters_org_meter_period_idx").on(
      t.organizationId,
      t.meter,
      t.periodStart,
    ),
  ],
);

/**
 * Per-flag usage analytics (drizzle/0031_flag_usage.sql).
 *
 * Real per-flag "checks" cannot come from the server: the bulk OFREP endpoint
 * evaluates every flag on every poll, so the server sees them all identically.
 * They come from the CLIENT reporting which flags it evaluated (exposure
 * logging). These are the aggregated store, hourly grain, carrying the served
 * variant and reason so pass rate and targeting mix are derivable.
 *
 * flag_key is a dimension, not a foreign key: usage outlives a renamed flag.
 * Privacy: counts and outcomes only, never a raw targeting identity.
 *
 * Product data: tenant-scoped RLS, query through withTenant.
 */
export const flagUsageRollups = pgTable(
  "flag_usage_rollups",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    flagKey: text("flag_key").notNull(),
    /** Truncated to the hour (UTC); the client pre-aggregates to this grain. */
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    variantKey: text("variant_key").notNull(),
    /** STATIC | TARGETING_MATCH | SPLIT - see src/lib/flags.ts. */
    reason: text("reason").notNull(),
    /**
     * served | exposed (drizzle/0033): served = billed evaluations (bulk +
     * single-flag), which SUM to the invoice; exposed = client-hook app reads,
     * a different scale, used for staleness. Kept apart so neither lies.
     */
    source: text("source").notNull().default("served"),
    count: bigint("count", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flag_usage_rollups_grain_idx").on(
      t.organizationId,
      t.flagKey,
      t.hour,
      t.variantKey,
      t.reason,
      t.source,
    ),
    index("flag_usage_rollups_org_flag_hour_idx").on(
      t.organizationId,
      t.flagKey,
      t.hour,
    ),
  ],
);

/**
 * Daily fold of flag_usage_rollups (drizzle/0031): long-term history and
 * staleness, kept after the hourly rows are trimmed, so "no checks in 30 days"
 * survives hourly retention.
 */
export const flagUsageDaily = pgTable(
  "flag_usage_daily",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    flagKey: text("flag_key").notNull(),
    day: date("day").notNull(),
    variantKey: text("variant_key").notNull(),
    /** served | exposed (drizzle/0033) - see flagUsageRollups.source. */
    source: text("source").notNull().default("served"),
    count: bigint("count", { mode: "number" }).notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flag_usage_daily_grain_idx").on(
      t.organizationId,
      t.flagKey,
      t.day,
      t.variantKey,
      t.source,
    ),
    index("flag_usage_daily_org_flag_day_idx").on(
      t.organizationId,
      t.flagKey,
      t.day,
    ),
  ],
);

/**
 * Exposure batch idempotency receipts (drizzle/0031). A pre-aggregated batch
 * has no per-event key, so the batch id is the dedupe unit: a replay finds its
 * receipt and is dropped whole before any count is applied.
 */
export const flagExposureBatches = pgTable(
  "flag_exposure_batches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flag_exposure_batches_receipt_idx").on(
      t.organizationId,
      t.batchId,
    ),
  ],
);

/**
 * Sampled raw exposures for the detail page's recent-exposures stream
 * (drizzle/0031). A diagnostics aid, not an analytics source, so it is sampled
 * and short-lived. targeting_key_hash is a salted digest only - never the raw
 * id - so the stream can say "a user" without saying which.
 */
export const flagExposureSamples = pgTable(
  "flag_exposure_samples",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    flagKey: text("flag_key").notNull(),
    variantKey: text("variant_key").notNull(),
    reason: text("reason").notNull(),
    targetingKeyHash: text("targeting_key_hash"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("flag_exposure_samples_org_flag_time_idx").on(
      t.organizationId,
      t.flagKey,
      t.occurredAt,
    ),
  ],
);

/**
 * The expiring lease held while invoicing a period to Stripe
 * (drizzle/0024_usage_events.sql).
 *
 * billingPeriods.status makes invoicing idempotent once the items have landed.
 * This closes the window BEFORE that: two concurrent invoice.created
 * deliveries both see a 'closed' period, and without a claim both would attach
 * usage to the same invoice. Exactly one claimant wins the unique index; the
 * lease expires so a crashed worker cannot wedge an invoice forever, and
 * 'completed' is terminal so no expiry can revive a finished one.
 *
 * Product data: tenant-scoped RLS, query through withTenant.
 */
export const billingInvoiceClaims = pgTable(
  "billing_invoice_claims",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    billingPeriodId: uuid("billing_period_id"),
    /** claimed | completed | failed - see the migration. */
    status: text("status").notNull().default("claimed"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("billing_invoice_claims_invoice_idx").on(
      t.organizationId,
      t.stripeInvoiceId,
    ),
    index("billing_invoice_claims_period_idx").on(t.billingPeriodId),
  ],
);

/**
 * A closed billing period: the frozen record of what an org was billed
 * (drizzle/0017_billing_periods.sql).
 *
 * usage_rollups is the live ledger and is re-priced from today's meter
 * registry on every read. A period that has been billed must never move, so
 * closing one writes this row plus one billingPeriodLines row per
 * meter/project carrying the rate that applied at the time. Closed periods
 * are read from here; only the open period is computed live.
 *
 * Product data: tenant-scoped RLS, query through withTenant.
 */
export const billingPeriods = pgTable(
  "billing_periods",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** open | closed | invoiced | void - see the migration. */
    status: text("status").notNull().default("open"),
    /** The plan as it was, so a downgrade can't rewrite an old bill. */
    plan: text("plan").notNull(),
    includedCreditCents: integer("included_credit_cents").notNull().default(0),
    usageCents: integer("usage_cents").notNull().default(0),
    creditAppliedCents: integer("credit_applied_cents").notNull().default(0),
    overageCents: integer("overage_cents").notNull().default(0),
    stripeInvoiceId: text("stripe_invoice_id"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("billing_periods_org_start_desc_idx").on(
      t.organizationId,
      t.periodStart,
    ),
  ],
);

/**
 * One frozen line of a closed period: a meter, optionally a project, the
 * quantity, and the RATE THAT APPLIED. Re-pricing a meter tomorrow cannot
 * move these numbers, which is what lets a historical usage page and the
 * invoice that was actually paid agree forever.
 */
export const billingPeriodLines = pgTable(
  "billing_period_lines",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    billingPeriodId: uuid("billing_period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "cascade" }),
    meter: text("meter").notNull(),
    product: text("product").notNull(),
    /** Dimension columns; the name is snapshotted so deletes stay readable. */
    projectId: uuid("project_id"),
    projectName: text("project_name"),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    per: bigint("per", { mode: "number" }).notNull(),
    includedQuantity: bigint("included_quantity", { mode: "number" })
      .notNull()
      .default(0),
    costCents: integer("cost_cents").notNull().default(0),
    /**
     * How this line was treated when the period closed (drizzle/0032):
     * priced (pro/free), covered (enterprise, volume, cost 0), or metered
     * (enterprise, per-cycle overage billed). Frozen so history never depends
     * on today's contract.
     */
    billingMode: text("billing_mode").notNull().default("priced"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("billing_period_lines_period_idx").on(t.billingPeriodId)],
);

/**
 * The meter catalog (drizzle/0037), mirrored from src/lib/meters.ts.
 *
 * Meters are DECLARED IN CODE because they are wired to instrumentation - a
 * meter nothing emits is not a meter. This table exists so anything that cannot
 * import that TypeScript (the operator console) can still read labels and
 * units. src/lib/meters.test.ts fails if the two disagree, which is what keeps
 * the mirror honest.
 */
export const meters = pgTable("meters", {
  id: text("id").primaryKey(),
  product: text("product").notNull(),
  label: text("label").notNull(),
  unit: text("unit").notNull(),
  description: text("description").notNull().default(""),
  /** The rate charged when no plan version overrides it. */
  unitAmountCents: integer("unit_amount_cents").notNull().default(0),
  per: bigint("per", { mode: "number" }).notNull(),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A plan, versioned, in full (drizzle/0037): what it costs, what it includes,
 * what it limits, and what the pricing page says about it.
 *
 * ONE ROW PER VERSION, and the whole plan is in it. The alternative - price in
 * the database, entitlements in constants, marketing copy in JSX - is what let
 * a price change ship a page describing the old number, and made "give Pro 100M
 * evaluations" a code change.
 *
 * Publishing a new version supersedes the old one for NEW subscriptions and
 * moves nobody. An org points at the version it bought (organizations
 * .planVersionId) and keeps it until deliberately moved, so grandfathering is
 * the default rather than a feature.
 *
 * Catalog data: global, no RLS, read by everyone, written by the operator
 * console as the owner.
 */
export const planVersions = pgTable(
  "plan_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    /** free | pro | enterprise. The stable plan identity across versions. */
    plan: text("plan").notNull(),
    /** Monotonic within a plan, for ordering and display ("Pro v3"). */
    version: integer("version").notNull().default(1),
    /** active (sellable, one per plan+interval) | legacy (still in force) | draft. */
    status: text("status").notNull().default("draft"),
    /** Operator-facing label ("Pro 2026"). */
    label: text("label").notNull(),

    /**
     * Is this a subscription at all?
     *
     * False for Hobby. An unbilled tier has no Stripe price, produces no
     * invoice, and must never render as "$0.00/month" beside real money.
     * Surfaces branch on this rather than on `plan = 'free'`, so a future
     * unbilled tier works without special-casing its name.
     */
    billable: boolean("billable").notNull().default(true),
    /** Null for an unbilled tier, and for enterprise (priced per contract). */
    unitAmountCents: integer("unit_amount_cents"),
    currency: text("currency").notNull().default("usd"),
    interval: text("interval").notNull().default("month"),
    /** Pooled usage credit the fee returns as. Null when there is none. */
    includedCreditCents: integer("included_credit_cents"),
    stripePriceId: text("stripe_price_id"),
    stripeProductId: text("stripe_product_id"),

    // --- Marketing, on the same row as the numbers it describes -------------
    displayName: text("display_name").notNull().default(""),
    tagline: text("tagline").notNull().default(""),
    /** Bullets, in order. May contain {tokens}; see src/lib/plan-copy.ts. */
    features: jsonb("features").$type<string[]>().notNull().default([]),
    /** Shown on the pricing page. */
    listed: boolean("listed").notNull().default(false),
    /** The emphasised column ("Popular"). */
    highlight: boolean("highlight").notNull().default(false),
    /** Can a customer pick this themselves? Enterprise is contact-only. */
    selfServe: boolean("self_serve").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),

    // --- Limits: what a plan may CREATE (null = unlimited) ------------------
    maxProjects: integer("max_projects"),
    maxMembers: integer("max_members"),
    maxFreeOrgs: integer("max_free_orgs"),

    effectiveFrom: date("effective_from"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plan_versions_plan_idx").on(t.plan, t.createdAt)],
);

/**
 * What one plan version gives you, per meter (drizzle/0037).
 *
 * Rows rather than the jsonb blobs 0035 used, because these are now EDITED: a
 * row can be constrained and rendered as a table without the console
 * reconciling two parallel objects keyed by meter id.
 *
 * The three modes are different products, not degrees of one - see the
 * migration. `unavailable` in particular is not "an allowance of zero": it means
 * the plan does not offer the product, where zero means it bills from the first
 * unit.
 */
export const planVersionMeters = pgTable(
  "plan_version_meters",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "cascade" }),
    meter: text("meter").notNull(),
    /** included | metered | unavailable. */
    mode: text("mode").notNull().default("included"),
    /** Units included each cycle before pricing starts. */
    includedQuantity: bigint("included_quantity", { mode: "number" })
      .notNull()
      .default(0),
    /**
     * What a unit costs ON THIS PLAN, as cents per `per` units. Null inherits
     * the meter's published rate. Cents-per-N is what makes sub-cent pricing
     * exact: $0.0025 per event is 250 cents per 100,000.
     */
    unitAmountCents: integer("unit_amount_cents"),
    per: bigint("per", { mode: "number" }),
    /** Units before requests are REFUSED. Null = never refuse (bill instead). */
    hardCap: bigint("hard_cap", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plan_version_meters_version_idx").on(t.planVersionId)],
);

/**
 * Per-organization entitlement overrides (drizzle/0036_org_entitlements.sql):
 * the custom deal, for ANY plan.
 *
 * The missing middle between the PLANS constants (same for everyone on a plan)
 * and org_contracts (structurally enterprise-only). This is what lets a Pro
 * customer paying $100/mo actually RECEIVE $100 of credit instead of the
 * plan constant's $20.
 *
 * Every field means "inherit" when null/empty, and they compose in one
 * direction: PLANS -> plan_prices -> org_entitlements -> org_contracts. See
 * src/lib/entitlements.ts for the resolution.
 */
export const orgEntitlements = pgTable(
  "org_entitlements",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Null means INHERIT, which is not the same as 0. Zero is a real sellable
     * configuration ("every unit is billable"), so the two must be distinct.
     */
    includedCreditCents: integer("included_credit_cents"),
    /** Merged OVER the price's allowances per meter, so a partial override is safe. */
    meterAllowances: jsonb("meter_allowances")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    /** Moves one customer's per-unit price without touching the published rate. */
    meteredRates: jsonb("metered_rates")
      .$type<Record<string, { unit_amount_cents: number; per: number }>>()
      .notNull()
      .default({}),
    /**
     * Null inherits; an explicit {} is EXPLICITLY UNCAPPED - how you lift
     * Hobby's cap for a trial without moving the org off Hobby.
     */
    hardCaps: jsonb("hard_caps").$type<Record<string, number>>(),
    note: text("note"),
    /** active (one per org) | void (superseded, kept for history). */
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("org_entitlements_org_idx").on(t.organizationId, t.createdAt)],
);

/**
 * The negotiated envelope for a contracted organization
 * (drizzle/0030_org_contracts.sql).
 *
 * Enterprise pricing is fixed up front from usage estimates, so metered value
 * is not what the customer owes. This row is what the contracted usage view
 * reads instead of dollars: volume agreed for the whole term, drawn down
 * cumulatively across it, so a heavy summer and a quiet winter net out
 * exactly as the agreement intends.
 *
 * Product data: tenant-scoped RLS, query through withTenant.
 */
export const orgContracts = pgTable(
  "org_contracts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Inclusive day window, matching the usage_rollups grain. */
    termStart: date("term_start").notNull(),
    termEnd: date("term_end").notNull(),
    /**
     * Contracted volume per meter for the whole term, keyed by meter id. Same
     * shape as PLANS[plan].meterAllowances: a contract is a plan instance for
     * one organization. Quantity, never cents - re-pricing a meter must not
     * change what the agreement covered.
     */
    meterAllowances: jsonb("meter_allowances")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    /**
     * Per-CYCLE included quantity for METERED meters (drizzle/0032), keyed by
     * meter id. Resets every billing cycle, unlike the term-wide
     * meterAllowances. A metered meter absent here uses the meter's own
     * includedQuantity. This is the GitHub Actions "included minutes" knob.
     */
    meteredAllowances: jsonb("metered_allowances")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    /**
     * Optional negotiated overage rate per metered meter (drizzle/0032). Absent
     * meter uses the published rate (src/lib/meters.ts). Lets a contract move a
     * per-unit price without moving the global rate.
     */
    meteredRates: jsonb("metered_rates")
      .$type<Record<string, { unit_amount_cents: number; per: number }>>()
      .notNull()
      .default({}),
    note: text("note"),
    /** active | expired | void - see the migration. */
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("org_contracts_org_term_idx").on(t.organizationId, t.termStart),
  ],
);

/**
 * Enterprise proposals (drizzle/0034_org_proposals.sql): an offer of contract
 * terms + a price sent to a prospect as a signed link they approve or decline.
 *
 * GLOBAL, no RLS - accessed by an unguessable token digest before any org
 * session exists (like an emailed verification link), so it is classified
 * auth-layer and access-checked in application code (proposals.server.ts), NOT
 * by tenant policy. Carries the PRICE that org_contracts does not; on
 * acceptance the operator provisions (price -> Stripe, terms -> org_contracts).
 */
export const orgProposals = pgTable(
  "org_proposals",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** SHA-256 hex digest of the link token; the raw token is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").notNull().default("draft"),
    termStart: date("term_start").notNull(),
    termEnd: date("term_end").notNull(),
    meterAllowances: jsonb("meter_allowances")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    meteredAllowances: jsonb("metered_allowances")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    meteredRates: jsonb("metered_rates")
      .$type<Record<string, { unit_amount_cents: number; per: number }>>()
      .notNull()
      .default({}),
    baseFeeCents: integer("base_fee_cents").notNull().default(0),
    interval: text("interval").notNull().default("year"),
    message: text("message"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("org_proposals_org_idx").on(t.organizationId, t.createdAt),
    index("org_proposals_status_idx").on(t.status),
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
  projectOwners,
  featureFlags,
  clientTokens,
  segments,
  accessTokens,
  usageRollups,
  usageEvents,
  evaluationCounters,
  billingPeriods,
  billingPeriodLines,
  billingInvoiceClaims,
  userEmails,
  rateLimits,
  leads,
};
