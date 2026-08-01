import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Leads: the marketing surface's capture table.
 *
 * One table for every "leave us your details" form, distinguished by `kind`
 * ('waitlist' today; 'enterprise'/contact-sales later). Deliberately a plain
 * global table, NOT a tenant resource: it is written before anyone has an
 * account, by the public marketing site, and read by internal tooling as the
 * owner. So it carries no RLS. `status` is the internal workflow column.
 *
 * `name`/`company` are nullable because the waitlist only collects an email;
 * the contact-sales form will fill them in when that kind lands.
 *
 * When the first TENANT-scoped tables arrive, they must instead enable RLS and
 * grant the app role explicitly (see db/README or the owner/app role split in
 * migrate.ts) — this table is the exception, not the template.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default("waitlist"),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    message: text("message"),
    /** Where the submission came from, e.g. "waitlist-form". */
    source: text("source"),
    /** Best-effort client IP, for abuse triage. */
    ip: text("ip"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One row per email per kind: re-submitting the waitlist is idempotent
    // rather than piling up duplicate rows. Emails are lower-cased at the edge
    // (see the route's zod schema) so this is a true case-insensitive unique.
    uniqueIndex("leads_kind_email_key").on(t.kind, t.email),
    index("leads_status_idx").on(t.status),
    index("leads_created_at_idx").on(t.createdAt),
    index("leads_ip_created_at_idx").on(t.ip, t.createdAt),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

/**
 * Rate-limit counters: a fixed-window request limiter keyed by an opaque string
 * (e.g. `waitlist:<ip>`, `auth-fail:<ip>`). One row per key; each check is a
 * single atomic upsert that resets the window when it has elapsed and otherwise
 * increments the count (see lib/rate-limit.ts).
 *
 * Like `leads`, this is a global OPERATIONAL table, not tenant data, so it
 * carries no RLS; the migration grants the app role the read/write it needs.
 * `window_start` marks the START of the current window.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RateLimitRow = typeof rateLimits.$inferSelect;

/**
 * =============================================================================
 * FEATURE FLAGS
 * =============================================================================
 * The flags product. EVERY table here is TENANT-scoped: it carries
 * `organization_id` and is guarded by the same Postgres row-level security
 * policy (see the migration's `flagon_apply_tenant_rls` helper and the withOrg()
 * client in db/tenant.ts). Flags are ORG-global — there is no project dimension;
 * an org's flags are shared across all of its usage.
 *
 * The shape mirrors a Vercel/LaunchDarkly-grade model:
 *   flags ─┬─ flag_variants          (the values a flag can resolve to)
 *          ├─ flag_environments ──── flag_rules   (per-env config + targeting)
 *          └─ flag_revisions         (audit log)
 *   environments ── sdk_keys         (per-env client credentials)
 *   segments                          (reusable targeting condition groups)
 */

/** Shared timestamp columns. */
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * Deployment environments (Production / Preview / Development, seeded per org,
 * extensible). Every per-environment concept — flag config, targeting, SDK keys
 * — hangs off one of these.
 */
export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("environments_org_key_key").on(t.organizationId, t.key),
    index("environments_org_idx").on(t.organizationId),
  ],
);

/**
 * A flag. `type` is the value shape: boolean, string, number, or json. On/off
 * lives per-environment (flag_environments), not here. `permanent` marks a flag
 * that is not expected to be cleaned up (a kill switch), `archived_at` powers
 * the Archive view.
 */
export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("boolean"),
    permanent: boolean("permanent").notNull().default(false),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    createdByUserId: uuid("created_by_user_id"),
    maintainerUserId: uuid("maintainer_user_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("flags_org_key_key").on(t.organizationId, t.key),
    index("flags_org_idx").on(t.organizationId),
    index("flags_org_archived_idx").on(t.organizationId, t.archivedAt),
  ],
);

/**
 * The values a flag can resolve to. A boolean flag has exactly two (true/false),
 * seeded on creation; multivariate flags have any number, each with a jsonb
 * `value` and an optional human `label`.
 */
