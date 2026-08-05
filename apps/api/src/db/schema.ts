import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
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
 * Rate-limit counters: a fixed-window request limiter keyed by an opaque string
 * (e.g. `auth-fail:<ip>`). One row per key; each check is a single atomic upsert
 * that resets the window when it has elapsed and otherwise increments the count
 * (see lib/rate-limit.ts).
 *
 * This is a global OPERATIONAL table, not tenant data, so it carries no RLS; the
 * migration grants the app role the read/write it needs. `window_start` marks the
 * START of the current window.
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
 *   environments ── client_keys         (per-env client credentials)
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
 * extensible). Every per-environment concept — flag config, targeting, client keys
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
export const clientKeys = pgTable(
  "client_keys",
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
    // Exposures default-on: remote evaluations on this key auto-log a billable
    // exposure (deduped per session). On by default; a customer can turn it off
    // per key.
    autoExpose: boolean("auto_expose").notNull().default(true),
    createdByUserId: uuid("created_by_user_id"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("client_keys_org_idx").on(t.organizationId),
    index("client_keys_env_idx").on(t.environmentId),
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
    // The primary stack/framework (Vercel-style preset), a slug from the fixed
    // registry the API validates. A catalog hint today; the deploy preset when
    // Deployments lands.
    framework: text("framework"),
    // The project's icon/logo URL (an uploaded asset), shown in the catalog in
    // place of the generated monogram. Null = fall back to the monogram.
    image: text("image"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    // The component's kind (service/library/website/datastore/...), a slug from
    // the fixed registry the API validates. A catalog classifier; null = unset.
    kind: text("kind"),
    // Free-form business domains this project belongs to (e.g. "payments"). Not a
    // managed entity — plain strings, deliberately light. Used for grouping/filter.
    domains: text("domains").array().notNull().default(sql`ARRAY[]::text[]`),
    // External links (runbook / dashboard / on-call / docs...), each {type,label,url}.
    links: jsonb("links").$type<ProjectLink[]>().notNull().default(sql`'[]'::jsonb`),
    // MANUAL repository linking (the console pastes a URL; provider + name are
    // parsed from it). A future Git integration populates these same columns.
    repoUrl: text("repo_url"),
    repoProvider: text("repo_provider"),
    repoName: text("repo_name"),
    repoDefaultBranch: text("repo_default_branch"),
    repoVisibility: text("repo_visibility"),
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

/** One external link on a project's catalog entry (stored in projects.links jsonb). */
export type ProjectLink = { type: string; label: string | null; url: string };

/**
 * A directed relation between projects (dependency / service-map edge):
 * source --type--> target. `type` is depends_on | part_of | related_to. The
 * target is a project today (target_kind 'project'); target_kind leaves room to
 * point at a package later without a schema change. Tenant data (org-scoped, RLS).
 */
export const projectRelations = pgTable(
  "project_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    sourceProjectId: uuid("source_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    targetKind: text("target_kind").notNull().default("project"),
    targetProjectId: uuid("target_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_relations_edge_key").on(
      t.sourceProjectId,
      t.type,
      t.targetProjectId,
    ),
    index("project_relations_source_idx").on(t.sourceProjectId),
    index("project_relations_target_idx").on(t.targetProjectId),
    index("project_relations_org_idx").on(t.organizationId),
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
    /** NULL until reported to the Stripe meter; the stamp that makes REPORTING exactly-once. */
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    /** The usage_meter_reports row that carried this receipt's quantity to Stripe. */
    reportId: uuid("report_id"),
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
    index("usage_events_unreported_idx")
      .on(t.organizationId)
      .where(sql`${t.reportedAt} is null`),
  ],
);

/**
 * The Stripe-reporting ledger for metered billing (migration 0020). One row per
 * (claim, source): `id` is the Stripe meter-event `identifier` (its 24h dedup key),
 * paired with our own `status` so reporting is exactly-once across crashes — a row is
 * created 'pending' in the claim transaction, then flipped to 'sent' once
 * billing.meterEvents.create succeeds. Tenant data — org-scoped, RLS.
 */
export const usageMeterReports = pgTable(
  "usage_meter_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    /** The durable-event source this report covers (e.g. 'flags.exposure'). */
    source: text("source").notNull(),
    /** The Stripe Billing Meter event_name usage was reported under. */
    eventName: text("event_name").notNull(),
    /** The customer the meter event was attributed to. */
    stripeCustomerId: text("stripe_customer_id").notNull(),
    /** Exposures in this report (summed from the claimed receipts). */
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    /** 'pending' (claimed, not yet sent), 'sent' (accepted), 'skipped'. */
    status: text("status").notNull().default("pending"),
    /** The 'YYYY-MM' the reported receipts fell in (for the tie-out). */
    periodKey: text("period_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Stamped when a Stripe MeterEventSummary has confirmed this send landed. */
    stripeSummaryVerifiedAt: timestamp("stripe_summary_verified_at", {
      withTimezone: true,
    }),
  },
  (t) => [
    index("usage_meter_reports_pending_idx")
      .on(t.organizationId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * The idempotent $50-credit ledger (migration 0020). One row per (org, period); the
 * UNIQUE(org, period) constraint is the idempotency key — the single INSERT ... ON
 * CONFLICT DO NOTHING that returns a row is the sole caller allowed to create the
 * Stripe credit grant for that period, so a webhook redelivery never double-grants.
 * Tenant data — org-scoped, RLS (written inside withOrg from the webhook/backfill).
 */
export const billingCreditGrants = pgTable(
  "billing_credit_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    periodKey: text("period_key").notNull(),
    /** Stripe credit grant id; NULL means "row claimed, Stripe create still owed". */
    stripeGrantId: text("stripe_grant_id"),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("billing_credit_grants_org_period_key").on(
      t.organizationId,
      t.periodKey,
    ),
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

/**
 * An uploaded object (org logo today; project screenshots, avatars later).
 * Tenant data (org-scoped, RLS). Stores the LOGICAL bucket id + key (see
 * lib/storage.ts), never a physical bucket name, so introducing a second bucket
 * needs no backfill — every asset already records where it lives. Bytes go
 * straight to the store via a presigned PUT; the row is created `pending` at
 * presign time and flipped to `ready` once the object is confirmed by HEAD.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    visibility: text("visibility").notNull().default("public"),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    // What the asset is for (e.g. "org-logo"), so a surface can locate its asset.
    purpose: text("purpose"),
    // pending (presigned, not yet uploaded) | ready (object confirmed present).
    status: text("status").notNull().default("pending"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("assets_org_idx").on(t.organizationId),
    uniqueIndex("assets_bucket_key_key").on(t.bucket, t.key),
  ],
);

/**
 * =============================================================================
 * EXPERIMENTS
 * =============================================================================
 * Experimentation built ON TOP of flags: an experiment IS a flag — the serving
 * flag's deterministic bucketing (flags/evaluate.ts) is the assignment engine,
 * UNCHANGED — plus experiment metrics (goal events) and a statistics engine.
 * OpenFeature SDKs already assign users to arms through the standard OFREP
 * `evaluate` response (variant + reason), so OFREP is untouched. Every table
 * here is TENANT-scoped (organization_id + the same RLS policy as flags).
 *
 *   experiment_metrics                       (reusable goal-metric definitions)
 *   experiments ─┬─ experiment_metric_links  (primary/secondary/guardrail metrics)
 *                ├─ experiment_exposures      (per-unit assignment truth)
 *                └─ experiment_results        (daily per-variant/metric aggregates)
 *   experiment_metric_events                 (per-unit goal events; analysis detail)
 *
 * NAMING: every table is prefixed `experiment_` and the billing source is
 * `experiments.metric`, so this feature's "metrics" never collide with a future
 * OTEL/observability metrics product — these are EXPERIMENT goal metrics, a
 * distinct concept, and are kept entirely within the experiments feature.
 *
 * Billing is NOT here: goal (metric) events meter through the shared durable
 * spine (usage_events) under source "experiments.metric"; these tables carry only
 * what the stats engine needs. Unit identities are stored as a SALTED HASH of the
 * targeting key (lib/unit-hash.ts) — a raw targeting key is never persisted.
 */

/**
 * A reusable EXPERIMENT metric definition: the outcome an experiment measures.
 * `type` is the aggregation — 'conversion' (did the unit fire the event at least
 * once), 'count' (events per unit), 'mean'/'sum' (a numeric `value` on the event,
 * read from `valueField`). `eventName` is the track() event that feeds it;
 * `direction` says whether up is good (so lift is scored the right way). Named
 * `experiment_metrics` (not `metrics`) to stay clear of future OTEL metrics.
 */
export const experimentMetrics = pgTable(
  "experiment_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("conversion"),
    /** The track() event name whose occurrences feed this metric. */
    eventName: text("event_name").notNull(),
    /** JSON path into the event for the numeric value ('mean'/'sum' metrics). */
    valueField: text("value_field"),
    /** 'increase' = a higher value is the win; 'decrease' = lower is better. */
    direction: text("direction").notNull().default("increase"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("experiment_metrics_org_key_key").on(t.organizationId, t.key),
    index("experiment_metrics_org_idx").on(t.organizationId),
    index("experiment_metrics_org_event_idx").on(t.organizationId, t.eventName),
  ],
);

/**
 * An experiment: a measured rollout of one flag. The arms are the serving flag's
 * variants; `controlVariantKey` marks the baseline everything is compared to.
 * `allocation` is the percent of eligible traffic entering the experiment (the
 * flag's own targeting still gates who is eligible). `status` drives the
 * lifecycle (draft → running → stopped/archived); `decision` records the
 * conclusion once stopped.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    hypothesis: text("hypothesis"),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    /** The variant key treated as the control (baseline) arm. */
    controlVariantKey: text("control_variant_key"),
    /** Percent (0-100) of eligible traffic that enters the experiment. */
    allocation: integer("allocation").notNull().default(100),
    /** Context path to bucket by; null = the evaluation targetingKey. */
    bucketBy: text("bucket_by"),
    /** Confidence level (%) for CIs + significance; alpha = 1 - level/100. */
    confidenceLevel: integer("confidence_level").notNull().default(95),
    /** Headline significance uses the always-valid sequential test (safe to peek). */
    sequential: boolean("sequential").notNull().default(true),
    /** Multiple-hypothesis correction across the metric family: 'none' | 'bonferroni' | 'bh'. */
    correction: text("correction").notNull().default("none"),
    /** CUPED variance reduction: adjust each metric by its pre-exposure covariate. */
    cuped: boolean("cuped").notNull().default(false),
    primaryMetricId: uuid("primary_metric_id").references(
      () => experimentMetrics.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** 'ship' | 'rollback' | 'inconclusive', set when the experiment is decided. */
    decision: text("decision"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("experiments_org_key_key").on(t.organizationId, t.key),
    index("experiments_org_idx").on(t.organizationId),
    index("experiments_flag_idx").on(t.flagId),
  ],
);

/**
 * The link between an experiment and a metric definition, each with a `role`:
 * 'primary' (the decision metric), 'secondary' (also-measured), or 'guardrail'
 * (must not regress). The experiment's `primaryMetricId` is the canonical
 * primary; this table is the full set (a metric can be reused across
 * experiments). Named `experiment_metric_links` so the definition table can be
 * the natural `experiment_metrics`.
 */
export const experimentMetricLinks = pgTable(
  "experiment_metric_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => experimentMetrics.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("secondary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("experiment_metric_links_exp_metric_key").on(
      t.experimentId,
      t.metricId,
    ),
    index("experiment_metric_links_org_idx").on(t.organizationId),
    index("experiment_metric_links_exp_idx").on(t.experimentId),
  ],
);

/**
 * The per-unit assignment truth, keyed to the FLAG (not an experiment): one row
 * the first time a unit is exposed to a flag in an environment, recording which
 * variant it saw. This is ALWAYS-ON — written for every attributed exposure, with
 * or without an experiment — so both flag-level impact and experiments read it.
 * Metric events join here on `unitHash` (a salted hash of the targeting key, never
 * the raw key) so outcomes attribute to the arm the unit actually saw. The unique
 * (flag, environment, unit) key makes ingest idempotent per unit and freezes the
 * assignment (a unit can't flip arms). An experiment analyzes this table filtered
 * to its (flag, environment); a plain flag's impact analyzes all of it.
 */
export const flagExposures = pgTable(
  "flag_exposures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    variantKey: text("variant_key").notNull(),
    /** Salted sha256 of the targeting key (lib/unit-hash.ts); never the raw key. */
    unitHash: text("unit_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    day: date("day").notNull(),
  },
  (t) => [
    uniqueIndex("flag_exposures_flag_env_unit_key").on(
      t.flagId,
      t.environmentId,
      t.unitHash,
    ),
    index("flag_exposures_org_idx").on(t.organizationId),
    index("flag_exposures_flag_env_variant_idx").on(
      t.flagId,
      t.environmentId,
      t.variantKey,
    ),
  ],
);

/**
 * The metrics "watched" on a flag: which goal metrics show impact on the flag
 * detail, independent of any experiment. A plain flag with a rollout + a watched
 * metric gets automatic per-variant impact (Statsig's model). Experiments keep
 * their own experiment_metric_links (they add roles + a designated control).
 */
export const flagMetricLinks = pgTable(
  "flag_metric_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => experimentMetrics.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("flag_metric_links_flag_metric_key").on(t.flagId, t.metricId),
    index("flag_metric_links_org_idx").on(t.organizationId),
    index("flag_metric_links_flag_idx").on(t.flagId),
  ],
);

/**
 * A holdout: a deterministic global control group held OUT of all experiments in an
 * environment. `percentage` of units (bucketed by targeting key, stable) are served
 * the flag's default/control on any flag with a running experiment — so you can
 * measure the aggregate long-run impact of your whole experimentation program
 * against a pristine baseline (Statsig's holdout). Enforced at evaluation time.
 */
export const holdouts = pgTable(
  "holdouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Percent (0-100) of units held out of experiments. */
    percentage: integer("percentage").notNull().default(5),
    /** 'active' (enforced) | 'stopped'. */
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("holdouts_org_key_key").on(t.organizationId, t.key),
    index("holdouts_org_idx").on(t.organizationId),
    index("holdouts_env_status_idx").on(t.environmentId, t.status),
  ],
);

/**
 * Per-unit goal events — the ANALYSIS detail behind experiment metrics (billing
 * is separate: the same batch meters through usage_events under source
 * "experiments.metric"). One row per track() event: `eventName` matches a metric's
 * `eventName`, `value` is the numeric payload for mean/sum metrics (1 for plain
 * conversions). Joined to experiment_exposures on `unitHash` where occurredAt is
 * after first exposure. Named `experiment_metric_events` to stay clear of future
 * OTEL metrics telemetry.
 */
export const experimentMetricEvents = pgTable(
  "experiment_metric_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    /** Salted hash of the targeting key; the join key to experiment_exposures. */
    unitHash: text("unit_hash").notNull(),
    eventName: text("event_name").notNull(),
    value: doublePrecision("value").notNull().default(1),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    day: date("day").notNull(),
    /** Per-row idempotency key ("<batch Idempotency-Key>:<index>") so a retried
     *  /track batch (same header) is inserted exactly once. Null when the client
     *  sent no Idempotency-Key — then rows are not deduped (the client opted out). */
    idempotencyKey: text("idempotency_key"),
  },
  (t) => [
    index("experiment_metric_events_org_event_idx").on(
      t.organizationId,
      t.eventName,
    ),
    index("experiment_metric_events_org_unit_idx").on(
      t.organizationId,
      t.unitHash,
    ),
    index("experiment_metric_events_org_day_idx").on(t.organizationId, t.day),
    // Exactly-once for keyed batches; keyless (null) rows are unconstrained.
    uniqueIndex("experiment_metric_events_idem_key")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

/**
 * Daily per-(experiment, metric, variant) aggregates the stats engine reads. A
 * rollup job folds exposures + metric_events into sufficient statistics:
 * `units` (distinct exposed units in the arm), `conversions` (converted units or
 * total event count), `metricSum` and `metricSumSq` (for mean/variance). Kept as
 * a precompute for scale; v1 may compute these on read and backfill this table.
 */
export const experimentResults = pgTable(
  "experiment_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => experimentMetrics.id, { onDelete: "cascade" }),
    variantKey: text("variant_key").notNull(),
    day: date("day").notNull(),
    units: integer("units").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    metricSum: doublePrecision("metric_sum").notNull().default(0),
    metricSumSq: doublePrecision("metric_sum_sq").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("experiment_results_bucket_key").on(
      t.experimentId,
      t.metricId,
      t.variantKey,
      t.day,
    ),
    index("experiment_results_org_idx").on(t.organizationId),
    index("experiment_results_exp_idx").on(t.experimentId),
  ],
);

/**
 * =============================================================================
 * RELIABILITY (Incidents + On-call). All tables are `incident_*` / `oncall_*`
 * prefixed (schema naming discipline, like experiment_*) so generic words like
 * "schedule"/"members" never collide with a future product. Tenant data (RLS).
 */

/**
 * An incident: a declared reliability event affecting one or more catalog
 * projects. `number` is a per-org sequential id (INC-N). Routes to an owning
 * team and (optionally) an escalation policy; ack stops escalation.
 */
export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    ownerTeamId: uuid("owner_team_id").references(() => teams.id, { onDelete: "set null" }),
    escalationPolicyId: uuid("escalation_policy_id").references(
      () => oncallEscalationPolicies.id,
      { onDelete: "set null" },
    ),
    declaredByUserId: uuid("declared_by_user_id"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByUserId: uuid("acknowledged_by_user_id"),
    escalatedLevel: integer("escalated_level").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("incidents_org_number_key").on(t.organizationId, t.number),
    index("incidents_org_idx").on(t.organizationId),
    index("incidents_org_status_idx").on(t.organizationId, t.status),
    index("incidents_owner_team_idx").on(t.ownerTeamId),
  ],
);

/** The catalog projects an incident affects (its blast radius). */
export const incidentServices = pgTable(
  "incident_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("incident_services_incident_project_key").on(t.incidentId, t.projectId),
    index("incident_services_org_idx").on(t.organizationId),
    index("incident_services_project_idx").on(t.projectId),
    index("incident_services_incident_idx").on(t.incidentId),
  ],
);

/** The incident timeline: an append-only stream of updates, each optionally a status change. */
export const incidentUpdates = pgTable(
  "incident_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: text("status"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incident_updates_incident_idx").on(t.incidentId, t.createdAt),
    index("incident_updates_org_idx").on(t.organizationId),
  ],
);

