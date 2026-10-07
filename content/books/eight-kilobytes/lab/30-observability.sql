-- Lab for "Watch it run"
-- https://www.flagon.io/books/eight-kilobytes/observability
-- Run: ./lab 30-observability
--
-- Runs the chapter's workload with pgbench (the scripts are in workload/),
-- with fixed call counts so the checks don't depend on machine speed, then
-- checks what pg_stat_statements, pg_stat_activity, and the
-- table and index views say about it. Cluster-wide views (pg_stat_io,
-- pg_stat_checkpointer, pg_stat_wal) are shared with everything else on the
-- server, so for those the lab proves the shape, not the numbers.

\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;
create extension if not exists pgstattuple;

-- This database's own rows in pg_stat_statements (the view is cluster-wide).
create view lab.stmts as
  select * from pg_stat_statements
  where dbid = (select oid from pg_database where datname = current_database());

\echo
\echo '== Counters start from zero more often than you think'

select lab.prove(
  'a database cloned from a template starts with empty statistics: n_live_tup is 0 for 100,000 users',
  (select n_live_tup from pg_stat_user_tables where relname = 'users') = 0
  and (select reltuples from pg_class where relname = 'users') = 100000);

\echo
\echo '== Setting it up'

select lab.prove(
  'pg_stat_statements is preloaded, compute_query_id is auto, and it tracks top-level statements',
  current_setting('shared_preload_libraries') like '%pg_stat_statements%'
  and current_setting('compute_query_id') = 'auto'
  and current_setting('pg_stat_statements.track') = 'top');

select lab.prove(
  'pg_stat_statements.track_planning is off by default',
  (select boot_val from pg_settings where name = 'pg_stat_statements.track_planning') = 'off');

\echo
\echo '== How statements are grouped'

select count(*) from users where id in (1, 2);
select count(*) from users where id in (1, 2, 3, 4, 5);
select count(*) from users where id in (7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
select count(*) from users where id = any('{1,2,3}'::bigint[]);
select count(*) from users where id in ($1, $2) \bind 1 2 \g
select count(*) from users where id in ($1, $2, $3) \bind 1 2 3 \g

select lab.prove(
  'PostgreSQL 18 collapses IN lists of any length into one entry, shown as in ($1 /*, ... */)',
  (select calls from lab.stmts
   where query = 'select count(*) from users where id in ($1 /*, ... */)') = 5);

select lab.prove(
  'bind-parameter lists collapse the same way',
  (select count(*) from lab.stmts where query like 'select count(*) from users where id in%') = 1);

select lab.prove(
  '= any(array) is its own single entry',
  exists (select 1 from lab.stmts
          where query = 'select count(*) from users where id = any($1::bigint[])'));

select count(*) from projects where id = 1;
select   count(*)
  from projects   where id = 2;

select lab.prove(
  'whitespace and constants do not change the queryid',
  (select calls from lab.stmts where query = 'select count(*) from projects where id = $1') = 2);

create table scratch (id int);
select count(*) from scratch where id = 1;
drop table scratch;
create table scratch (id int);
select count(*) from scratch where id = 1;

select lab.prove(
  'PostgreSQL 18 hashes tables by name: a dropped and recreated table keeps its queryid',
  (select calls from lab.stmts where query = 'select count(*) from scratch where id = $1') = 2);

create function lab.one(int) returns int language sql as 'select $1';
select lab.one(1);
drop function lab.one(int);
create function lab.one(int) returns int language sql as 'select $1';
select lab.one(1);

select lab.prove(
  'a dropped and recreated function gets a new queryid',
  (select count(distinct queryid) from lab.stmts where query = 'select lab.one($1)') = 2);

select lab.prove(
  'the queryid also appears in pg_stat_activity, as query_id',
  (select query_id is not null from pg_stat_activity where pid = pg_backend_pid()));

\echo
\echo '   running the workload with pgbench: 2,000 lookups, 200 inserts, 200 project lists, 40 reports'

\setenv PGDATABASE :DBNAME
\! pgbench -n -c 4 -j 4 -t 500 -f /lab/workload/lookup.pgbench > /dev/null 2>&1
\! pgbench -n -c 4 -j 4 -t 50 -f /lab/workload/insert.pgbench > /dev/null 2>&1
\! pgbench -n -c 4 -j 4 -t 50 -f /lab/workload/projects.pgbench > /dev/null 2>&1
\! pgbench -n -c 4 -j 4 -t 10 -f /lab/workload/report.pgbench > /dev/null 2>&1
select pg_sleep(1.5);  -- let the pgbench sessions' statistics flush
select pg_stat_clear_snapshot();

create temp view w as
  select case
           when query like 'select id, email, name from users%' then 'lookup'
           when query like 'insert into events (account_id, project_id, user_id, kind, payload) values%' then 'insert'
           when query like 'select p.id, p.name%' then 'projects'
           when query like 'select kind, count(*) from events%' then 'report'
         end as name, s.*
  from lab.stmts s;

select lab.prove(
  'the workload ran all four statements',
  (select count(*) from w where name is not null and calls > 0) = 4);

\echo
\echo '== Four questions, four rankings'

-- Only the reads are ranked here: insert time depends heavily on whatever
-- else the machine is writing at the same moment.
select lab.prove(
  'the least frequent statement (the report) consumed more total time than the other reads',
  (select name from w where name is not null order by calls limit 1) = 'report'
  and (select name from w where name in ('lookup', 'projects', 'report')
       order by total_exec_time desc limit 1) = 'report');

select lab.prove(
  'the report ran over 20 times less often than the lookup but took over 5 times more total time',
  (select calls from w where name = 'lookup') > 20 * (select calls from w where name = 'report')
  and (select total_exec_time from w where name = 'report')
      > 5 * (select total_exec_time from w where name = 'lookup'));

select lab.prove(
  'the project list returns 20 rows per call',
  (select rows / calls from w where name = 'projects') = 20);

select lab.prove(
  'the report touches the entire events table every call (blocks per call within 5% of its pages)',
  (select (shared_blks_hit + shared_blks_read)::numeric / calls from w where name = 'report')
    between 0.95 * (select relpages from pg_class where relname = 'events')
        and 1.05 * (select relpages from pg_class where relname = 'events'));

select lab.prove(
  'the primary key lookup touches 3 pages: root and leaf of users_pkey, plus one heap page',
  (select (shared_blks_hit + shared_blks_read)::numeric / calls from w where name = 'lookup')
    between 3 and 3.5
  and (select level from bt_metap('users_pkey')) = 1);

select lab.prove(
  'the project list touches about 257 pages for 20 rows (between 200 and 320)',
  (select (shared_blks_hit + shared_blks_read) / calls from w where name = 'projects')
    between 200 and 320);

select lab.prove(
  'the report finds under 60% of its pages in shared buffers, however often it runs',
  (select 100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read)
   from w where name = 'report') < 60);

