-- BetterAuth rate limiting, backed by Postgres (rateLimit.storage "database").
-- In-memory storage is useless on serverless (per-instance memory), and this
-- avoids standing up Redis: at current scale Postgres is plenty. If traffic
-- ever makes this table hot, swap to a secondaryStorage (Redis) - no schema
-- change needed, this table just stops being written.
--
-- The unique key constraint is load-bearing: the limiter's concurrent-create
-- path relies on it to detect races.

CREATE TABLE rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

CREATE UNIQUE INDEX rate_limit_key_uidx ON rate_limit (key);
