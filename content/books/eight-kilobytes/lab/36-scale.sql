-- Lab for "Scale up before you scale out"
-- https://www.flagon.io/books/eight-kilobytes/scale
-- Run: ./lab 36-scale
--
-- The seed's events run from 2025-10-06 to 2026-10-06, so the chapter's
-- literal dates (September 2026, the third quarter) mean the same rows on
-- every kit. The opening benchmark's throughput numbers are specific to our
-- machine; here we prove the mechanism behind them (row lock waits) with
-- dblink sessions instead.

\pset tuples_only on
\pset format unaligned

create extension if not exists dblink;
create extension if not exists pg_visibility;
select 'dbname=' || current_database() || ' user=' || current_user as conn \gset

\set month_from '2026-09-01'
\set month_to '2026-10-01'

\echo
\echo '== What it waits on: a hot row is a line of waiting transactions'

create table account_totals (account_id bigint primary key, events bigint not null default 0);
insert into account_totals (account_id) select id from accounts;

select dblink_connect('s1', :'conn') \g /dev/null
select dblink_connect('s2', :'conn') \g /dev/null
select dblink_connect('s3', :'conn') \g /dev/null
select * from dblink('s2', 'select pg_backend_pid()') as t(pid int) \gset s2_
select * from dblink('s3', 'select pg_backend_pid()') as t(pid int) \gset s3_

-- Three "inserts" that each bump the same counter row, none committed yet.
select dblink_exec('s1', 'begin') \g /dev/null
select dblink_exec('s1', 'update account_totals set events = events + 1 where account_id = 42') \g /dev/null
select dblink_send_query('s2', 'update account_totals set events = events + 1 where account_id = 42') \g /dev/null
select pg_sleep(0.5) \g /dev/null
select dblink_send_query('s3', 'update account_totals set events = events + 1 where account_id = 42') \g /dev/null
select pg_sleep(0.5) \g /dev/null

select lab.prove(
  'the second writer of the counter row waits on Lock transactionid (the first writer''s transaction)',
  (select wait_event_type = 'Lock' and wait_event = 'transactionid'
   from pg_stat_activity where pid = :s2_pid));
select lab.prove(
  'the third waits on Lock tuple, queued behind the second',
  (select wait_event_type = 'Lock' and wait_event = 'tuple'
   from pg_stat_activity where pid = :s3_pid));

select dblink_exec('s1', 'commit') \g /dev/null
select * from dblink_get_result('s2') as t(status text) \g /dev/null
select * from dblink_get_result('s2') as t(status text) \g /dev/null
select * from dblink_get_result('s3') as t(status text) \g /dev/null
select * from dblink_get_result('s3') as t(status text) \g /dev/null
select lab.prove(
  'they commit one at a time: all three increments land',
  (select events from account_totals where account_id = 42) = 3);

\echo '-- Spreading the counter across slots removes the wait'
create table account_totals_slotted (
  account_id bigint not null, slot int not null, events bigint not null default 0,
  primary key (account_id, slot));
insert into account_totals_slotted select 42, s from generate_series(0, 7) s;
select dblink_exec('s1', 'begin') \g /dev/null
select dblink_exec('s1', 'update account_totals_slotted set events = events + 1 where account_id = 42 and slot = 0') \g /dev/null
set lock_timeout = '1s';
update account_totals_slotted set events = events + 1 where account_id = 42 and slot = 1;
reset lock_timeout;
select lab.prove(
  'a writer on another slot of the same account does not wait',
  (select events from account_totals_slotted where account_id = 42 and slot = 1) = 1);
select dblink_exec('s1', 'commit') \g /dev/null
select lab.prove(
  'the total is the sum of the slots',
  (select sum(events) from account_totals_slotted where account_id = 42) = 2);

\echo
\echo '== Fix the query you found'

select format($q$
  select (created_at at time zone 'UTC')::date as day,
         count(*) as events,
         count(*) filter (where kind = 'deploy') as deploys,
         count(*) filter (where kind = 'deploy' and payload->>'status' = 'failed') as failed_deploys
  from events
  where account_id = 42 and created_at >= %L and created_at < %L
  group by 1 order by 1 $q$, :'month_from', :'month_to') as dashboard \gset

