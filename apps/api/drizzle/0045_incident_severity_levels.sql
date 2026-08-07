-- Configurable incident SEVERITY LEVELS. Severity used to be a hardcoded sev1..sev4
-- set (a zod enum, this CHECK, plus console + rank copies). Orgs now own their ladder:
-- name (P0..P4, sev1..sev4, ...), a descriptor, ordering (`rank`; lower = more severe),
-- a badge `color`, and `downtime_weight` (0..1 = how much a minute at this severity
-- counts against downtime). Exactly one active level is the default for a new incident;
-- levels are archived, never deleted, so past incidents keep their key. Tenant table (RLS).
CREATE TABLE "incident_severity_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rank" integer NOT NULL,
	"color" text DEFAULT '#a1a1aa' NOT NULL,
	"downtime_weight" double precision DEFAULT 1 NOT NULL,
	"platform_mode" text DEFAULT 'proportional' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "incident_severity_levels_org_key" ON "incident_severity_levels" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "incident_severity_levels_org_idx" ON "incident_severity_levels" USING btree ("organization_id");--> statement-breakpoint

-- Severity is now validated per-org at the app layer against this table; the global
-- CHECK from 0037 would reject any custom key (P0, ...), so drop it. The status CHECK stays.
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS "incidents_severity_check";--> statement-breakpoint

-- Backfill every existing org with the standard ladder so current incidents (severity
-- sev1..sev4) keep resolving, and every org has sane defaults with zero configuration.
-- SEV1 = full platform downtime, SEV2 = proportional to affected services, SEV3/4 =
-- timeline only (no uptime impact). Orgs created later self-seed via ensureSeverityLevels().
-- This runs BEFORE RLS is forced below, so the seed INSERT is not gated by the tenant
-- policy (which needs an app.current_org_id the migrator does not set). Guarded so an
-- API-only database without the auth-owned organizations table still migrates.
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    INSERT INTO "incident_severity_levels"
      ("organization_id","key","name","description","rank","color","downtime_weight","platform_mode","is_default")
    SELECT o.id, v.key, v.name, v.description, v.rank, v.color, v.weight, v.platform_mode, v.is_default
    FROM "organizations" o
    CROSS JOIN (VALUES
      ('sev1','SEV1','Critical outage. Counts as full platform downtime.',1,'#ef4444',1.0,'full',false),
      ('sev2','SEV2','Major degradation. Counts against the platform by affected services out of total.',2,'#f97316',1.0,'proportional',false),
      ('sev3','SEV3','Minor. Shown on the timeline, no impact on uptime.',3,'#f59e0b',0.0,'none',true),
      ('sev4','SEV4','Informational. Shown on the timeline, no impact on uptime.',4,'#a1a1aa',0.0,'none',false)
    ) AS v("key","name","description","rank","color","weight","platform_mode","is_default")
    ON CONFLICT ("organization_id","key") DO NOTHING;
  END IF;
END $$;--> statement-breakpoint

-- RLS: tenant table. Reuse the shared helper so the policy can't drift; grant the
-- restricted app role CRUD (RLS scopes WHICH rows). Applied AFTER the seed above.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('incident_severity_levels'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON incident_severity_levels TO flagon_app';
  END IF;
END $$;
