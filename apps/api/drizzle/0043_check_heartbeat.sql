-- Heartbeat (dead-man) checks. Instead of Flagon probing an endpoint, a job pings a
-- tokenized URL on a schedule; the check fails if the ping is late (interval + grace).
-- `last_ping_at` is the most recent inbound ping; `ping_token` is the secret in the
-- ingest URL (globally unique so a ping resolves to exactly one check within its org).
ALTER TABLE "checks" ADD COLUMN "last_ping_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checks" ADD COLUMN "ping_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "checks_ping_token_key" ON "checks" USING btree ("ping_token") WHERE "ping_token" IS NOT NULL;