/**
 * An on-call schedule: a rotation of users. `teamId` is OPTIONAL — set for a
 * team rotation, null for a standalone/individual one. Members are explicit
 * users (any user), so team, cross-team, and single-person rotations are all
 * just member lists.
 */
export const oncallSchedules = pgTable(
  "oncall_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    rotationIntervalHours: integer("rotation_interval_hours").notNull().default(168),
    anchorAt: timestamp("anchor_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("oncall_schedules_org_key_key").on(t.organizationId, t.key),
    index("oncall_schedules_org_idx").on(t.organizationId),
    index("oncall_schedules_team_idx").on(t.teamId),
  ],
);

/** The ordered participants in an on-call rotation. */
export const oncallScheduleMembers = pgTable(
  "oncall_schedule_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => oncallSchedules.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("oncall_schedule_members_schedule_user_key").on(t.scheduleId, t.userId),
    index("oncall_schedule_members_org_idx").on(t.organizationId),
    index("oncall_schedule_members_schedule_idx").on(t.scheduleId),
  ],
);

/** A one-off override: a user covers a schedule for a time window (wins over the rotation). */
export const oncallOverrides = pgTable(
  "oncall_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => oncallSchedules.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("oncall_overrides_schedule_idx").on(t.scheduleId),
    index("oncall_overrides_org_idx").on(t.organizationId),
  ],
);

