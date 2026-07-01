/**
 * Flagon domain schema: tenancy + the Catalog primitives (projects, environments),
 * platform auth tokens, audit, usage, and the intake tables (waitlist, feature
 * requests). Feature Flags and the other capabilities are being rebuilt on top of
 * this substrate, so their tables live outside this file until they land.
 *
 * Tenant-scoped tables carry `organization_id` and are isolated by the RLS policy
 * in rls.sql. Ids are UUIDv7 (see id.ts).
 */

import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../id';
import { organizations, teams, users } from './auth';

/** JSON value stored in jsonb columns (audit metadata, token scopes, …). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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
 * "What should we build next" — developer-submitted platform capability requests
 * from the marketing site. Public intake, NOT tenant-scoped, no RLS.
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

/**
 * Projects — the primary Catalog unit (an app / service you run). Capabilities
 * (flags, config, …) attach to a project's (project × environment) cells.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Owning team (Catalog ownership). Nullable = org-owned / unassigned.
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('projects_org_slug_unique').on(t.organizationId, t.slug)],
);

/**
 * Environments are an ORG-LEVEL platform primitive (not per-project): the whole
 * org shares one set (production, staging, …), so "production" means the same
 * thing everywhere. `tier` classifies it and `rank` orders the promotion ladder.
 */
export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    color: text('color').notNull().default('#64748b'),
    // production | staging | development | preview | other
    tier: text('tier').notNull().default('other'),
    rank: integer('rank').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('environments_org_key_unique').on(t.organizationId, t.key)],
);

/**
 * API tokens — the management-API credential.
 *   - 'user' (PAT): owned by `userId`; acts with that user's LIVE org memberships.
 *   - 'org'  (org-provisioned): owned by `organizationId`, acts with a fixed `role`
 *     in that one org; `createdByUserId` is the admin who minted it.
 * NOT under RLS — the token hash is the bootstrap credential resolved before any
 * tenant context exists. We store only the hash.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    // 'user' | 'org'
    kind: text('kind').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    // org tokens: the role the token acts as within its org (owner|admin|member|viewer)
    role: text('role'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hashedKey: text('hashed_key').notNull().unique(),
    // Reserved for future fine-grained scoping; null = inherit-all (v1).
    scopes: jsonb('scopes').$type<string[]>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('api_tokens_user_idx').on(t.userId),
    index('api_tokens_org_idx').on(t.organizationId),
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
    // user | token | system
    actorType: text('actor_type').notNull().default('user'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, JsonValue>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_org_created_idx').on(t.organizationId, t.createdAt)],
);

/**
 * Product-agnostic usage rollups — the basis for usage billing. One row per
 * (org, meter, day); each capability writes its own namespaced meter (e.g.
 * `flags.evaluations`) as it lands.
 */
export const usageRollups = pgTable(
  'usage_rollups',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    meter: text('meter').notNull(),
    day: date('day').notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull().default(0),
  },
  (t) => [unique('usage_rollups_unique').on(t.organizationId, t.meter, t.day)],
);
