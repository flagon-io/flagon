-- Notifications spine. The platform's single outbound pipe: `alert_channels` are
-- reusable org-level DESTINATIONS (a Slack incoming webhook, a generic webhook, a
-- shared mailbox) that any producer (checks, incidents, later flag events) references
-- by id; `notification_deliveries` is the enqueue + retry + audit log a drain sweep
-- works through. Both are TENANT tables (org-scoped, RLS). Secret URLs live encrypted
-- inside `alert_channels.config`.
CREATE TABLE "alert_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"integration_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health" text DEFAULT 'unknown' NOT NULL,
	"last_error" text,
	"last_delivered_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"event_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"status_code" integer,
	"error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_alert_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."alert_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_channels_org_key_key" ON "alert_channels" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "alert_channels_org_idx" ON "alert_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_dedupe_key" ON "notification_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_org_idx" ON "notification_deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_channel_idx" ON "notification_deliveries" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. Both are TENANT tables: reuse flagon_apply_tenant_rls so the
-- policy can't drift, and grant the restricted flagon_app role CRUD (RLS scopes WHICH
-- rows). Without this the tenancy audit fails closed on them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alert_channels', 'notification_deliveries'] LOOP
    PERFORM flagon_apply_tenant_rls(t::regclass);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flagon_app', t);
    END IF;
  END LOOP;
END $$;