/** An escalation policy: an ordered set of levels an unacked incident climbs. */
export const oncallEscalationPolicies = pgTable(
  "oncall_escalation_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    // How many times to REPEAT the whole ladder if still unacknowledged (0 = one pass).
    repeatCount: integer("repeat_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("oncall_escalation_policies_org_key_key").on(t.organizationId, t.key),
    index("oncall_escalation_policies_org_idx").on(t.organizationId),
  ],
);

/**
 * A person's notification channels — HOW a page reaches them (email, sms, voice,
 * push, slack). USER-scoped and global (a phone is the same across orgs), so NO
 * RLS, like `users`; handlers always filter by the authenticated user. Email is
 * deliverable today; the others are scaffolded until their providers land.
 */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(),
    value: text("value").notNull(),
    label: text("label"),
    verified: boolean("verified").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("notification_channels_user_idx").on(t.userId)],
);

/**
 * A runbook: a reusable playbook of ordered steps a responder follows during an
 * incident. Attaches to services (runbook_services) and/or triggers at a severity
 * threshold; on declare, matching runbooks' steps materialize onto the incident as
 * a checklist. Tenant data (org-scoped, RLS).
 */
export const runbooks = pgTable(
  "runbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Attach automatically when an incident is AT LEAST this severe (null = never
    // auto-attach by severity; sev1 highest). Service attachment is independent.
    triggerSeverity: text("trigger_severity"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("runbooks_org_key_key").on(t.organizationId, t.key),
    index("runbooks_org_idx").on(t.organizationId),
  ],
);