select lab.buffers(:'dashboard') as raw_pages \gset
select lab.prove(
  'with no index, one account''s month reads the whole table: over 35,000 pages',
  :raw_pages > 35000);

create index events_account_created_idx on events (account_id, created_at);
select lab.buffers(:'dashboard') as indexed_pages \gset
select lab.prove(
  'with (account_id, created_at), the same chart reads under 300 pages',
  :indexed_pages < 300);
select lab.prove(
  'a reduction of over 100x for one line of DDL',
  :raw_pages > 100 * :indexed_pages);
select lab.prove(
  'the indexed plan still visits about one heap page per event',
  (with recursive walk(n) as (
     select lab.plan(:'dashboard') -> 'Plan'
     union all
     select c from walk, jsonb_array_elements(coalesce(n -> 'Plans', '[]')) c)
   select (n ->> 'Exact Heap Blocks')::numeric / (n ->> 'Actual Rows')::numeric > 0.8
   from walk where n ->> 'Node Type' = 'Bitmap Heap Scan'));

\echo
\echo '== Precompute what you show'

\echo '-- Pick the grain'
select count(distinct (project_id, created_at::date)) as project_days,
       count(distinct (account_id, created_at::date)) as account_days
from events \gset
select lab.prove(
  'a per-project daily rollup would have about 1.75 million rows for 2 million events',
  :project_days between 1600000 and 1900000);
select lab.prove(
  'a per-account daily rollup has about 363,000 rows, about five events per row',
  :account_days between 340000 and 390000
  and 2000000.0 / :account_days between 5 and 6);

\echo '-- Build it'
create table account_daily (
  account_id      bigint not null,
  day             date   not null,
  events          int    not null,
  deploys         int    not null,
  failed_deploys  int    not null,
  builds          int    not null,
  alerts          int    not null,
  primary key (account_id, day)
);

insert into account_daily
select account_id,
       (created_at at time zone 'UTC')::date,
       count(*),
       count(*) filter (where kind = 'deploy'),
       count(*) filter (where kind = 'deploy' and payload->>'status' = 'failed'),
       count(*) filter (where kind = 'build'),
       count(*) filter (where kind = 'alert')
from events
group by 1, 2;
vacuum analyze account_daily;

select lab.prove(
  'the rollup holds about 363,000 rows in under 3,000 heap pages',
  (select count(*) from account_daily) between 340000 and 390000
  and pg_relation_size('account_daily') / 8192 < 3000);

\echo '-- The dashboard, before and after'
select format($q$
  select day, events, deploys, failed_deploys
  from account_daily
  where account_id = 42 and day >= %L and day < %L
  order by day $q$, :'month_from', :'month_to') as rollup_dashboard \gset
select lab.buffers(:'rollup_dashboard') as rollup_pages \gset
select lab.prove(
  'the rollup answers the same month in under 10 pages',
  :rollup_pages < 10);
select lab.prove(
  'and returns one row per day with events (at most 30), whatever the account''s volume',
  (lab.plan(:'rollup_dashboard') -> 'Plan' ->> 'Actual Rows')::numeric
  = (select count(distinct (created_at at time zone 'UTC')::date) from events
     where account_id = 42 and created_at >= :'month_from' and created_at < :'month_to')
  and (lab.plan(:'rollup_dashboard') -> 'Plan' ->> 'Actual Rows')::numeric <= 30);
select lab.prove(
  'it agrees with the raw query',
  (select sum(events) from account_daily
   where account_id = 42 and day >= :'month_from' and day < :'month_to')
  = (select count(*) from events
     where account_id = 42 and created_at >= :'month_from' and created_at < :'month_to'));

\set q_from '2026-07-01'
select lab.buffers(format($q$
  select account_id, count(*) as failed_deploys
  from events
  where kind = 'deploy' and payload->>'status' = 'failed'
    and created_at >= %L and created_at < %L
  group by account_id order by failed_deploys desc limit 10 $q$, :'q_from', :'month_to')) as q_raw \gset
select lab.buffers(format($q$
  select account_id, sum(failed_deploys) as failed_deploys
  from account_daily
  where day >= %L and day < %L
  group by account_id order by failed_deploys desc limit 10 $q$, :'q_from', :'month_to')) as q_rollup \gset
