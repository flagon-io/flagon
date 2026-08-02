-- Rename the client-key table from its historical name "sdk_keys" to "client_keys"
-- so storage matches the product name ("client keys"). Pure rename: no data change,
-- no column change. Indexes and named constraints are renamed too for consistency.
ALTER TABLE "sdk_keys" RENAME TO "client_keys";--> statement-breakpoint
ALTER INDEX "sdk_keys_org_idx" RENAME TO "client_keys_org_idx";--> statement-breakpoint
ALTER INDEX "sdk_keys_env_idx" RENAME TO "client_keys_env_idx";--> statement-breakpoint
ALTER TABLE "client_keys" RENAME CONSTRAINT "sdk_keys_pkey" TO "client_keys_pkey";--> statement-breakpoint
ALTER TABLE "client_keys" RENAME CONSTRAINT "sdk_keys_key_hash_unique" TO "client_keys_key_hash_unique";--> statement-breakpoint
ALTER TABLE "client_keys" RENAME CONSTRAINT "sdk_keys_environment_id_environments_id_fk" TO "client_keys_environment_id_environments_id_fk";