select lab.prove(
  'each insert writes about five WAL records: heap tuple, primary key entry, and three foreign key row locks',
  (select wal_records::numeric / calls from w where name = 'insert') between 4.9 and 5.6);

-- Look at one insert's WAL directly: the same records plus a commit record,
-- which is written after the statement ends and so is not in its row above.
create extension if not exists pg_walinspect;
insert into events (account_id, project_id, user_id, kind, payload)
values (5, 6, 7, 'deploy', jsonb_build_object('status', 'ok'));
select pg_current_wal_lsn() as wal_start \gset
begin;
insert into events (account_id, project_id, user_id, kind, payload)
values (5, 6, 7, 'deploy', jsonb_build_object('status', 'ok'));
select pg_current_xact_id() as insert_xid \gset
commit;
select pg_current_wal_lsn() as wal_end \gset

-- WAL is shared by the whole server, so keep only this transaction's records.
select lab.prove(
  'one insert transaction: heap INSERT, B-tree INSERT_LEAF, three heap LOCK records, then COMMIT',
  (select array_agg(resource_manager || '/' || record_type order by start_lsn)
   from pg_get_wal_records_info(:'wal_start', :'wal_end')
   where xid = :'insert_xid'::xid)
  = array['Heap/INSERT', 'Btree/INSERT_LEAF', 'Heap/LOCK', 'Heap/LOCK', 'Heap/LOCK',
          'Transaction/COMMIT']);

select lab.prove(
  'with track_io_timing on, shared_blk_read_time is filled (blk_read_time was renamed in PostgreSQL 17)',
  (select shared_blk_read_time from w where name = 'report') > 0
  and not exists (select 1 from information_schema.columns
                  where table_name = 'pg_stat_statements' and column_name = 'blk_read_time'));

select lab.prove(
  'with track_planning off, plans and total_plan_time stay at zero',
  (select sum(plans) = 0 and sum(total_plan_time) = 0 from lab.stmts));

select lab.prove(
  'temp_blks_written and wal_bytes are columns of pg_stat_statements',
  (select count(*) from information_schema.columns
   where table_name = 'pg_stat_statements'
     and column_name in ('temp_blks_written', 'wal_bytes', 'wal_records', 'wal_fpi')) = 4);

