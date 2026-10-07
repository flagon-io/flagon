-- The running example used throughout "Eight Kilobytes".
create extension if not exists pg_stat_statements;
create extension if not exists pg_trgm;
create extension if not exists pageinspect;
create extension if not exists pg_buffercache;
create extension if not exists pgstattuple;

create table accounts (
  id          bigint generated always as identity primary key,
  name        text not null,
  plan        text not null default 'free' check (plan in ('free', 'team', 'enterprise')),
  created_at  timestamptz not null default now()
);

create table users (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id),
  email       text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (account_id, email)
);

create table projects (
  id           bigint generated always as identity primary key,
  account_id   bigint not null references accounts (id),
  owner_id     bigint not null references users (id),
  name         text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table events (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id),
  project_id  bigint not null references projects (id),
  user_id     bigint references users (id),
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Every date is measured back from one fixed moment, not now(), so the data is
-- identical whenever and wherever you load it.
select setseed(0.42);

insert into accounts (name, plan, created_at)
select 'Account ' || g,
       (array['free','free','free','team','team','enterprise'])[1 + floor(random()*6)::int],
       timestamptz '2026-10-06' - (random() * interval '1000 days')
from generate_series(1, 1000) g;

insert into users (account_id, email, name, created_at)
select 1 + (g % 1000), 'user' || g || '@example.com', 'User ' || g,
       timestamptz '2026-10-06' - (random() * interval '900 days')
from generate_series(1, 100000) g;

insert into projects (account_id, owner_id, name, archived_at, created_at)
select u.account_id, u.id, 'Project ' || g,
       case when random() < 0.2 then timestamptz '2026-10-06' - random() * interval '100 days' end,
       timestamptz '2026-10-06' - (random() * interval '800 days')
from generate_series(1, 20000) g
join users u on u.id = 1 + ((g * 7) % 100000);

insert into events (account_id, project_id, user_id, kind, payload, created_at)
select p.account_id, p.id, p.owner_id, r.kind,
       jsonb_build_object('status', r.status, 'duration_ms', r.duration_ms, 'region', r.region),
       r.created_at
from (
  select g,
         1 + floor(random()*20000)::bigint as project_id,
         (array['deploy','deploy','build','build','build','comment','alert','login'])[1 + floor(random()*8)::int] as kind,
         (array['ok','ok','ok','failed'])[1 + floor(random()*4)::int] as status,
         floor(random()*5000)::int as duration_ms,
         (array['iad','sfo','ams','fra','syd'])[1 + floor(random()*5)::int] as region,
         timestamptz '2026-10-06' - interval '365 days' + (g * interval '365 days' / 2000000) as created_at
  from generate_series(1, 2000000) g
) r
join projects p on p.id = r.project_id
order by r.g;

vacuum analyze;