select lab.prove(
  'the cross-tenant quarterly report touches under a third of the raw pages on the rollup',
  :q_rollup < :q_raw / 3.0);
select lab.prove(
  'the rollup side reads a few thousand pages: 2,500 to 5,000 (the whole rollup is about 2,700)',
  :q_rollup between 2500 and 5000
  and pg_relation_size('account_daily') / 8192 between 2500 and 3000);

\echo '-- Keep it fresh with an upsert'
create index events_created_idx on events (created_at);
-- 5,000 new deploys: about 300 just before midnight on 2026-10-05 (the last
-- full day of the sample data), the rest just after.
insert into events (account_id, project_id, user_id, kind, payload, created_at)
select p.account_id, p.id, p.owner_id, 'deploy', '{"status": "ok"}',
       timestamptz '2026-10-05 23:55+00' + g * interval '1 second'
from generate_series(1, 5000) g
join projects p on p.id = 1 + (g * 13) % 20000;

-- The chapter's job starts its window at date_trunc('day', now() - interval
-- '1 day', 'UTC'); here "now" is the morning of 2026-10-06.

select $q$
insert into account_daily as d
select account_id,
       (created_at at time zone 'UTC')::date,
       count(*),
       count(*) filter (where kind = 'deploy'),
       count(*) filter (where kind = 'deploy' and payload->>'status' = 'failed'),
       count(*) filter (where kind = 'build'),
       count(*) filter (where kind = 'alert')
from events
where created_at >= '2026-10-05'
group by 1, 2
on conflict (account_id, day) do update
set events         = excluded.events,
    deploys        = excluded.deploys,
    failed_deploys = excluded.failed_deploys,
    builds         = excluded.builds,
    alerts         = excluded.alerts
where (d.events, d.deploys, d.failed_deploys, d.builds, d.alerts)
      is distinct from
      (excluded.events, excluded.deploys, excluded.failed_deploys, excluded.builds, excluded.alerts)
$q$ as refresh \gset

select lab.plan(:'refresh') -> 'Plan' as first_run \gset
select lab.prove(
  'the first refresh after 5,000 new events writes rows (inserts plus changed days)',
  (:'first_run'::jsonb ->> 'Tuples Inserted')::numeric
  + (:'first_run'::jsonb ->> 'Conflicting Tuples')::numeric
  - coalesce((:'first_run'::jsonb ->> 'Rows Removed by Conflict Filter')::numeric, 0) > 0);
select lab.prove(
  'it inserted 1,000 new account-days, changed about 300, and skipped about 700 unchanged ones',
  (:'first_run'::jsonb ->> 'Tuples Inserted')::numeric = 1000
  and (:'first_run'::jsonb ->> 'Conflicting Tuples')::numeric
      - (:'first_run'::jsonb ->> 'Rows Removed by Conflict Filter')::numeric between 250 and 350
  and (:'first_run'::jsonb ->> 'Rows Removed by Conflict Filter')::numeric between 650 and 750);
select lab.prove(
  'the refresh found recent events through events_created_idx',
  :'first_run'::text like '%events_created_idx%');

select md5(string_agg(ctid::text, ',' order by account_id, day)) as versions_before
from account_daily where day >= '2026-10-05' \gset
select lab.plan(:'refresh') -> 'Plan' as second_run \gset
select lab.prove(
  'run it again and nothing is written: 0 rows out of the Insert node',
  (:'second_run'::jsonb ->> 'Actual Rows')::numeric = 0
  and (:'second_run'::jsonb ->> 'Tuples Inserted')::numeric = 0);
select lab.prove(
  'every conflicting row was skipped by the is distinct from filter',
  (:'second_run'::jsonb ->> 'Rows Removed by Conflict Filter')::numeric
  = (:'second_run'::jsonb ->> 'Conflicting Tuples')::numeric);
select lab.prove(
  'no row got a new version: every row in the window is where it was',
  (select md5(string_agg(ctid::text, ',' order by account_id, day))
   from account_daily where day >= '2026-10-05') = :'versions_before');
select lab.prove(
  'the rollup now agrees with the raw table for both days in the window',
  (select sum(events) from account_daily where day >= '2026-10-05')
  = (select count(*) from events where created_at >= '2026-10-05'));