export const flagVariants = pgTable(
  "flag_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    label: text("label"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("flag_variants_flag_key_key").on(t.flagId, t.key),
    index("flag_variants_flag_idx").on(t.flagId),
    index("flag_variants_org_idx").on(t.organizationId),
  ],
);

/**
 * A flag's configuration in one environment: whether it's enabled, which variant
 * it serves by default (when enabled and no rule matches) and when off. Targeting
 * rules attach here.
 */
export const flagEnvironments = pgTable(
  "flag_environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    defaultVariantId: uuid("default_variant_id").references(
      () => flagVariants.id,
      { onDelete: "set null" },
    ),
    offVariantId: uuid("off_variant_id").references(() => flagVariants.id, {
      onDelete: "set null",
    }),
    // The default "serve" when enabled and no targeting rule matches. When null,
    // the flag serves `defaultVariantId` (a single variant). When set, it holds a
    // Serve — either { variant } or a { rollout } — so the default can itself be a
    // percentage rollout ("serve X% to everyone"). Variant references are keys.
    defaultServe: jsonb("default_serve"),
    // When set, this (flag, environment) INHERITS its evaluation config from the
    // named source environment (the "Reuse" mode). Null = the row uses its own
    // config. Resolved in flags/config.ts at load time; the engine is unaffected.
    reuseSourceEnvironmentId: uuid("reuse_source_environment_id").references(
      () => environments.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("flag_environments_flag_env_key").on(
      t.flagId,
      t.environmentId,
    ),
    index("flag_environments_org_idx").on(t.organizationId),
    index("flag_environments_env_idx").on(t.environmentId),
  ],
);

/**
 * Reusable targeting condition groups. A rule can reference a segment instead of
 * inlining conditions, so "beta users" is defined once and reused across flags.
 * `conditions` is a jsonb predicate tree over context attributes an SDK sends.
 */
export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    conditions: jsonb("conditions").notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("segments_org_key_key").on(t.organizationId, t.key),
    index("segments_org_idx").on(t.organizationId),
  ],
);

/**
 * A targeting rule within a flag's environment. Rules are evaluated in
 * `priority` order; the first whose `conditions` match serves `serve` — either a
 * single variant (`{ variantId }`) or a weighted rollout
 * (`{ rollout: [{ variantId, weight }], bucketBy }`), bucketed deterministically
 * by a key from the evaluation context.
 */
export const flagRules = pgTable(
  "flag_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagEnvironmentId: uuid("flag_environment_id")
      .notNull()
      .references(() => flagEnvironments.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(0),
    description: text("description"),
    conditions: jsonb("conditions").notNull().default(sql`'[]'::jsonb`),
    serve: jsonb("serve").notNull(),
    ...timestamps,
  },
  (t) => [
    index("flag_rules_env_priority_idx").on(
      t.flagEnvironmentId,
      t.priority,
    ),
    index("flag_rules_org_idx").on(t.organizationId),
  ],
);

/**
 * Client SDK credentials, scoped to a single environment. These are PUBLISHABLE
 * keys (they ship in client apps), so the plaintext `token` is stored and stays
 * retrievable in the console — unlike access_tokens, which stay hashed. The API
 * still authenticates OFREP calls by hashing the presented key (`keyHash`) and
 * looking it up.
 */
export const sdkKeys = pgTable(
  "sdk_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    lastFour: text("last_four").notNull(),
    // Client keys are PUBLISHABLE (they ship in client apps), so we store the
    // plaintext to make them retrievable in the console — unlike access tokens,
    // which stay hashed. Null for keys minted before this became retrievable
    // (those remain masked). keyHash is still the lookup path.
    token: text("token"),
    createdByUserId: uuid("created_by_user_id"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sdk_keys_org_idx").on(t.organizationId),
    index("sdk_keys_env_idx").on(t.environmentId),
  ],
);

/**
 * Per-flag audit log. Every mutation (create, toggle, variant change, rule edit)
 * appends a revision so the flag's history is reconstructable — the "Recent
 * Revisions" panel and full change history.
 */
