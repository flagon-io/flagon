-- Per-organization AI usage, so plans can be metered and enforced (never ship
-- unrestricted AI). Scoped by membership via RLS: a user reads/writes usage only
-- for orgs they belong to, using the flagon.user_id binding set by inUserTx.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_org_created_idx on public.ai_usage (org_id, created_at);

alter table public.ai_usage enable row level security;
alter table public.ai_usage force row level security;

create policy ai_usage_member_all on public.ai_usage
  using (org_id in (select org_id from public.memberships where user_id = flagon.current_user_id()))
  with check (org_id in (select org_id from public.memberships where user_id = flagon.current_user_id()));