\echo
\echo '== Snapshot and diff; do not reset'

select lab.prove(
  'pg_stat_statements_info has dealloc and stats_reset',
  (select dealloc >= 0 and stats_reset is not null from pg_stat_statements_info));

select lab.prove(
  'pg_stat_statements_reset(userid, dbid, queryid) resets one statement',
  (select pg_stat_statements_reset(0, 0, (select queryid from w where name = 'lookup'))) is not null
  and not exists (select 1 from w where name = 'lookup')
  and exists (select 1 from w where name = 'report'));

\echo
\echo '== pg_stat_activity: right now'

select dblink_connect('a', 'dbname=' || current_database());
select dblink_connect('b', 'dbname=' || current_database());
select dblink_connect('c', 'dbname=' || current_database());
select dblink_connect('d', 'dbname=' || current_database());
select pid as pid_a from dblink('a', 'select pg_backend_pid()') as t(pid int) \gset
select pid as pid_b from dblink('b', 'select pg_backend_pid()') as t(pid int) \gset
select pid as pid_c from dblink('c', 'select pg_backend_pid()') as t(pid int) \gset
select pid as pid_d from dblink('d', 'select pg_backend_pid()') as t(pid int) \gset

-- a: updates account 7, then sleeps inside its transaction
select dblink_send_query('a',
  'begin; update accounts set name = name where id = 7; select pg_sleep(60)');
-- b: read committed, read something, then sit idle in the transaction
select dblink_exec('b', 'begin');
select * from dblink('b', 'select count(*) from users where account_id = 7') as t(n bigint);
-- c: wants the row a holds
select pg_sleep(0.3);
select dblink_send_query('c', 'update accounts set plan = plan where id = 7');
-- d: repeatable read, idle in transaction
select dblink_exec('d', 'begin isolation level repeatable read');
select * from dblink('d', 'select count(*) from accounts') as t(n bigint);
select pg_sleep(0.5);

select lab.prove(
  'a session sleeping inside its transaction is active, waiting on Timeout/PgSleep, and has a backend_xid',
  (select state = 'active' and wait_event_type = 'Timeout' and wait_event = 'PgSleep'
          and backend_xid is not null
   from pg_stat_activity where pid = :pid_a));

select lab.prove(
  'an open read committed transaction that has not written shows idle in transaction, ClientRead, no xid, no xmin',
  (select state = 'idle in transaction' and wait_event = 'ClientRead'
          and backend_xid is null and backend_xmin is null
   from pg_stat_activity where pid = :pid_b));

select lab.prove(
  'a repeatable read transaction keeps its xmin while idle',
  (select state = 'idle in transaction' and backend_xmin is not null
   from pg_stat_activity where pid = :pid_d));

select lab.prove(
  'a session waiting for a row waits on Lock/transactionid, and pg_blocking_pids names the holder',
  (select wait_event_type = 'Lock' and wait_event = 'transactionid'
          and pg_blocking_pids(pid) = array[:pid_a]
   from pg_stat_activity where pid = :pid_c));

select lab.prove(
  'pg_stat_activity.query is the last statement the session ran, not a current one',
  (select query like 'select count(*) from users%' from pg_stat_activity where pid = :pid_b));

select pg_cancel_backend(:pid_b);
select pg_sleep(0.5);
select lab.prove(
  'a session idle in transaction has no statement to cancel: pg_cancel_backend leaves it as it was',
  (select state = 'idle in transaction' and backend_xid is null
   from pg_stat_activity where pid = :pid_b));

select pg_cancel_backend(:pid_a);
select pg_sleep(0.5);

select lab.prove(
  'pg_cancel_backend cancels the blocker''s statement, its transaction aborts, and the waiter goes through',
  dblink_is_busy('c') = 0
  and (select state from pg_stat_activity where pid = :pid_a) = 'idle in transaction (aborted)');

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
select dblink_disconnect('d');

select lab.prove(
  'pg_wait_events (PostgreSQL 17+) documents ClientRead, DataFileRead, WalSync, and transactionid',
  (select count(*) from pg_wait_events
   where (type, name) in (('Client', 'ClientRead'), ('IO', 'DataFileRead'),
                          ('IO', 'WalSync'), ('Lock', 'transactionid'))) = 4);

\echo
\echo '== Tables and indexes'

select lab.prove(
  'every report read the whole events table: about 2 million rows read per report',
  (select seq_tup_read::numeric from pg_stat_user_tables where relname = 'events')
  / (select calls from w where name = 'report') between 1900000 and 2200000);

