-- Freeze the RCCA template onto each incident's RCCA at declare, so editing the
-- org template never rewrites a past incident's form. Nullable: existing rows are
-- backfilled by the app from the live template on next write.
ALTER TABLE "incident_rccas" ADD COLUMN "template" jsonb;
