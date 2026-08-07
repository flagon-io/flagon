ALTER TABLE "incident_checklist_items" ADD COLUMN "provider" text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_checklist_items" ADD COLUMN "action" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_checklist_items" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_checklist_items" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_checklist_items" ADD COLUMN "skipped_reason" text;--> statement-breakpoint
ALTER TABLE "incident_rccas" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runbook_steps" ADD COLUMN "provider" text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE "runbook_steps" ADD COLUMN "action" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "runbook_steps" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;