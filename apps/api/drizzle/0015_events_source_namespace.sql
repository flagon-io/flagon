-- Namespace event sources by producing product so the one Events meter breaks
-- down cleanly per product. Rename the flags exposures from the bare "exposure"
-- to "flags.exposure", and make that the column default going forward. Existing
-- rows are rebucketed in place; the (org, day, source) unique key still holds
-- because nothing else has ever written "flags.exposure".
ALTER TABLE "usage_event_rollups" ALTER COLUMN "source" SET DEFAULT 'flags.exposure';--> statement-breakpoint
UPDATE "usage_event_rollups" SET "source" = 'flags.exposure' WHERE "source" = 'exposure';
