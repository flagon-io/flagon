-- Multiple email addresses per user, GitHub-style.
--
-- user_emails is the source of truth for every address a user owns; the
-- BetterAuth "user".email column stays as a MIRROR of the primary row (kept in
-- sync by application hooks) so BetterAuth's own flows keep working untouched.
--
-- Global auth table: no RLS (same as user/session/account/verification).
-- Uniqueness is case-insensitive: an address can exist once across the whole
-- platform, no matter the casing or which user owns it.

CREATE TABLE user_emails (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  email text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_emails_email_lower_uidx ON user_emails (lower(email));
CREATE INDEX user_emails_user_id_idx ON user_emails (user_id);

-- One primary per user, enforced by the database rather than trusted to app
-- code.
CREATE UNIQUE INDEX user_emails_one_primary_uidx
  ON user_emails (user_id)
  WHERE is_primary;

-- Backfill: every existing user's login email becomes their primary row.
INSERT INTO user_emails (id, user_id, email, verified, is_primary)
SELECT gen_random_uuid()::text, id, email, email_verified, true
FROM "user";