/** An ordered step in a runbook: a task (with markdown instructions) or a link. */
export const runbookSteps = pgTable(
  "runbook_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    runbookId: uuid("runbook_id")
      .notNull()
      .references(() => runbooks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    body: text("body"),
    kind: text("kind").notNull().default("task"),
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("runbook_steps_runbook_idx").on(t.runbookId, t.position),
    index("runbook_steps_org_idx").on(t.organizationId),
  ],
);

/** Which catalog services a runbook covers (attach on any of their incidents). */
export const runbookServices = pgTable(
  "runbook_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    runbookId: uuid("runbook_id")
      .notNull()
      .references(() => runbooks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("runbook_services_runbook_project_key").on(t.runbookId, t.projectId),
    index("runbook_services_org_idx").on(t.organizationId),
    index("runbook_services_project_idx").on(t.projectId),
  ],
);

/**
 * A materialized runbook step on an incident — a COPY made when a runbook attaches,
 * so editing the runbook later never mutates a live incident. Responders check
 * these off. Tenant data (org-scoped, RLS).
 */
export const incidentChecklistItems = pgTable(
  "incident_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    runbookId: uuid("runbook_id").references(() => runbooks.id, { onDelete: "set null" }),
    runbookName: text("runbook_name"),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    body: text("body"),
    kind: text("kind").notNull().default("task"),
    url: text("url"),
    done: boolean("done").notNull().default(false),
    doneByUserId: uuid("done_by_user_id"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incident_checklist_incident_idx").on(t.incidentId, t.position),
    index("incident_checklist_org_idx").on(t.organizationId),
  ],
);

