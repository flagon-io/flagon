-- Lab for "Someone else runs the box"
-- https://www.flagon.io/books/eight-kilobytes/managed
-- Run: ./lab 33-managed
--
-- No laptop can run a cloud provider, but every managed service hands you
-- the same shape of account: a role with LOGIN, CREATEROLE and CREATEDB and
-- no SUPERUSER. This lab builds that role and checks what it can't do, what
-- the predefined roles give back, which settings need a restart, and what a
-- "CPU" bar on a provider's load chart is in pg_stat_activity terms.
--
-- Roles are cluster-wide, so the lab drops leftovers from an earlier run at
-- the start and drops its own roles at the end.

\pset tuples_only on
\pset format unaligned

drop role if exists mg_admin, mg_app, mg_other, mg_watch;

create extension if not exists dblink;

-- The lab's roles call lab.prove() while SET ROLE is in effect.
grant usage on schema lab to public;

-- Runs a statement as the current role and returns 'ok' or the SQLSTATE it
-- failed with, so a lab.prove can check the exact error.
create or replace function public.try_sql(q text)
returns text
language plpgsql
as $$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlstate;
end
$$;

\echo
\echo '== The admin role is not a superuser'

-- Shaped like the account a managed service gives you.
create role mg_admin login createrole createdb;
grant create on database :"DBNAME" to mg_admin;

select lab.prove(
  'the admin role has LOGIN, CREATEROLE and CREATEDB, and no SUPERUSER, REPLICATION or BYPASSRLS',
  (select rolcanlogin and rolcreaterole and rolcreatedb
          and not rolsuper and not rolreplication and not rolbypassrls
   from pg_roles where rolname = 'mg_admin'));

-- ALTER SYSTEM refuses to run inside a transaction block, so try it over a
-- separate connection as the admin role.
select dblink_connect('mg_admin_conn', format('dbname=%s user=mg_admin', current_database())) \g /dev/null

do $$
begin
  perform dblink_exec('mg_admin_conn', $q$ alter system set work_mem = '64MB' $q$);
  raise exception 'no error';
exception when insufficient_privilege then
  perform set_config('mg.alter_system', 'denied', false);
end
$$;

select lab.prove(
  'ALTER SYSTEM fails for the admin role with insufficient_privilege (42501)',
  current_setting('mg.alter_system') = 'denied');

select dblink_disconnect('mg_admin_conn') \g /dev/null

set role mg_admin;

select lab.prove(
  'reading a server file with pg_read_file is denied (42501)',
  try_sql($$ select pg_read_file('postgresql.conf') $$) = '42501');

select lab.prove(
  'listing the data directory with pg_ls_dir is denied (42501)',
  try_sql($$ select pg_ls_dir('.') $$) = '42501');

select lab.prove(
  'COPY to a server file is denied (42501)',
  try_sql($$ copy (select 1) to '/tmp/mg_copy.txt' $$) = '42501');

select lab.prove(
  'COPY TO PROGRAM is denied (42501)',
  try_sql($$ copy (select 1) to program 'cat' $$) = '42501');

select lab.prove(
  'a function in the untrusted language C is denied (42501)',
  try_sql($$ create function mg_c() returns int language c as 'nothing', 'nothing' $$) = '42501');

select lab.prove(
  'setting a superuser-only parameter for the session is denied (42501)',
  try_sql($$ set log_min_duration_statement = 0 $$) = '42501');

reset role;

\echo
\echo '== Trusted and untrusted extensions'

select lab.prove(
  'hstore and btree_gist are marked trusted; pg_visibility and pg_walinspect are not',
  (select bool_and(trusted) filter (where name in ('hstore', 'btree_gist'))
          and not bool_or(trusted) filter (where name in ('pg_visibility', 'pg_walinspect'))
   from pg_available_extension_versions
   where name in ('hstore', 'btree_gist', 'pg_visibility', 'pg_walinspect')));

set role mg_admin;

select lab.prove(
  'the admin role can create a trusted extension (hstore)',
  try_sql($$ create extension hstore $$) = 'ok');

select lab.prove(
  'the admin role cannot create an untrusted extension (pg_visibility): 42501',
  try_sql($$ create extension pg_visibility $$) = '42501');

reset role;

\echo
\echo '== Per-role settings work without superuser'

set role mg_admin;

select lab.prove(
  'the admin role can create an app role',
  try_sql($$ create role mg_app login $$) = 'ok');

select lab.prove(
  'ALTER ROLE ... SET works for an ordinary parameter (statement_timeout)',
  try_sql($$ alter role mg_app set statement_timeout = '5s' $$) = 'ok');

select lab.prove(
  'ALTER ROLE ... SET fails for a superuser-only parameter (log_min_duration_statement): 42501',
  try_sql($$ alter role mg_app set log_min_duration_statement = 250 $$) = '42501');

reset role;

grant set on parameter log_min_duration_statement to mg_admin;

set role mg_admin;

select lab.prove(
  'after GRANT SET ON PARAMETER (PostgreSQL 15+), the same ALTER ROLE ... SET works',
  try_sql($$ alter role mg_app set log_min_duration_statement = 250 $$) = 'ok');

reset role;

select lab.prove(
  'the per-role settings are stored in pg_db_role_setting',
  (select setconfig @> array['statement_timeout=5s', 'log_min_duration_statement=250']
   from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
   where r.rolname = 'mg_app'));

