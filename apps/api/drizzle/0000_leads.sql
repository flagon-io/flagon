CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'waitlist' NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"message" text,
	"source" text,
	"ip" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "leads_kind_email_key" ON "leads" USING btree ("kind","email");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_ip_created_at_idx" ON "leads" USING btree ("ip","created_at");--> statement-breakpoint
-- Role model. The runtime app role (DATABASE_URL) is a non-owner,
-- non-BYPASSRLS role, so tenant RLS is enforced once tenant tables exist.
-- `leads` is a global, no-RLS table the public marketing site WRITES, so the
-- app role needs INSERT here and nothing else (reads are the owner's job, via
-- internal tooling). Guarded on role existence so single-role local dev, where
-- the app connects as the owner, is a clean no-op. The app role is created
-- out-of-band (in Neon); the convention is `flagon_app`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT USAGE ON SCHEMA public TO flagon_app;
    GRANT INSERT ON TABLE "leads" TO flagon_app;
  END IF;
END $$;