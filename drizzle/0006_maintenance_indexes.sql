-- Maintenance indexes for expiry-based cleanup.
--
-- verifications: expired tokens (email verification, password reset) are
-- purged opportunistically whenever a new token is created
-- (src/lib/user-emails.ts); the purge filters on expires_at.
--
-- sessions: BetterAuth deletes an expired session when its token is next
-- presented, but sessions of users who never return linger; a future sweep
-- (cron) will filter on expires_at. Cheap insurance to index it now.

CREATE INDEX verifications_expires_at_idx ON verifications (expires_at);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
