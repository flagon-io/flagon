-- Soft delete for organizations.
--
-- Deleting an org sets `deleted_at` (and who did it) instead of removing the row,
-- so the org immediately DISAPPEARS from all access (routing, membership, API org
-- resolution all filter deleted_at IS NULL) while its data + billing/cancellation
-- state are RETAINED for the retention window. This is what lets us see who
-- churned and, in principle, restore.
--
-- A FUTURE hard-delete / purge cron erases soft-deleted orgs past the retention
-- window (e.g. 30 days) — NOT built yet. See the org-lifecycle TODO in
-- apps/app/src/lib/org-lifecycle.ts (purgeExpiredOrgs). Until then, soft-deleted
-- rows accumulate and are never hard-removed by the app.
--
-- No new grants needed: the restricted app/API role already holds UPDATE on
-- organizations (billing writes stripe_* here), and column adds inherit that.
ALTER TABLE "organizations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deleted_by_user_id" uuid;
