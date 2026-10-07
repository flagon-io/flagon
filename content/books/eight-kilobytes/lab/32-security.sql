-- Lab for "Trust no tenant"
-- https://www.flagon.io/books/eight-kilobytes/security
-- Run: ./lab 32-security
--
-- Builds the chapter's multi-tenant setup: an owner role, an app role that
-- doesn't own anything, an `app` schema with projects and events copied from
-- the sample data, and row-level security on account_id. Then checks every
-- way RLS filters, fails closed, leaks, and costs pages.
--
-- Roles are cluster-wide, so this lab creates its roles at the start
-- (dropping leftovers from an earlier run) and drops them at the end.

\pset tuples_only on
\pset format unaligned

drop role if exists wg_owner, wg_app, wg_readonly, wg_analyst, wg_migrator;

\echo
\echo '== Roles'

create role wg_owner nologin;
create role wg_app login password 'app-secret';
create role wg_readonly nologin;
create user wg_analyst;
-- The lab's own helpers (lab.prove and friends) must be callable from every role.
grant usage on schema lab to wg_owner, wg_app, wg_readonly, wg_analyst;

select lab.prove(
  'create user is create role ... login',
  (select rolcanlogin from pg_roles where rolname = 'wg_analyst'));

select lab.prove(
  'the app role has none of the powerful attributes',
  (select not (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
   from pg_roles where rolname = 'wg_app'));

grant wg_readonly to wg_analyst;
create role wg_migrator login;
grant usage on schema lab to wg_migrator;
grant wg_owner to wg_migrator with inherit false, set true;

select lab.prove(
  'PostgreSQL 16+ grants carry inherit, set, and admin options: wg_migrator may set role but does not inherit',
  (select not a.inherit_option and a.set_option and not a.admin_option
   from pg_auth_members a
   join pg_roles r on r.oid = a.roleid
   join pg_roles m on m.oid = a.member
   where r.rolname = 'wg_owner' and m.rolname = 'wg_migrator'));

select lab.prove(
  'a plain grant inherits by default',
  (select a.inherit_option and a.set_option and not a.admin_option
   from pg_auth_members a
   join pg_roles r on r.oid = a.roleid
   join pg_roles m on m.oid = a.member
   where r.rolname = 'wg_readonly' and m.rolname = 'wg_analyst'));

select lab.prove(
  'the predefined roles exist: pg_read_all_data, pg_write_all_data, pg_monitor, pg_signal_backend, pg_maintain',
  (select count(*) from pg_roles
   where rolname in ('pg_read_all_data', 'pg_write_all_data', 'pg_monitor',
                     'pg_signal_backend', 'pg_maintain')) = 5);

\echo
\echo '== Schemas and grants, default privileges'

create schema app authorization wg_owner;
grant usage on schema app to wg_app, wg_readonly;

set role wg_owner;
alter default privileges in schema app
  grant select, insert, update, delete on tables to wg_app;
alter default privileges in schema app
  grant select on tables to wg_readonly;
alter default privileges in schema app
  grant usage on sequences to wg_app;

create table app.projects (
  id          bigint generated always as identity primary key,
  account_id  bigint not null,
  name        text not null
);

create table app.events (
  id          bigint generated always as identity primary key,
  account_id  bigint not null,
  project_id  bigint not null references app.projects (id),
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
reset role;

-- Copy the sample data in, keeping the ids (identity values in order).
insert into app.projects (account_id, name)
select account_id, name from public.projects order by id;
insert into app.events (account_id, project_id, kind, payload, created_at)
select account_id, project_id, kind, payload, created_at from public.events order by id;
vacuum analyze app.projects, app.events;

select lab.prove(
  'tables wg_owner creates in app arrive with grants: wg_owner=arwdDxtm, wg_app=arwd, wg_readonly=r',
  (select relacl::text[] from pg_class where oid = 'app.events'::regclass)
  = array['wg_owner=arwdDxtm/wg_owner', 'wg_app=arwd/wg_owner', 'wg_readonly=r/wg_owner']);

select lab.prove(
  'the app has no truncate',
  not has_table_privilege('wg_app', 'app.events', 'truncate'));

set role wg_migrator;
select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  perform count(*) from app.projects;
  raise exception 'no error';
exception when insufficient_privilege then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'as wg_migrator (inherit false), ordinary queries fail',
  current_setting('lab.caught') = 'permission denied for schema app');
set role wg_owner;
select lab.prove(
  'after set role wg_owner, they work',
  (select count(*) from app.projects) = 20000);
reset role;

\echo
\echo '== The public schema and search_path'

select lab.prove(
  'since PostgreSQL 15, public is owned by pg_database_owner and everyone else gets only USAGE',
  (select nspowner::regrole::text = 'pg_database_owner'
          and nspacl::text = '{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}'
   from pg_namespace where nspname = 'public'));

select lab.prove(
  'the default search_path is "$user", public',
  (select boot_val from pg_settings where name = 'search_path') = '"$user", public');

set role wg_app;
select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  create table public.scratch (id int);
  raise exception 'no error';
exception when insufficient_privilege then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'the app role can''t create tables in public: permission denied for schema public',
  current_setting('lab.caught') = 'permission denied for schema public');