/** One field in an org's RCCA template (stored in rcca_templates.fields jsonb). */
export type RccaField = { key: string; label: string; description?: string; required?: boolean };

/**
 * A point-in-time copy of the org RCCA template, frozen onto an incident's RCCA at
 * declare. Editing the org template never rewrites a past incident's form.
 */
export type RccaSnapshot = { requiredSeverities: string[]; fields: RccaField[] };

/**
 * An org's RCCA template — CUSTOMIZABLE: which severities require an RCCA, and the
 * fields it captures. One per org, seeded with a standard template on first use.
 * Tenant data (org-scoped, RLS).
 */
export const rccaTemplates = pgTable(
  "rcca_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    requiredSeverities: text("required_severities").array().notNull().default(sql`ARRAY[]::text[]`),
    fields: jsonb("fields").$type<RccaField[]>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [uniqueIndex("rcca_templates_org_key").on(t.organizationId)],
);

/**
 * An incident's RCCA (Root Cause & Corrective Action) — the post-incident writeup.
 * The FIELDS are SNAPSHOT from the org template at declare (`template`), so editing
 * the org template never corrupts a past incident's form; `values` maps each field
 * key to its markdown content. One per incident. Tenant data (org-scoped, RLS).
 */
export const incidentRccas = pgTable(
  "incident_rccas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    // Frozen copy of the org template at declare. Nullable only for rows created
    // before this column existed; the app backfills from the live template.
    template: jsonb("template").$type<RccaSnapshot>(),
    values: jsonb("values").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    updatedByUserId: uuid("updated_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("incident_rccas_incident_key").on(t.incidentId),
    index("incident_rccas_org_idx").on(t.organizationId),
  ],
);