export const flagRevisions = pgTable(
  "flag_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    summary: text("summary"),
    diff: jsonb("diff"),
    /**
     * Full point-in-time config of the flag AFTER this revision (variants + every
     * environment's enabled/default/off + ordered rules). Captured on every
     * mutation so the history is a complete, replayable audit trail — this is
     * what powers "view config at revision N" and rollback, and it can NEVER be
     * reconstructed after the fact, so it is recorded from day one.
     */
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("flag_revisions_flag_idx").on(t.flagId, t.createdAt),
    index("flag_revisions_org_idx").on(t.organizationId),
  ],
);

/**
 * A project: the org's foundational primitive. Almost everything else keys off a
 * project. Tenant data (org-scoped, RLS).
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    // Catalog metadata (OpsLevel-style). All optional so a project can start
    // bare and get enriched over time.
    description: text("description"),
    // The team that owns this project in the catalog. SET NULL on team delete so
    // the project survives, just unowned. Forward ref: teams is defined below.
    ownerTeamId: uuid("owner_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    lifecycle: text("lifecycle"),
    tier: text("tier"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    // The project's README (Markdown). Manually managed today; when a repository
    // is linked in the future it syncs from the repo's README.md.
    readme: text("readme"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_org_key_key").on(t.organizationId, t.key),
    index("projects_org_idx").on(t.organizationId),
    index("projects_owner_team_idx").on(t.ownerTeamId),
  ],
);

/**
 * A team: a named group of people inside an org (GitHub-style). A team owns
 * projects (the catalog owner) and carries its own membership + roles. Tenant
 * data (org-scoped, RLS).
 */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("teams_org_key_key").on(t.organizationId, t.key),
    index("teams_org_idx").on(t.organizationId),
  ],
);

/**
 * Team membership: one row per (team, user). `role` is GitHub-style —
 * 'maintainer' (can manage the team + its membership) or 'member'. Tenant data
 * (org-scoped, RLS); `organizationId` is denormalized so the row is covered by
 * the same tenant policy as everything else. `userId` points at the app-owned
 * users table with no cross-pipeline FK (same convention as createdByUserId).
 */
export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("team_members_team_user_key").on(t.teamId, t.userId),
    index("team_members_org_idx").on(t.organizationId),
    index("team_members_team_idx").on(t.teamId),
  ],
);

/**
 * Per-project access, GitHub-repository style: a team is granted a role on a
 * project ('read' | 'triage' | 'write' | 'maintain' | 'admin'). The project's
 * owning team (projects.ownerTeamId) is an implicit admin and is NOT stored here.
 * Tenant data (org-scoped, RLS).
 */
export const projectAccess = pgTable(
  "project_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("read"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_access_project_team_key").on(t.projectId, t.teamId),
    index("project_access_org_idx").on(t.organizationId),
    index("project_access_project_idx").on(t.projectId),
  ],
);

/**
 * Per-day evaluation counts, bucketed by (flag, environment, served variant,
 * reason). The OFREP endpoints upsert into this at eval time so the console can
 * show how each flag is actually being used. Tenant data (org-scoped, RLS).
 * `variant_key` is "" (not null) for error results, so the unique bucket key
 * works with ON CONFLICT (nulls would be treated as distinct).
 */
export const flagEvalRollups = pgTable(
  "flag_eval_rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    variantKey: text("variant_key").notNull().default(""),
    reason: text("reason").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flag_eval_rollups_bucket_key").on(
      t.flagId,
      t.environmentId,
      t.day,
      t.variantKey,
      t.reason,
    ),
    index("flag_eval_rollups_flag_idx").on(t.flagId, t.environmentId),
    index("flag_eval_rollups_org_idx").on(t.organizationId),
  ],
);

/**
 * Per-day billable event counts, bucketed by (organization, day, source). This is
 * the money meter (`events`): analytics/telemetry events a customer sends —
 * flag exposures today (POST /ofrep/v1/exposures), other products' events later.
 * Deliberately org-level and product-neutral: it carries no flag/environment FK,
 * so any future product can emit into it under a new `source`. Tenant data
 * (org-scoped, RLS). Contrast flag_eval_rollups, which counts the FREE checks
 * with full flag/env/variant/reason detail for the analytics views.
 */
