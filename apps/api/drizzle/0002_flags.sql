CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"key" text NOT NULL,
	"data_type" text DEFAULT 'string' NOT NULL,
	"labels" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_variant_id" uuid,
	"off_variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"summary" text,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_environment_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"description" text,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"serve" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'boolean' NOT NULL,
	"permanent" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"maintainer_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdk_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_four" text NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sdk_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attributes_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environments" ADD CONSTRAINT "flag_environments_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environments" ADD CONSTRAINT "flag_environments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environments" ADD CONSTRAINT "flag_environments_default_variant_id_flag_variants_id_fk" FOREIGN KEY ("default_variant_id") REFERENCES "public"."flag_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environments" ADD CONSTRAINT "flag_environments_off_variant_id_flag_variants_id_fk" FOREIGN KEY ("off_variant_id") REFERENCES "public"."flag_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_revisions" ADD CONSTRAINT "flag_revisions_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_rules" ADD CONSTRAINT "flag_rules_flag_environment_id_flag_environments_id_fk" FOREIGN KEY ("flag_environment_id") REFERENCES "public"."flag_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_variants" ADD CONSTRAINT "flag_variants_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdk_keys" ADD CONSTRAINT "sdk_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_org_key_key" ON "entities" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "entities_org_idx" ON "entities" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_attributes_entity_key_key" ON "entity_attributes" USING btree ("entity_id","key");--> statement-breakpoint
CREATE INDEX "entity_attributes_org_idx" ON "entity_attributes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_org_key_key" ON "environments" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "environments_org_idx" ON "environments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_environments_flag_env_key" ON "flag_environments" USING btree ("flag_id","environment_id");--> statement-breakpoint
CREATE INDEX "flag_environments_org_idx" ON "flag_environments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flag_environments_env_idx" ON "flag_environments" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "flag_revisions_flag_idx" ON "flag_revisions" USING btree ("flag_id","created_at");--> statement-breakpoint
CREATE INDEX "flag_revisions_org_idx" ON "flag_revisions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flag_rules_env_priority_idx" ON "flag_rules" USING btree ("flag_environment_id","priority");--> statement-breakpoint
CREATE INDEX "flag_rules_org_idx" ON "flag_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_variants_flag_key_key" ON "flag_variants" USING btree ("flag_id","key");--> statement-breakpoint
CREATE INDEX "flag_variants_flag_idx" ON "flag_variants" USING btree ("flag_id");--> statement-breakpoint
CREATE INDEX "flag_variants_org_idx" ON "flag_variants" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_org_key_key" ON "flags" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "flags_org_idx" ON "flags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flags_org_archived_idx" ON "flags" USING btree ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "sdk_keys_org_idx" ON "sdk_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sdk_keys_env_idx" ON "sdk_keys" USING btree ("environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_org_key_key" ON "segments" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "segments_org_idx" ON "segments" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. Every flags table is TENANT data: a row is visible/
-- writable only when its organization_id matches the per-request
-- `app.current_org_id` set by db/tenant.ts::withOrg(). FORCE so the restricted,
-- non-owner, non-BYPASSRLS flagon_app role is fully subject; no context => NULL
-- => zero rows (fail closed); WITH CHECK blocks writing a row for another org.
--
-- A helper applies the identical policy to each table so the boilerplate can't
-- drift. `%L` lets format() quote the literals, so there is no hand-escaping.
-- (Policy proven against a non-bypass role before shipping.)
CREATE OR REPLACE FUNCTION flagon_apply_tenant_rls(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s '
    'USING (organization_id = NULLIF(current_setting(%L, true), %L)::uuid) '
    'WITH CHECK (organization_id = NULLIF(current_setting(%L, true), %L)::uuid)',
    tbl, 'app.current_org_id', '', 'app.current_org_id', ''
  );
END;
$fn$;--> statement-breakpoint
-- NOTE: sdk_keys is intentionally ABSENT below. It is a CREDENTIAL table (like
-- access_tokens): an SDK key must be resolved to its org BEFORE any org context
-- exists, so RLS keyed on app.current_org_id can't gate the lookup (it would
-- fail closed on the very query that establishes the org). It is classified
-- auth-layer instead — the lookup is by a unique, high-entropy hash, and
-- management (list/create/revoke) is org-scoped in the application layer, same
-- discipline as access_tokens. It is granted below but NOT RLS-forced.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'flags', 'environments', 'flag_variants', 'flag_environments', 'entities',
    'entity_attributes', 'segments', 'flag_rules', 'flag_revisions'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    PERFORM flagon_apply_tenant_rls(t::regclass);
  END LOOP;

  -- Grant the restricted runtime role CRUD; RLS above scopes WHICH rows.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT USAGE ON SCHEMA public TO flagon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      flags, environments, flag_variants, flag_environments, entities,
      entity_attributes, segments, flag_rules, sdk_keys, flag_revisions
      TO flagon_app;
  END IF;
END $$;