\echo
\echo '== Materialized views'

-- The 30 days before the end of the sample data (now() in production).
\set mv_from '2026-09-06'
create materialized view project_activity_30d as
select project_id,
       count(*)                                as events,
       count(*) filter (where kind = 'deploy') as deploys,
       max(created_at)                         as last_event_at
from events
where created_at >= :'mv_from'
group by project_id;

select lab.prove(
  'the view has a row for nearly every project (about 20,000)',
  (select count(*) from project_activity_30d) between 19000 and 20000);

\echo '-- CONCURRENTLY needs a unique index'
select dblink_exec('s1',
  'refresh materialized view concurrently project_activity_30d', false) \g /dev/null
select lab.prove(
  'without a unique index, refresh concurrently fails: create a unique index with no WHERE clause',
  dblink_error_message('s1') like '%cannot refresh materialized view "public.project_activity_30d" concurrently%');

create unique index on project_activity_30d (project_id);

\echo '-- A plain refresh locks readers out; a concurrent one does not'
select * from dblink('s1', 'select pg_backend_pid()') as t(pid int) \gset s1_
select dblink_exec('s1', 'begin') \g /dev/null
select dblink_exec('s1', 'refresh materialized view project_activity_30d') \g /dev/null
select lab.prove(
  'a plain refresh holds ACCESS EXCLUSIVE on the view until it commits',
  exists (select 1 from pg_locks where pid = :s1_pid
          and relation = 'project_activity_30d'::regclass and mode = 'AccessExclusiveLock'));
set lock_timeout = '1s';
select lab.prove(
  'so a reader waits (it times out here)',
  dblink_exec('s2', 'set lock_timeout = ''1s''') = 'SET'
  and dblink_exec('s2', 'select count(*) from project_activity_30d', false) = 'ERROR'
  and dblink_error_message('s2') like '%lock timeout%');
reset lock_timeout;
select dblink_exec('s1', 'commit') \g /dev/null

select dblink_exec('s1', 'begin') \g /dev/null
select dblink_exec('s1', 'refresh materialized view concurrently project_activity_30d') \g /dev/null
select lab.prove(
  'a concurrent refresh takes only EXCLUSIVE, which lets readers through',
  exists (select 1 from pg_locks where pid = :s1_pid
          and relation = 'project_activity_30d'::regclass and mode = 'ExclusiveLock')
  and not exists (select 1 from pg_locks where pid = :s1_pid
          and relation = 'project_activity_30d'::regclass and mode = 'AccessExclusiveLock'));
select lab.prove(
  'a reader gets its answer while the refresh is still open',
  (select n from dblink('s2', 'select count(*) from project_activity_30d') as t(n bigint)) > 0);
select dblink_exec('s1', 'commit') \g /dev/null

\echo '-- The plain form writes a new copy; the concurrent form writes only the differences'
select pg_relation_filenode('project_activity_30d') as mv_file \gset
select pg_stat_statements_reset(0, (select oid from pg_database where datname = current_database()), 0) \g /dev/null
refresh materialized view project_activity_30d;
select lab.prove(
  'a plain refresh swaps in a new file',
  pg_relation_filenode('project_activity_30d') <> :mv_file);
-- A handful of new events, so a few rows of the view change.
insert into events (account_id, project_id, user_id, kind)
select p.account_id, p.id, p.owner_id, 'deploy' from projects p where p.id <= 20;
select pg_relation_filenode('project_activity_30d') as mv_file \gset
refresh materialized view concurrently project_activity_30d;
select lab.prove(
  'a concurrent refresh keeps the same file and applies the changes in place',
  pg_relation_filenode('project_activity_30d') = :mv_file);
select lab.prove(
  'the concurrent refresh wrote under a tenth of the plain refresh''s WAL',
  (select sum(wal_bytes) filter (where query like '%concurrently%')
        < sum(wal_bytes) filter (where query not like '%concurrently%') / 10
   from pg_stat_statements
   where dbid = (select oid from pg_database where datname = current_database())
     and query like 'refresh materialized view%'));
select lab.prove(
  'the plain refresh wrote over a megabyte of WAL to rebuild 20,000 rows',
  (select sum(wal_bytes) from pg_stat_statements
   where dbid = (select oid from pg_database where datname = current_database())
     and query = 'refresh materialized view project_activity_30d') > 1000000);

