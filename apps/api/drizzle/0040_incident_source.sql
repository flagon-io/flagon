-- Incident intake dimension. Until now incidents were manual-declare only. Adding
-- a `source` turns incidents into a general intake surface so non-human producers
-- (synthetic checks now; external alert integrations later) can declare through the
-- same path. `source_check_id` back-links a check-declared incident to its monitor;
-- its FK to checks is added by the checks migration (circular with
-- checks.active_incident_id), so here it is a bare column.
ALTER TABLE "incidents" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "source_check_id" uuid;--> statement-breakpoint
CREATE INDEX "incidents_org_source_idx" ON "incidents" USING btree ("organization_id","source");--> statement-breakpoint
CREATE INDEX "incidents_source_check_idx" ON "incidents" USING btree ("source_check_id");
