-- Organization SSO (SAML 2.0 + OIDC), SCIM 2.0 provisioning, and two-factor.
--
-- The GitHub identity model: a person is always just a Flagon user with a
-- personal account. An ORGANIZATION links an IdP (sso_providers.organization_id)
-- and can ENFORCE that its non-owner members authenticate through it
-- (organizations.sso_enforced -> org_sso_sessions) and/or hold 2FA
-- (organizations.require_2fa -> users.two_factor_enabled). The owner always
-- keeps a password fallback so a misconfigured IdP can never lock an org out.
-- The IdP can provision/deprovision membership over SCIM; deprovisioning
-- removes org membership only, never the personal account.

-- Org security posture (Pro+ only; gated in the console/API, not the DB).
ALTER TABLE "organizations" ADD COLUMN "sso_enforced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "require_2fa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sso_default_role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "scim_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Two-factor: flag on the user, secret + backup codes in their own table.
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "two_factors" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "verified" boolean DEFAULT true NOT NULL,
  "failed_verification_count" integer DEFAULT 0,
  "locked_until" timestamptz
);--> statement-breakpoint
CREATE INDEX "two_factors_user_id_idx" ON "two_factors" ("user_id");--> statement-breakpoint

-- SSO provider (BetterAuth @better-auth/sso). Exactly one of oidc_config /
-- saml_config is populated (JSON string of connection details, incl. secrets).
CREATE TABLE "sso_providers" (
  "id" uuid PRIMARY KEY NOT NULL,
  "issuer" text NOT NULL,
  "domain" text NOT NULL,
  "oidc_config" text,
  "saml_config" text,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "provider_id" text NOT NULL UNIQUE,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "domain_verified" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
CREATE INDEX "sso_providers_org_id_idx" ON "sso_providers" ("organization_id");--> statement-breakpoint

-- Per-org SSO session (GitHub-style enforcement recency). One current row per
-- (org, user); the SSO provisionUser hook upserts it, and the enforcement gate
-- requires an unexpired row for non-owner members of an sso_enforced org.
CREATE TABLE "org_sso_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "authenticated_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "org_sso_sessions_org_user_key" ON "org_sso_sessions" ("organization_id", "user_id");--> statement-breakpoint

-- SCIM bearer tokens. Plaintext (flagon_scim_<random>) shown once; only the
-- SHA-256 hash is stored. Soft-revoked to keep an audit trail.
CREATE TABLE "scim_tokens" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "last_four" text NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "last_used_at" timestamptz,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "scim_tokens_org_id_idx" ON "scim_tokens" ("organization_id");--> statement-breakpoint

-- SCIM user resource <-> Flagon user, scoped to one org. Deactivation removes
-- membership but leaves the personal account (active=false).
CREATE TABLE "scim_users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "external_id" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_org_external_key" ON "scim_users" ("organization_id", "external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_org_user_key" ON "scim_users" ("organization_id", "user_id");--> statement-breakpoint

-- SCIM group -> org role mapping (wins over sso_default_role). Never 'owner'.
CREATE TABLE "scim_groups" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "external_id" text,
  "display_name" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_org_external_key" ON "scim_groups" ("organization_id", "external_id");
