CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- rate_limits is a global OPERATIONAL table (not tenant data), like leads: no
-- RLS. The runtime app role both reads and writes counters on the request path
-- (one atomic upsert per check), and prunes expired rows, so it needs
-- SELECT/INSERT/UPDATE/DELETE. Guarded on role existence so single-role local
-- dev, where the app connects as the owner, is a clean no-op. The app role is
-- created out-of-band (in Neon); the convention is `flagon_app`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT USAGE ON SCHEMA public TO flagon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "rate_limits" TO flagon_app;
  END IF;
END $$;
