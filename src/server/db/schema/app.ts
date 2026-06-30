/**
 * Flagon domain schema: tenancy, the flag model, delivery (sdk keys + bundles),
 * audit, usage, and the platform waitlist. Tenant-scoped tables carry
 * `organization_id` and are isolated by the RLS policy in rls.sql. Ids are
 * UUIDv7 (see id.ts).
 */

import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Bundle, Condition, FlagType, JsonValue, TargetingRule } from '@/core/types';
import { uuidv7 } from '../id';
import { organizations } from './auth';

/**
 * Platform waitlist (NOT tenant-scoped, no RLS). Public signup is closed once
 * the first user exists; everyone else joins here and an admin approves them.
 */
export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  email: text('email').notNull().unique(),
  name: text('name'),
  // pending | approved | rejected | converted
  status: text('status').notNull().default('pending'),
  note: text('note'),
  approvedByUserId: uuid('approved_by_user_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * "What should we build next" — developer-submitted platform building-block
 * requests from the marketing site. Public intake, NOT tenant-scoped, no RLS.
 */
export const featureRequests = pgTable('feature_requests', {
  id: uuid('id').primaryKey().$defaultFn(uuidv7),
  body: text('body').notNull(),
  email: text('email'),
  userId: uuid('user_id'),
  // new | reviewing | planned | shipped | declined
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tenant placement - where an org's data lives. v1: everyone is `shared` (RLS in
 * the main DB). Flipping a whale to `dedicated` later is a row change here plus
 * a data move, with no application code change.
 */
export const tenantPlacements = pgTable('tenant_placements', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  // shared | schema | dedicated
  mode: text('mode').notNull().default('shared'),
  connectionRef: text('connection_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('projects_org_slug_unique').on(t.organizationId, t.slug)],
);

export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    color: text('color').notNull().default('#64748b'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('environments_project_key_unique').on(t.projectId, t.key)],
);

export const flags = pgTable(
  'flags',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull().$type<FlagType>().default('boolean'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('flags_project_key_unique').on(t.projectId, t.key)],
);

/**
 * Per-environment configuration of a flag. Variants + targeting are stored as
 * JSONB shaped exactly like the core engine consumes them, so compiling a
 * bundle is a near-direct copy rather than a translation.
 */
export const flagEnvironments = pgTable(
  'flag_environments',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => flags.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    // ENABLED | DISABLED
    state: text('state').notNull().default('DISABLED'),
    defaultVariant: text('default_variant').notNull(),
    variants: jsonb('variants').$type<Record<string, JsonValue>>().notNull().default({}),
    targeting: jsonb('targeting').$type<TargetingRule[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('flag_envs_flag_env_unique').on(t.flagId, t.environmentId)],
);

export const segments = pgTable(
  'segments',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    condition: jsonb('condition').$type<Condition>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('segments_project_key_unique').on(t.projectId, t.key)],
);

/**
 * SDK keys authenticate flag delivery / evaluation. Only a hash is stored; the
 * plaintext is shown once at creation. `scope` distinguishes server keys (full
 * targeting context) from client keys (public, mobile/browser-safe).
 */
export const sdkKeys = pgTable(
  'sdk_keys',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hashedKey: text('hashed_key').notNull().unique(),
    // server | client
    scope: text('scope').notNull().default('server'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sdk_keys_env_idx').on(t.environmentId)],
);

/** Published, immutable bundle snapshots (the Postgres bundle-store driver). */
export const bundles = pgTable(
  'bundles',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    etag: text('etag').notNull(),
    payload: jsonb('payload').$type<Bundle>().notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('bundles_env_etag_unique').on(t.environmentId, t.etag),
    index('bundles_env_generated_idx').on(t.environmentId, t.generatedAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id'),
    // user | sdk_key | system
    actorType: text('actor_type').notNull().default('user'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, JsonValue>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_org_created_idx').on(t.organizationId, t.createdAt)],
);

/** Daily evaluation rollups per environment - the basis for usage billing. */
export const usageRollups = pgTable(
  'usage_rollups',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    evaluations: bigint('evaluations', { mode: 'number' }).notNull().default(0),
  },
  (t) => [unique('usage_rollups_unique').on(t.organizationId, t.environmentId, t.day)],
);