export const usageEventRollups = pgTable(
  "usage_event_rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    day: date("day").notNull(),
    /** What produced the event, namespaced by product, e.g. "flags.exposure" (a
     *  flag exposure). The billing meter sums across sources; the label lets the
     *  invoice break it down per product later. */
    source: text("source").notNull().default("flags.exposure"),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_event_rollups_bucket_key").on(
      t.organizationId,
      t.day,
      t.source,
    ),
    index("usage_event_rollups_org_idx").on(t.organizationId),
  ],
);

/**
 * The durable, billing-grade usage log underneath usage_event_rollups.
 *
 * The rollups are a best-effort daily counter (fine for the picture, wrong to
 * invoice on). This is the AUDITABLE TRUTH: one immutable receipt per ingest
 * batch, deduplicated by `idempotencyKey` so a client retry never double-counts,
 * then compacted EXACTLY-ONCE into the rollups (see usage/events.ts). Billing
 * reconciles to this log. Rows are never deleted and only ever change to stamp
 * `compactedAt`. Tenant data — RLS-scoped by organization (migration 0016).
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    /** What produced the batch, namespaced by product; matches the rollup source. */
    source: text("source").notNull().default("flags.exposure"),
    /** The client's retry identity for this batch; unique per (org, source). */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Events in the batch, folded into the rollup count at compaction. */
    quantity: integer("quantity").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** UTC day of occurredAt; the rollup bucket this compacts into. */
    day: date("day").notNull(),
    /** NULL until folded into the rollups; the stamp that makes compaction exactly-once. */
    compactedAt: timestamp("compacted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("usage_events_idempotency_key").on(
      t.organizationId,
      t.source,
      t.idempotencyKey,
    ),
    index("usage_events_uncompacted_idx")
      .on(t.organizationId)
      .where(sql`${t.compactedAt} is null`),
  ],
);

/**
 * Atomic per-org monthly usage counter (migration 0019). The exact "events used
 * this period" number, incremented in the same transaction as each durable
 * receipt (see usage/events.ts), so it stays consistent-by-construction with
 * sum(usageEvents.quantity) for the period. `period` is the UTC calendar month
 * 'YYYY-MM' (matches usage/allowance.ts currentBillingPeriod). The notified_*
 * stamps dedup warn-first threshold emails. Tenant data — org-scoped, RLS.
 */
export const usageCounters = pgTable(
  "org_usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    /** UTC calendar month, 'YYYY-MM'. */
    period: text("period").notNull(),
    /** Exact events metered for this org in this period. */
    count: bigint("count", { mode: "number" }).notNull().default(0),
    /** Set the first time the org crosses 80% of a capped plan's allowance. */
    notified80At: timestamp("notified_80_at", { withTimezone: true }),
    /** Set the first time the org crosses 100% of a capped plan's allowance. */
    notified100At: timestamp("notified_100_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("org_usage_counters_bucket_key").on(t.organizationId, t.period),
  ],
);

export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type Environment = typeof environments.$inferSelect;
export type FlagVariant = typeof flagVariants.$inferSelect;
export type FlagEnvironment = typeof flagEnvironments.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type FlagRule = typeof flagRules.$inferSelect;
export type SdkKey = typeof sdkKeys.$inferSelect;
export type FlagRevision = typeof flagRevisions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type ProjectAccess = typeof projectAccess.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;

/** Everything the migrator and query layer should know about. */
export const schema = {
  leads,
  rateLimits,
  flags,
  environments,
  flagVariants,
  flagEnvironments,
  segments,
  flagRules,
  sdkKeys,
  flagRevisions,
  projects,
  teams,
  teamMembers,
  projectAccess,
  flagEvalRollups,
  usageEventRollups,
  usageEvents,
  usageCounters,
};

// Re-exported so callers can build raw fragments without importing drizzle-orm
// directly; keeps the db surface in one place.
export { sql };