reset role;

\echo
\echo '== Row-level security'

set role wg_owner;
alter table app.projects enable row level security;
alter table app.events   enable row level security;

create policy tenant_isolation on app.projects
  using (account_id = current_setting('app.account_id', true)::bigint);
create policy tenant_isolation on app.events
  using (account_id = current_setting('app.account_id', true)::bigint);
reset role;

set role wg_app;
select lab.prove(
  'current_setting(..., true) returns null for a setting never set',
  current_setting('app.account_id', true) is null);

select lab.prove(
  'no tenant set: the app role sees 0 of 2,000,000 events (RLS fails closed)',
  (select count(*) from app.events) = 0);

select set_config('app.account_id', '42', false) \g /dev/null

select lab.prove(
  'tenant 42 sees its 2,084 events',
  (select count(*) from app.events) = 2084);

select lab.prove(
  'and its 20 projects, all account 42',
  (select count(*) = 20 and min(account_id) = 42 and max(account_id) = 42 from app.projects));

select lab.prove(
  'asking for another tenant explicitly gets nothing',
  (select count(*) from app.events where account_id = 7) = 0);

select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  insert into app.events (account_id, project_id, kind) values (7, 1, 'deploy');
  raise exception 'no error';
exception when insufficient_privilege then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'inserting a row for tenant 7 is rejected: new row violates row-level security policy',
  current_setting('lab.caught') = 'new row violates row-level security policy for table "events"');

select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  update app.events set account_id = 7 where id = (select min(id) from app.events);
  raise exception 'no error';
exception when insufficient_privilege then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'moving a row to tenant 7 with update is rejected the same way',
  current_setting('lab.caught') = 'new row violates row-level security policy for table "events"');

\echo
\echo '== Foreign keys look through policies'

select lab.prove(
  'tenant 42 can''t see project 1',
  not exists (select 1 from app.projects where id = 1));

begin;
insert into app.events (account_id, project_id, kind) values (42, 1, 'deploy');
select lab.prove(
  'yet it can attach an event to project 1: the foreign key check bypasses RLS',
  (select count(*) from app.events where project_id = 1) = 1);
rollback;

reset role;
set role wg_owner;
alter table app.projects
  add constraint projects_account_id_id_key unique (account_id, id);
alter table app.events
  add constraint events_project_fk
  foreign key (account_id, project_id) references app.projects (account_id, id);
reset role;

set role wg_app;
select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  insert into app.events (account_id, project_id, kind) values (42, 1, 'deploy');
  raise exception 'no error';
exception when foreign_key_violation then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'with the composite (account_id, project_id) foreign key, the cross-tenant reference fails',
  current_setting('lab.caught') = 'insert or update on table "events" violates foreign key constraint "events_project_fk"');
reset role;

\echo
\echo '== FORCE ROW LEVEL SECURITY'

set role wg_owner;
select lab.prove(
  'the owner, same tenant setting, sees all 2,000,000 rows: RLS does not apply to owners by default',
  current_setting('app.account_id', true) = '42'
  and (select count(*) from app.events) = 2000000);

