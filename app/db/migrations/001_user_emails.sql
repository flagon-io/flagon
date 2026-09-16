-- Custom multi-email support (like GitHub/PostHog), layered on top of
-- BetterAuth's core `user` table. BetterAuth only ever knows about the
-- "primary" email stored on user.email - this table tracks every email a
-- user has added, verified or not.
create table if not exists user_email (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  email text not null unique,
  verified boolean not null default false,
  is_primary boolean not null default false,
  otp text,
  otp_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_email_user_id_idx on user_email (user_id);

-- Only one primary email per user.
create unique index if not exists user_email_one_primary_per_user
  on user_email (user_id)
  where is_primary;