select lab.prove(
  'events counts more sequential scans than report runs, because each parallel worker''s share counts',
  (select seq_scan from pg_stat_user_tables where relname = 'events')
    >= 1.5 * (select calls from w where name = 'report'));

select lab.prove(
  'PostgreSQL 16+ has last_seq_scan and last_idx_scan; 18 adds total_vacuum_time, total_autovacuum_time, total_analyze_time',
  (select count(*) from information_schema.columns
   where table_name = 'pg_stat_user_tables'
     and column_name in ('last_seq_scan', 'last_idx_scan', 'total_vacuum_time',
                         'total_autovacuum_time', 'total_analyze_time')) = 5);

select lab.prove(
  'events_pkey shows idx_scan = 0 after hundreds of inserts: uniqueness checks do not count as scans',
  (select idx_scan from pg_stat_user_indexes where indexrelname = 'events_pkey') = 0
  and (select n_tup_ins from pg_stat_user_tables where relname = 'events') > 100);

\echo
\echo '== The cache hit ratio is a trend, not a target'

select lab.prove(
  'this database''s hit ratio after the workload is far below the usual 99% rule',
  (select 100.0 * blks_hit / nullif(blks_hit + blks_read, 0)
   from pg_stat_database where datname = current_database()) < 90);

select lab.prove(
  'the events table is larger than a quarter of shared_buffers, so its scans use a bulkread ring',
  pg_relation_size('events') > pg_size_bytes(current_setting('shared_buffers')) / 4);

\echo
\echo '== pg_stat_io, checkpoints, WAL (shape only: these are cluster-wide)'

select lab.prove(
  'pg_stat_io (PostgreSQL 18) reports bytes: read_bytes, write_bytes, extend_bytes',
  (select count(*) from information_schema.columns
   where table_name = 'pg_stat_io'
     and column_name in ('read_bytes', 'write_bytes', 'extend_bytes')) = 3);

select lab.prove(
  'pg_stat_io covers WAL as an object in PostgreSQL 18',
  exists (select 1 from pg_stat_io where object = 'wal'));

select lab.prove(
  'pg_stat_io has normal, bulkread, bulkwrite, and vacuum contexts',
  (select count(distinct context) from pg_stat_io
   where context in ('normal', 'bulkread', 'bulkwrite', 'vacuum')) = 4);

select lab.prove(
  'pg_stat_checkpointer has num_timed, num_requested, num_done, and restartpoint counters',
  (select count(*) from information_schema.columns
   where table_name = 'pg_stat_checkpointer'
     and column_name in ('num_timed', 'num_requested', 'num_done', 'restartpoints_timed',
                         'restartpoints_req', 'restartpoints_done', 'buffers_written',
                         'slru_written')) = 8);

select lab.prove(
  'checkpoint counters moved out of pg_stat_bgwriter',
  not exists (select 1 from information_schema.columns
              where table_name = 'pg_stat_bgwriter' and column_name = 'checkpoints_timed'));

select lab.prove(
  'pg_stat_wal has wal_records, wal_fpi, wal_bytes, wal_buffers_full',
  (select count(*) from information_schema.columns
   where table_name = 'pg_stat_wal'
     and column_name in ('wal_records', 'wal_fpi', 'wal_bytes', 'wal_buffers_full')) = 4);

select lab.prove(
  'the replication slot check runs on any server',
  (select count(*) >= 0 from (
     select slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
     from pg_replication_slots) s));

\echo
\echo '== Bloat estimates'

select lab.prove(
  'a B-tree on an increasing key sits around 90% leaf density, two levels deep',
  (select avg_leaf_density between 85 and 92 and tree_level = 2
   from pgstatindex('events_pkey')));

delete from events where id % 4 = 0;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();

select lab.prove(
  'after deleting a quarter of events, pgstattuple_approx reports 20 to 30% dead tuples',
  (select dead_tuple_percent between 20 and 30 from pgstattuple_approx('events')));

select lab.prove(
  'with nothing vacuumed since, no page is all-visible, so it scans 100% of the table',
  (select scanned_percent > 99 from pgstattuple_approx('events')));

select lab.prove(
  'n_dead_tup estimates the same thing, cheaply',
  (select n_dead_tup between 450000 and 560000 from pg_stat_user_tables where relname = 'events'));

\echo
\echo '== What to alert on'

select lab.prove(
  'transaction ID age is far below the 2 billion limit on a fresh database',
  (select age(datfrozenxid) < 1000000000 from pg_database where datname = current_database()));

select lab.prove(
  'pg_stat_archiver has failed_count to alert on',
  (select failed_count >= 0 from pg_stat_archiver));