alter table app.events force row level security;
select lab.prove(
  'after force row level security, the owner sees 2,084',
  (select count(*) from app.events) = 2084);
reset role;

select lab.prove(
  'superusers still skip policies even when forced',
  (select rolsuper from pg_roles where rolname = current_user)
  and (select count(*) from app.events) = 2000000);

create role wg_bypass bypassrls;
grant wg_owner to wg_bypass;
set role wg_bypass;
select lab.prove(
  'and so does a BYPASSRLS role',
  (select count(*) from app.events) = 2000000);
reset role;
drop role wg_bypass;

\echo
\echo '== Pooled connections leak tenants'

set role wg_app;
select set_config('app.account_id', '7', false) \g /dev/null
select lab.prove(
  'a session-scoped tenant outlives its request: the next query still runs as tenant 7',
  (select count(*) from app.projects) = 20 and (select min(account_id) from app.projects) = 7);
reset role;
reset app.account_id;

-- A new connection, so the setting has never been set in this session.
\connect
set role wg_app;

begin;
select set_config('app.account_id', '7', true) \g /dev/null
select lab.prove(
  'set_config(..., true) inside a transaction: tenant 7 sees its 20 projects',
  (select count(*) from app.projects) = 20);
commit;

select lab.prove(
  'after commit, a transaction-local custom setting reverts to an empty string, not to null',
  current_setting('app.account_id', true) = '');

select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  perform count(*) from app.projects;
  raise exception 'no error';
exception when invalid_text_representation then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'so the policy now fails: invalid input syntax for type bigint: ""',
  current_setting('lab.caught') = 'invalid input syntax for type bigint: ""');
reset role;

set role wg_owner;
alter policy tenant_isolation on app.events
  using (account_id = nullif(current_setting('app.account_id', true), '')::bigint);
alter policy tenant_isolation on app.projects
  using (account_id = nullif(current_setting('app.account_id', true), '')::bigint);
reset role;

