-- Reliability upgrade: relentless escalation + multi-channel notifications.
--   1. Escalation policies can REPEAT the ladder (PagerDuty-style) until acked.
--   2. Per-user notification channels — how a page reaches a person. Email is
--      deliverable today; sms / voice / push / slack are scaffolded (stored +
--      surfaced) until their providers land. USER-scoped + global (a person's
--      phone is the same across orgs), so NO RLS — like `users`/`leads`; the API
--      always filters by the authenticated user.
ALTER TABLE "oncall_escalation_policies" ADD COLUMN "repeat_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"verified" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notification_channels_user_idx" ON "notification_channels" USING btree ("user_id");--> statement-breakpoint
-- Global table (no tenant): grant the app role CRUD; handlers scope by user_id.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON notification_channels TO flagon_app;
  END IF;
END $$;