\echo
\echo '== Static parameters are postmaster context'

select lab.prove(
  'shared_buffers, max_connections and shared_preload_libraries need a restart (context postmaster)',
  (select bool_and(context = 'postmaster') from pg_settings
   where name in ('shared_buffers', 'max_connections', 'shared_preload_libraries'))
  and (select count(*) from pg_settings
       where name in ('shared_buffers', 'max_connections', 'shared_preload_libraries')) = 3);

select lab.prove(
  'work_mem and random_page_cost can change per session (context user)',
  (select bool_and(context = 'user') from pg_settings
   where name in ('work_mem', 'random_page_cost')));

select lab.prove(
  'autovacuum_vacuum_scale_factor and checkpoint_timeout need only a reload (context sighup)',
  (select bool_and(context = 'sighup') from pg_settings
   where name in ('autovacuum_vacuum_scale_factor', 'checkpoint_timeout')));

select lab.prove(
  'log_min_duration_statement is superuser context',
  (select context = 'superuser' from pg_settings where name = 'log_min_duration_statement'));

\echo
\echo '== Predefined roles hand back pieces of superuser'

select lab.prove(
  'pg_monitor is a member of pg_read_all_settings, pg_read_all_stats and pg_stat_scan_tables',
  (select array_agg(r.rolname::text order by r.rolname)
   from pg_auth_members m
   join pg_roles r on r.oid = m.roleid
   join pg_roles u on u.oid = m.member
   where u.rolname = 'pg_monitor')
  = array['pg_read_all_settings', 'pg_read_all_stats', 'pg_stat_scan_tables']);

create role mg_watch login;
create role mg_other login;

set role mg_watch;
select lab.prove(
  'without pg_read_all_settings, reading data_directory is denied (42501)',
  try_sql($$ select current_setting('data_directory') $$) = '42501');
reset role;

grant pg_read_all_settings to mg_watch;

set role mg_watch;
select lab.prove(
  'with pg_read_all_settings, reading data_directory works',
  try_sql($$ select current_setting('data_directory') $$) = 'ok');
reset role;

-- Another role's session, busy with a query.
select dblink_connect('mg_other_conn',
  format('dbname=%s user=mg_other application_name=mg_sleeper', current_database())) \g /dev/null
select dblink_send_query('mg_other_conn', 'select pg_sleep(30)') \g /dev/null
select pg_sleep(0.5) \g /dev/null

set role mg_watch;
select lab.prove(
  'without pg_read_all_stats, another role''s query shows as <insufficient privilege>',
  (select query = '<insufficient privilege>' and wait_event is null
   from pg_stat_activity where application_name = 'mg_sleeper'));

select lab.prove(
  'without pg_signal_backend, cancelling another role''s query is denied (42501)',
  try_sql(format('select pg_cancel_backend(%s)',
    (select pid from pg_stat_activity where application_name = 'mg_sleeper'))) = '42501');
reset role;

grant pg_read_all_stats, pg_signal_backend to mg_watch;

set role mg_watch;
select lab.prove(
  'with pg_read_all_stats, the query text and wait event are visible',
  (select query = 'select pg_sleep(30)' and wait_event = 'PgSleep'
   from pg_stat_activity where application_name = 'mg_sleeper'));

select lab.prove(
  'with pg_signal_backend, cancelling it works',
  (select pg_cancel_backend(pid) from pg_stat_activity where application_name = 'mg_sleeper'));
reset role;

select count(*) >= 0 from dblink_get_result('mg_other_conn', false) as t(x text) \g /dev/null
select dblink_disconnect('mg_other_conn') \g /dev/null

\echo
\echo '== "CPU" on a load chart is an active session with no wait event'

select lab.prove(
  'PostgreSQL has no wait event called CPU (pg_wait_events, PostgreSQL 17+)',
  not exists (select 1 from pg_wait_events where name ilike 'cpu'));

select dblink_connect('mg_cpu_conn',
  format('dbname=%s application_name=mg_spinner', current_database())) \g /dev/null
select dblink_send_query('mg_cpu_conn',
  $q$ do $d$ declare i bigint := 0; begin while i < 2000000000 loop i := i + 1; end loop; end $d$ $q$) \g /dev/null
select pg_sleep(0.3) \g /dev/null

create temp table mg_samples (state text, wait_event_type text, wait_event text);
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';
select pg_sleep(0.05) \g /dev/null
insert into mg_samples select state, wait_event_type, wait_event from pg_stat_activity where application_name = 'mg_spinner';

select lab.prove(
  'a CPU-bound session samples as active with no wait event (at least 8 of 10 samples)',
  (select count(*) filter (where state = 'active' and wait_event is null) >= 8
   from mg_samples));

select pg_cancel_backend(pid) from pg_stat_activity where application_name = 'mg_spinner' \g /dev/null
select count(*) >= 0 from dblink_get_result('mg_cpu_conn', false) as t(x text) \g /dev/null
select dblink_disconnect('mg_cpu_conn') \g /dev/null

\echo
\echo '== Cleaning up the roles (they are cluster-wide)'
drop function public.try_sql(text);
drop owned by mg_admin, mg_app, mg_other, mg_watch cascade;
drop role mg_app, mg_admin, mg_other, mg_watch;
select lab.prove('the lab''s roles are gone',
  not exists (select 1 from pg_roles where rolname like 'mg\_%'));