/** A corrective action tracked out of an incident's RCCA (the "CA" in RCCA). */
export const incidentActionItems = pgTable(
  "incident_action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeUserId: uuid("assignee_user_id"),
    status: text("status").notNull().default("open"),
    createdByUserId: uuid("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("incident_action_items_incident_idx").on(t.incidentId, t.createdAt),
    index("incident_action_items_org_idx").on(t.organizationId),
  ],
);

/** One level of an escalation policy: page a schedule/team/user after N minutes unacked. */
export const oncallEscalationLevels = pgTable(
  "oncall_escalation_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => oncallEscalationPolicies.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("oncall_escalation_levels_policy_idx").on(t.policyId, t.position),
    index("oncall_escalation_levels_org_idx").on(t.organizationId),
  ],
);

export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type Environment = typeof environments.$inferSelect;
export type FlagVariant = typeof flagVariants.$inferSelect;
export type FlagEnvironment = typeof flagEnvironments.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type FlagRule = typeof flagRules.$inferSelect;
export type ClientKey = typeof clientKeys.$inferSelect;
export type FlagRevision = typeof flagRevisions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectRelation = typeof projectRelations.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type ProjectAccess = typeof projectAccess.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type UsageMeterReport = typeof usageMeterReports.$inferSelect;
export type BillingCreditGrant = typeof billingCreditGrants.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type ExperimentMetric = typeof experimentMetrics.$inferSelect;
export type NewExperimentMetric = typeof experimentMetrics.$inferInsert;
export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
export type ExperimentMetricLink = typeof experimentMetricLinks.$inferSelect;
export type FlagExposure = typeof flagExposures.$inferSelect;
export type FlagMetricLink = typeof flagMetricLinks.$inferSelect;
export type Holdout = typeof holdouts.$inferSelect;
export type ExperimentMetricEvent = typeof experimentMetricEvents.$inferSelect;
export type NewExperimentMetricEvent = typeof experimentMetricEvents.$inferInsert;
export type ExperimentResult = typeof experimentResults.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type IncidentService = typeof incidentServices.$inferSelect;
export type IncidentUpdate = typeof incidentUpdates.$inferSelect;
export type OncallSchedule = typeof oncallSchedules.$inferSelect;
export type OncallScheduleMember = typeof oncallScheduleMembers.$inferSelect;
export type OncallOverride = typeof oncallOverrides.$inferSelect;
export type OncallEscalationPolicy = typeof oncallEscalationPolicies.$inferSelect;
export type OncallEscalationLevel = typeof oncallEscalationLevels.$inferSelect;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type Runbook = typeof runbooks.$inferSelect;
export type RunbookStep = typeof runbookSteps.$inferSelect;
export type RunbookService = typeof runbookServices.$inferSelect;
export type IncidentChecklistItem = typeof incidentChecklistItems.$inferSelect;
export type RccaTemplate = typeof rccaTemplates.$inferSelect;
export type IncidentRcca = typeof incidentRccas.$inferSelect;
export type IncidentActionItem = typeof incidentActionItems.$inferSelect;

/** Everything the migrator and query layer should know about. */
export const schema = {
  rateLimits,
  flags,
  environments,
  flagVariants,
  flagEnvironments,
  segments,
  flagRules,
  clientKeys,
  flagRevisions,
  projects,
  projectRelations,
  teams,
  teamMembers,
  projectAccess,
  flagEvalRollups,
  usageEventRollups,
  usageEvents,
  usageCounters,
  usageMeterReports,
  billingCreditGrants,
  assets,
  experimentMetrics,
  experiments,
  experimentMetricLinks,
  flagExposures,
  flagMetricLinks,
  experimentMetricEvents,
  experimentResults,
  holdouts,
  incidents,
  incidentServices,
  incidentUpdates,
  oncallSchedules,
  oncallScheduleMembers,
  oncallOverrides,
  oncallEscalationPolicies,
  oncallEscalationLevels,
  notificationChannels,
  runbooks,
  runbookSteps,
  runbookServices,
  incidentChecklistItems,
  rccaTemplates,
  incidentRccas,
  incidentActionItems,
};

// Re-exported so callers can build raw fragments without importing drizzle-orm
// directly; keeps the db surface in one place.
export { sql };
