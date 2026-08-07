DROP TABLE "runbook_services" CASCADE;--> statement-breakpoint
ALTER TABLE "runbooks" ADD COLUMN "manual_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runbooks" ADD COLUMN "attach_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;