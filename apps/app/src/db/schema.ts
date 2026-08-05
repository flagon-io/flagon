import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../lib/uuid";
import { decryptField, encryptField } from "../lib/crypto/field-encryption";

/**
 * A `text` column whose value is AES-256-GCM encrypted AT REST and transparently
 * decrypted on read. Used for SSO provider secrets (OIDC client secret, SAML
 * config) so the plugin still sees plaintext while the database never holds it.
 * drizzle skips the transforms for NULL, so nullable columns stay null.
 */
const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value: string): string {
    return encryptField(value);
  },
  fromDriver(value: string): string {
    return decryptField(value);
  },
});

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
  // Set by the two-factor plugin when TOTP enrollment is verified. This is the
  // flag an org's "require 2FA" gate consults (see lib/org-security.ts); the
  // secret + backup codes live in `two_factors`, never here.
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
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
  // Stripe mapping for flat $50/mo Pro. `stripe_customer_id` is the org's
  // Stripe Customer (one per org, unique); `stripe_subscription_id` its active
  // Pro subscription; `subscription_status` mirrors the Stripe subscription
  // status. All three are written by the webhook / billing actions, never by
  // the general settings form. See src/lib/billing.ts.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  // Org base permission (GitHub-style): who may create projects. 'managers'
  // (owner/admin) by default; 'members' opens it to any member. Set via the API.
  projectCreationPolicy: text("project_creation_policy").notNull().default("managers"),
  // --- Security posture (GitHub-style, Pro+ only) --------------------------
  // When true, non-owner members must hold an active per-org SSO session
  // (org_sso_sessions) to reach org resources; the owner always keeps a
  // password fallback so a misconfigured IdP can never lock an org out.
  ssoEnforced: boolean("sso_enforced").notNull().default(false),
  // When true, non-owner members must have 2FA enrolled to reach org resources.
  require2fa: boolean("require_2fa").notNull().default(false),
  // Role granted to members provisioned via SSO/SCIM when no group mapping
  // applies. Never 'owner' (transferred, not assigned).
  ssoDefaultRole: text("sso_default_role").notNull().default("member"),
  // Whether the org's SCIM provisioning endpoint is live (a token still gates
  // it; this is the on/off switch surfaced in settings).
  scimEnabled: boolean("scim_enabled").notNull().default(false),
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

// --- BetterAuth SSO plugin (@better-auth/sso) --------------------------------

/**
 * A configured SAML 2.0 or OIDC identity provider. Owned by an ORGANIZATION
 * (organizationId) in the GitHub model: the org links its IdP, members keep
 * their own personal accounts. Exactly one of `oidc_config` / `saml_config`
 * holds the connection details as a JSON string (issuer, endpoints, certs,
 * client secret — plaintext, since they are needed to talk to the IdP).
 *
 * JS property names are camelCase to match BetterAuth's field names (its
 * drizzle adapter indexes the table object by field name); the SQL columns are
 * snake_case like the rest of the schema. Registered via authClient.sso.register.
 */
export const ssoProviders = pgTable(
  "sso_providers",
  {
    id: uuid("id").primaryKey(),
    issuer: text("issuer").notNull(),
    domain: text("domain").notNull(),
    // Connection details incl. secrets (OIDC client secret, SAML cert/keys):
    // encrypted at rest, transparently decrypted for the SSO plugin. The SQL
    // type stays `text`, so no migration change is needed.
    oidcConfig: encryptedText("oidc_config"),
    samlConfig: encryptedText("saml_config"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().unique(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    // Reserved for optional DNS domain verification (feature currently off). The
    // column exists now so enabling it later needs no migration.
    domainVerified: boolean("domain_verified").notNull().default(false),
  },
  (t) => [index("sso_providers_org_id_idx").on(t.organizationId)],
);

// --- BetterAuth two-factor plugin --------------------------------------------

/**
 * TOTP secret + backup codes for a user's 2FA. One row per enrolled user. The
 * secret and backup codes are never returned to the client by BetterAuth
 * (returned:false in the plugin schema). `verified` guards the enable flow;
 * `failed_verification_count` / `locked_until` back the plugin's lockout.
 */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user_id_idx").on(t.userId)],
);

// --- Ours: per-org SSO session (GitHub-style enforcement) ---------------------

/**
 * Records that a user established an SSO session for a given org, and when it
 * expires. The SSO enforcement gate (lib/org-security.ts, consulted by the org
 * workspace layout) requires an unexpired row here for non-owner members of an
 * `sso_enforced` org. Upserted by the SSO `provisionUser` hook on every login;
 * the TTL (SSO_SESSION_TTL_MS) drives periodic re-authentication like GitHub.
 */
export const orgSsoSessions = pgTable(
  "org_sso_sessions",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authenticatedAt: timestamp("authenticated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    // One current SSO session per (org, user); the hook upserts on this key.
    uniqueIndex("org_sso_sessions_org_user_key").on(t.organizationId, t.userId),
  ],
);

// --- Ours: SCIM 2.0 provisioning ---------------------------------------------

/**
 * Bearer tokens the IdP presents to the org's SCIM endpoint. Like access
 * tokens, the plaintext (`flagon_scim_<random>`) is shown once and only its
 * SHA-256 hash is stored; the SCIM handler resolves the org by hashed lookup.
 * Revoked (soft) rather than deleted so an audit trail survives.
 */
export const scimTokens = pgTable(
  "scim_tokens",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastFour: text("last_four").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("scim_tokens_org_id_idx").on(t.organizationId)],
);

/**
 * Maps an IdP's SCIM user resource to a Flagon user WITHIN one org. SCIM
 * operates on its own resource ids and an `external_id` scoped to the org, so
 * this join lets provisioning address a member without touching the global
 * user. Deactivation (`active=false`) removes org membership but LEAVES the
 * personal account intact (GitHub model).
 */
export const scimUsers = pgTable(
  "scim_users",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A given IdP resource maps to at most one Flagon user per org.
    uniqueIndex("scim_users_org_external_key").on(t.organizationId, t.externalId),
    // And a Flagon user is provisioned at most once per org.
    uniqueIndex("scim_users_org_user_key").on(t.organizationId, t.userId),
  ],
);

/**
 * Maps an IdP SCIM group (or SAML group claim) to a Flagon org role. When a
 * provisioned user belongs to a mapped group, that role wins over the org's
 * `sso_default_role`. Never maps to 'owner'.
 */
export const scimGroups = pgTable(
  "scim_groups",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("scim_groups_org_external_key").on(t.organizationId, t.externalId),
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
export type SsoProvider = typeof ssoProviders.$inferSelect;
export type TwoFactor = typeof twoFactors.$inferSelect;
export type OrgSsoSession = typeof orgSsoSessions.$inferSelect;
export type ScimToken = typeof scimTokens.$inferSelect;
export type ScimUser = typeof scimUsers.$inferSelect;
export type ScimGroup = typeof scimGroups.$inferSelect;

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
  // SSO + two-factor plugin models (singular keys → plural tables).
  ssoProvider: ssoProviders,
  twoFactor: twoFactors,
  // Our own tables (not BetterAuth models) — included so the drizzle client
  // knows about them.
  orgSsoSession: orgSsoSessions,
  scimToken: scimTokens,
  scimUser: scimUsers,
  scimGroup: scimGroups,
};

export { sql };