\echo
\echo '== Unlogged tables for disposable data'
create table import_staging_logged   (like events);
create unlogged table import_staging (like events);
\set staging_to '2026-01-01'

select lab.wal_bytes(format('insert into import_staging_logged select * from events where created_at < %L', :'staging_to')) as logged_wal \gset
select lab.wal_bytes(format('insert into import_staging select * from events where created_at < %L', :'staging_to')) as unlogged_wal \gset
select lab.prove(
  'the same rows into the same shape: tens of megabytes of WAL logged',
  :logged_wal > 20000000);
select lab.prove(
  'and next to none unlogged (under 0.1 percent of it)',
  :unlogged_wal < :logged_wal / 1000.0);
select lab.prove(
  'an unlogged table is marked relpersistence = u',
  (select relpersistence from pg_class where relname = 'import_staging') = 'u');

select pg_relation_filenode('import_staging') as staging_file \gset
alter table import_staging set logged;
select lab.prove(
  'alter table ... set logged rewrites the table into a new file',
  pg_relation_filenode('import_staging') <> :staging_file);

\echo
\echo '== Archive cold rows'
create table events_archive (like events including defaults);
\set archive_before '2025-11-01'
select count(*) as total_before from events \gset
with moved as (
  delete from events
  where id in (
    select id from events
    where created_at < :'archive_before'
    order by id
    limit 10000
  )
  returning *
)
insert into events_archive
select * from moved;
select lab.prove(
  'one batch moves exactly 10,000 rows, and none are lost',
  (select count(*) from events_archive) = 10000
  and (select count(*) from events) + 10000 = :total_before);

\echo
\echo '== How far one box goes'

\echo '-- Writes and WAL'
select pg_stat_statements_reset(0, (select oid from pg_database where datname = current_database()), 0) \g /dev/null
-- 1,000 single-row inserts, each its own statement and transaction, into
-- events with its three indexes (primary key, account+created, created).
-- They all go to one project, so they land on the same few pages and the
-- average isn't swamped by full-page images after a checkpoint.
select format($q$insert into events (account_id, project_id, user_id, kind) values (%s, %s, %s, 'build')$q$,
              p.account_id, p.id, p.owner_id)
from projects p, generate_series(1, 1000) where p.id = 1 \gexec
select lab.prove(
  'events has three indexes',
  (select count(*) from pg_index where indrelid = 'events'::regclass) = 3);
select lab.prove(
  'a single-row insert into events writes a few hundred bytes of WAL (we saw about 600)',
  (select sum(wal_bytes) / sum(calls) from pg_stat_statements
   where dbid = (select oid from pg_database where datname = current_database())
     and query like 'insert into events (account_id, project_id, user_id, kind) values%')
  between 200 and 1200);
select lab.prove(
  '600 bytes x 50,000 inserts/s is 30 MB/s, about 2.6 TB a day',
  600 * 50000 = 30000000 and round(600::numeric * 50000 * 86400 / 1e12, 1) = 2.6);

\echo '-- Vacuum on huge tables'
select pg_relation_size('events') as events_bytes \gset
-- A checkpoint first, so the freeze is the first change to every page since
-- one, as it would be on a big table in real life.
checkpoint;
select pg_stat_statements_reset(0, (select oid from pg_database where datname = current_database()), 0) \g /dev/null
vacuum (freeze) events;
select lab.prove(
  'freezing every page of events writes WAL on the order of the table''s own size (over half of it)',
  (select sum(wal_bytes) from pg_stat_statements
   where dbid = (select oid from pg_database where datname = current_database())
     and query like 'vacuum%') > :events_bytes / 2);
select lab.prove(
  'afterwards (nearly) every page of events is all-frozen',
  (select all_frozen from pg_visibility_map_summary('events'))
  >= 0.99 * pg_relation_size('events') / 8192);

\echo '-- Restore time'
select lab.prove(
  '10 TB at 500 MB/s is about five and a half hours',
  round(10e12 / 500e6 / 3600, 1) = 5.6);

select dblink_disconnect('s1') \g /dev/null
select dblink_disconnect('s2') \g /dev/null
select dblink_disconnect('s3') \g /dev/null