set role wg_app;
select lab.prove(
  'with nullif(..., ''''), an unset tenant is null again and the query returns zero rows',
  (select count(*) from app.projects) = 0 and (select count(*) from app.events) = 0);

select lab.prove(
  'set_config takes its value as an ordinary parameter (SET can''t)',
  (select set_config('app.account_id', $1, true)) = '42') \bind '42' \g

\echo
\echo '== RLS performance: policies are predicates'

select set_config('app.account_id', '42', false) \g /dev/null

select lab.prove(
  'before any index, the policy is a filter on a sequential scan of the whole table',
  'Seq Scan' = any (lab.nodes($$ select count(*) from app.events where kind = 'deploy' $$))
  or 'Parallel Seq Scan' = any (lab.nodes($$ select count(*) from app.events where kind = 'deploy' $$)));

select lab.prove(
  'and it reads every page of app.events (over 30,000)',
  lab.buffers($$ select count(*) from app.events where kind = 'deploy' $$)
    >= (select relpages from pg_class where oid = 'app.events'::regclass)
  and (select relpages from pg_class where oid = 'app.events'::regclass) > 30000);

reset role;
create index events_account_id_created_at_idx on app.events (account_id, created_at);
set role wg_app;

select lab.prove(
  'with an index leading on the tenant column, the policy becomes an index condition: about 2,036 pages',
  'Bitmap Index Scan' = any (lab.nodes($$ select count(*) from app.events where kind = 'deploy' $$))
  and lab.buffers($$ select count(*) from app.events where kind = 'deploy' $$) between 1900 and 2200);

select lab.prove(
  'recent events use the index for policy and sort: an Index Scan Backward reading under 30 pages',
  (lab.plan($$ select * from app.events order by created_at desc limit 20 $$)
     -> 'Plan' -> 'Plans' -> 0 ->> 'Scan Direction') = 'Backward'
  and lab.buffers($$ select * from app.events order by created_at desc limit 20 $$) < 30);

\echo
\echo '== Leakproof functions'

select lab.prove(
  'int8eq, texteq, timestamptz_eq and their < are leakproof; jsonb =, <, @>, like, ilike are not',
  (select array_agg(p.proname order by p.proname) filter (where p.proleakproof)
   from pg_operator o join pg_proc p on p.oid = o.oprcode
   where (oprleft, oprright) in (('text'::regtype, 'text'::regtype),
                                 ('bigint'::regtype, 'bigint'::regtype),
                                 ('jsonb'::regtype, 'jsonb'::regtype),
                                 ('timestamptz'::regtype, 'timestamptz'::regtype))
     and oprname in ('=', '<', '@>', '~~', '~~*'))
  = array['int8eq', 'int8lt', 'text_lt', 'texteq', 'timestamptz_eq', 'timestamptz_lt']::name[]);

reset role;
create index events_payload_idx on app.events using gin (payload);
analyze app.events;

select lab.prove(
  'as postgres (which bypasses RLS) with the tenant in the query, both indexes combine: about 434 pages, under 500',
  'BitmapAnd' = any (lab.nodes($$ select count(*) from app.events
                                  where account_id = 42 and payload @> '{"duration_ms": 1234}' $$))
  and lab.buffers($$ select count(*) from app.events
                     where account_id = 42 and payload @> '{"duration_ms": 1234}' $$) between 380 and 500);

-- The answer from the sample data, read as postgres for comparison below.
select count(*) as direct_count from public.events
 where account_id = 42 and payload @> '{"duration_ms": 1234}' \gset

set role wg_app;
select lab.prove(
  'through the policy, the GIN index is not allowed: the planner fetches all of the tenant''s rows and filters',
  not (lab.plan($$ select count(*) from app.events where payload @> '{"duration_ms": 1234}' $$)::text
       like '%events_payload_idx%')
  and lab.buffers($$ select count(*) from app.events where payload @> '{"duration_ms": 1234}' $$)
      between 1900 and 2200);

select lab.prove(
  'the same answer either way: the policy changed the cost, not the result',
  (select count(*) from app.events where payload @> '{"duration_ms": 1234}')
  = :direct_count);
reset role;

set role wg_owner;
alter table app.events
  add column duration_ms int
  generated always as ((payload->>'duration_ms')::int) stored;
create index events_account_id_duration_ms_idx on app.events (account_id, duration_ms);
reset role;
vacuum analyze app.events;

set role wg_app;
select lab.prove(
  'promoted to a typed column, one index serves policy and filter: an Index Only Scan reading under 10 pages',
  'Index Only Scan' = any (lab.nodes($$ select count(*) from app.events where duration_ms = 1234 $$))
  and lab.buffers($$ select count(*) from app.events where duration_ms = 1234 $$) < 10);
reset role;

select set_config('lab.caught', '', false) \g /dev/null
do $$ begin
  set local role wg_owner;
  create function app.not_trusted(int) returns boolean language sql leakproof as 'select $1 > 0';
  raise exception 'no error';
exception when insufficient_privilege then
  perform set_config('lab.caught', sqlerrm, false);
end $$;
select lab.prove(
  'wg_owner can''t create a leakproof function: only superuser can define a leakproof function',
  current_setting('lab.caught') = 'only superuser can define a leakproof function');

\echo
\echo '== SECURITY DEFINER functions need a pinned search_path'

-- A schema the app role controls, as "$user" would be for a role with its own schema.
create schema wg_app authorization wg_app;
grant usage on schema wg_app to public;  -- what an attacker would do

set role wg_owner;
create function app.unpinned_event_count(p_account bigint) returns bigint
  language sql stable security definer
  as $$ select count(*) from app.events where account_id = p_account $$;

create function app.account_event_count(p_account bigint) returns bigint
  language sql stable security definer
  set search_path = pg_catalog, pg_temp
  as $$ select count(*) from app.events where account_id = p_account $$;
reset role;

select lab.prove(
  'new functions are executable by everyone until you revoke it from public',
  has_function_privilege('wg_readonly', 'app.account_event_count(bigint)', 'execute'));

set role wg_owner;
revoke execute on function app.account_event_count(bigint) from public;
grant  execute on function app.account_event_count(bigint) to wg_app;
reset role;

select lab.prove(
  'after the revoke, only wg_app (and the owner) can call it',
  not has_function_privilege('wg_readonly', 'app.account_event_count(bigint)', 'execute')
  and has_function_privilege('wg_app', 'app.account_event_count(bigint)', 'execute'));

-- The attack: the caller puts their own schema ahead of pg_catalog and
-- defines a count(*) there. Whatever it does runs as the function's owner.
set role wg_app;
create function wg_app.steal(bigint) returns bigint language plpgsql as $$
begin
  perform set_config('lab.ran_as', current_user, false);
  return $1 + 1;
end $$;
create aggregate wg_app.count(*) (sfunc = wg_app.steal, stype = bigint, initcond = '0');
set search_path = wg_app, pg_catalog;
select set_config('lab.ran_as', '', false) \g /dev/null
select app.unpinned_event_count(42) \g /dev/null

select lab.prove(
  'an unpinned SECURITY DEFINER function ran the caller''s count(*), as wg_owner',
  current_setting('lab.ran_as') = 'wg_owner');

select set_config('lab.ran_as', '', false) \g /dev/null
select lab.prove(
  'with search_path pinned to pg_catalog, pg_temp, the real count runs and the caller''s code does not',
  app.account_event_count(42) = 2084 and current_setting('lab.ran_as') = '');
reset search_path;

select lab.prove(
  'the definer runs as wg_owner, which forced RLS binds too: tenant 42 asking for tenant 7 gets 0',
  app.account_event_count(7) = 0);
reset role;

alter table app.events no force row level security;
set role wg_app;
select lab.prove(
  'without forced RLS, the same call returns tenant 7''s events',
  app.account_event_count(7) > 0);
reset role;
alter table app.events force row level security;

\echo
\echo '== Connections: pg_hba, passwords, and TLS'

select lab.prove(
  'password_encryption defaults to scram-sha-256',
  (select boot_val from pg_settings where name = 'password_encryption') = 'scram-sha-256');

select lab.prove(
  'wg_app''s stored password is a SCRAM-SHA-256 verifier',
  (select left(rolpassword, 14) from pg_authid where rolname = 'wg_app') = 'SCRAM-SHA-256$');

select lab.prove(
  'PostgreSQL 18 has md5_password_warnings, on by default',
  (select boot_val from pg_settings where name = 'md5_password_warnings') = 'on');

select lab.prove(
  'pg_hba_file_rules shows the parsed rules',
  (select count(*) > 0 from pg_hba_file_rules));

select lab.prove(
  'pg_stat_ssl joins to pg_stat_activity by pid',
  (select count(*) >= 0 from pg_stat_ssl s join pg_stat_activity a using (pid)));

\echo
\echo '== Auditing basics'

select lab.prove(
  'log_connections takes a list in PostgreSQL 18 (it is a string, not a boolean)',
  (select vartype from pg_settings where name = 'log_connections') = 'string');

select lab.prove(
  'the privilege review finds no login role with dangerous attributes among ours',
  not exists (select 1 from pg_roles
              where rolname like 'wg\_%' and rolcanlogin
                and (rolsuper or rolbypassrls or rolcreaterole)));

select lab.prove(
  'the CI check catches app.projects: RLS enabled but not forced',
  (select array_agg(c.relname::text)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p') and n.nspname = 'app'
     and not (c.relrowsecurity and c.relforcerowsecurity)) = array['projects']);

\echo
\echo '== Cleaning up the roles (they are cluster-wide)'
\connect
-- One role at a time: a single drop owned naming several roles that share a
-- default-privileges entry fails with "could not find tuple for default ACL".
drop owned by wg_app cascade;
drop owned by wg_readonly cascade;
drop owned by wg_analyst cascade;
drop owned by wg_migrator cascade;
drop owned by wg_owner cascade;
drop role wg_owner, wg_app, wg_readonly, wg_analyst, wg_migrator;
select lab.prove('the lab''s roles are gone',
  not exists (select 1 from pg_roles where rolname like 'wg\_%'));