\echo
\echo '== Sample waits to see where the time goes'

-- pg_stat_activity is snapshotted per transaction: a loop in one transaction
-- would record its first sample over and over
begin;
select count(*) from pg_stat_activity where application_name = 'ws_late' \g /dev/null
select dblink_connect('ws_late', format('dbname=%s application_name=ws_late', current_database())) \g /dev/null
select pg_sleep(0.3) \g /dev/null

select lab.prove(
  'inside one transaction pg_stat_activity repeats its first snapshot: a session that connected since is invisible',
  (select count(*) from pg_stat_activity where application_name = 'ws_late') = 0);

select pg_stat_clear_snapshot() \g /dev/null

select lab.prove(
  'after pg_stat_clear_snapshot() the next read sees it',
  (select count(*) from pg_stat_activity where application_name = 'ws_late') = 1);
commit;
select dblink_disconnect('ws_late') \g /dev/null

-- four sessions with known waits
select dblink_connect('ws_cpu',   format('dbname=%s application_name=ws_cpu',   current_database())),
       dblink_connect('ws_sleep', format('dbname=%s application_name=ws_sleep', current_database())),
       dblink_connect('ws_hold',  format('dbname=%s application_name=ws_hold',  current_database())),
       dblink_connect('ws_wait',  format('dbname=%s application_name=ws_wait',  current_database())) \g /dev/null

select dblink_exec('ws_hold', 'begin'),
       dblink_exec('ws_hold', 'update accounts set name = name where id = 9') \g /dev/null
select dblink_send_query('ws_cpu',
  $q$ do $d$ declare i bigint := 0; begin while i < 2000000000 loop i := i + 1; end loop; end $d$ $q$) \g /dev/null
select dblink_send_query('ws_sleep', 'select pg_sleep(30)') \g /dev/null
select dblink_send_query('ws_wait', 'update accounts set name = name where id = 9') \g /dev/null
select pg_sleep(0.5) \g /dev/null

create temp table wait_samples (
  taken_at          timestamptz,
  pid               int,
  application_name  text,
  state             text,
  wait_event_type   text,
  wait_event        text,
  query_id          bigint
);

\o /dev/null
insert into wait_samples
select statement_timestamp(), pid, application_name, state,
       wait_event_type, wait_event, query_id
  from pg_stat_activity
 where backend_type = 'client backend'
   and state <> 'idle'
   and pid <> pg_backend_pid()
   and application_name like 'ws\_%'
\watch interval=0.1 count=20
\o

select lab.prove(
  '\watch took 20 rounds, each its own statement',
  (select count(distinct taken_at) from wait_samples) = 20);

select lab.prove(
  'a session running a CPU loop samples as active with no wait event (at least 16 of 20)',
  (select count(*) from wait_samples
   where application_name = 'ws_cpu' and state = 'active' and wait_event is null) >= 16);

select lab.prove(
  'a sleeping session samples as Timeout:PgSleep',
  (select bool_and((wait_event_type, wait_event) = ('Timeout', 'PgSleep')) and count(*) >= 18
   from wait_samples where application_name = 'ws_sleep'));

select lab.prove(
  'a session waiting for a row samples as Lock:transactionid every time',
  (select count(*) filter (where (wait_event_type, wait_event) = ('Lock', 'transactionid')) = count(*)
          and count(*) >= 18
   from wait_samples where application_name = 'ws_wait'));

select lab.prove(
  'a session idle inside its transaction samples as idle in transaction, Client:ClientRead',
  (select bool_and(state = 'idle in transaction' and (wait_event_type, wait_event) = ('Client', 'ClientRead'))
          and count(*) >= 18
   from wait_samples where application_name = 'ws_hold'));

\pset tuples_only off
\pset format aligned
select coalesce(wait_event_type, 'CPU')  as type,
       coalesce(wait_event, 'running')   as event,
       count(*)                          as samples,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct,
       round(count(*) / 20.0, 2)         as avg_sessions   -- 20 rounds
  from wait_samples
 where state = 'active'
 group by 1, 2
 order by samples desc;
\pset tuples_only on
\pset format unaligned

-- clean up: cancel the loop and the sleep, release the row
select dblink_cancel_query('ws_cpu'), dblink_cancel_query('ws_sleep') \g /dev/null
select dblink_exec('ws_hold', 'rollback') \g /dev/null
select dblink_disconnect('ws_cpu'), dblink_disconnect('ws_sleep'),
       dblink_disconnect('ws_hold'), dblink_disconnect('ws_wait') \g /dev/null
