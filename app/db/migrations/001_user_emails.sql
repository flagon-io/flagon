-- Custom multi-email support (like GitHub/PostHog), layered on top of
-- BetterAuth's core `users` table. BetterAuth only ever knows about the
-- "primary" email stored on users.email - this table tracks every email a
-- user has added, verified or not.
create table if not exists user_emails (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  email text not null unique,
  verified boolean not null default false,
  is_primary boolean not null default false,
  otp text,
  otp_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_emails_user_id_idx on user_emails (user_id);

-- Only one primary email per user.
create unique index if not exists user_emails_one_primary_per_user
  on user_emails (user_id)
  where is_primary;
