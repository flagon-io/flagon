CREATE TABLE "flag_eval_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"day" date NOT NULL,
	"variant_key" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flag_eval_rollups" ADD CONSTRAINT "flag_eval_rollups_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_eval_rollups" ADD CONSTRAINT "flag_eval_rollups_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flag_eval_rollups_bucket_key" ON "flag_eval_rollups" USING btree ("flag_id","environment_id","day","variant_key","reason");--> statement-breakpoint
CREATE INDEX "flag_eval_rollups_flag_idx" ON "flag_eval_rollups" USING btree ("flag_id","environment_id");--> statement-breakpoint
CREATE INDEX "flag_eval_rollups_org_idx" ON "flag_eval_rollups" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. flag_eval_rollups is TENANT data, same discipline as the
-- other flags tables (0002): reuse flagon_apply_tenant_rls so the policy can't
-- drift, and grant the restricted flagon_app role CRUD (RLS scopes WHICH rows).
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('flag_eval_rollups'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON flag_eval_rollups TO flagon_app;
  END IF;
END $$;