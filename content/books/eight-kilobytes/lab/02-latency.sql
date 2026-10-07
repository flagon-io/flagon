-- Lab for "Where the time goes"
-- https://www.flagon.io/books/eight-kilobytes/latency
-- Run: ./lab 02-latency
--
-- Page counts, cache behavior and commit flushes are structural, so they are
-- checked. Timings depend on your machine, so the lab prints the ones it
-- measures ("on this machine") and checks only that they are in the right
-- order of magnitude. pg_test_fsync and pgbench, which the chapter also uses,
-- run from a shell; the commands are in the chapter.

\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;

-- EXPLAIN ANALYZE with no options at all, as JSON, to see what it reports by default.
create function pg_temp.explain_default(q text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  execute 'explain (analyze, format json) ' || q into r;
  return r -> 0 -> 'Plan';
end $$;

\echo
\echo '## The kit runs the defaults the chapter talks about'

select lab.prove(
  'shared_buffers is the default 128 MB, and track_io_timing is on',
  current_setting('shared_buffers') = '128MB'
  and current_setting('track_io_timing') = 'on');

select lab.prove(
  'PostgreSQL 18 reads through asynchronous I/O: io_method defaults to worker',
  current_setting('io_method') = 'worker');

\echo
\echo '## A query is pages and round trips'

-- First run warms the index metapage and the path down the tree.
select count(*) from events where id = 777777 \g /dev/null

select lab.prove(
  'a primary key lookup touches 4 pages: root, internal, leaf, and the table page',
  lab.buffers($$ select * from events where id = 777777 $$) = 4
  and (select level from bt_metap('events_pkey')) = 2);

select lab.prove(
  'since PostgreSQL 18, EXPLAIN ANALYZE reports buffers without being asked',
  pg_temp.explain_default($$ select * from events where id = 777777 $$) ? 'Shared Hit Blocks');

select count(*) as cached_before
from pg_buffercache b
where b.relfilenode = pg_relation_filenode('events')
  and b.reldatabase = (select oid from pg_database where datname = current_database()) \gset

select lab.buffers($$ select count(*) from events where project_id = 4242 $$) as scan_pages \gset

select count(*) - :cached_before as cached_by_scan
from pg_buffercache b
where b.relfilenode = pg_relation_filenode('events')
  and b.reldatabase = (select oid from pg_database where datname = current_database()) \gset

select lab.prove(
  'a filter on project_id (no index) touches all 35,173 pages to find 85 rows',
  :scan_pages = 35173
  and (select count(*) from events where project_id = 4242) = 85
  and lab.nodes($$ select count(*) from events where project_id = 4242 $$)
      && array['Seq Scan', 'Parallel Seq Scan']);

\echo
\echo '## A page lives in one of three places'

select lab.prove(
  'events (35,173 pages) is larger than a quarter of shared_buffers, so a scan of it gets a ring',
  pg_relation_size('events') / 8192 > (select setting::int from pg_settings where name = 'shared_buffers') / 4);

select lab.prove(
  'big scans don''t flush the cache: after a full scan of a 275 MB table, under 3% of it is in shared_buffers',
  :cached_by_scan > 0 and :cached_by_scan < 35173 * 0.03);

select lab.prove(
  'the PostgreSQL 18 scan ring: 256 KB plus room for in-flight reads, 2,304 KB (288 pages) with default settings',
  256 + 8 * (pg_size_bytes(current_setting('io_combine_limit')) / 8192)
          * current_setting('effective_io_concurrency')::int = 2304);

\echo
\echo '### "Read" does not mean "from disk"'

-- 2,000 primary key lookups scattered over the table: random page reads that
-- miss shared_buffers and go to the kernel.
select lab.plan($$
  select sum(length(kind)) from events
  where id = any(array(select (g * 997)::bigint from generate_series(1, 2000) g)) $$) as p \gset

select format('on this machine: %s pages read from outside shared_buffers, %s us per page',
              (:'p'::jsonb -> 'Plan' ->> 'Shared Read Blocks'),
              round(1000 * (:'p'::jsonb -> 'Plan' ->> 'Shared I/O Read Time')::numeric
                    / nullif((:'p'::jsonb -> 'Plan' ->> 'Shared Read Blocks')::numeric, 0), 1));

select lab.prove(
  'thousands of "read" pages at under 20 us each came from the OS page cache',
  (:'p'::jsonb -> 'Plan' ->> 'Shared Read Blocks')::int > 1000
  and (:'p'::jsonb -> 'Plan' ->> 'Shared I/O Read Time')::numeric
      / (:'p'::jsonb -> 'Plan' ->> 'Shared Read Blocks')::numeric < 0.02);

\echo
\echo '## Every commit waits for the disk'

create table commit_demo (
  id  bigint generated always as identity,
  at  timestamptz default now()
);

-- A second session, so we can read its own I/O counters from here.
select dblink_connect('w', 'dbname=' || current_database()) \g /dev/null
select pid as w_pid from dblink('w', 'select pg_backend_pid()') as t(pid int) \gset

-- WAL fsyncs that session has done so far (flushing its stats first).
create function pg_temp.wal_fsyncs(pid int) returns bigint
language plpgsql as $$
begin
  perform * from dblink('w', 'select pg_stat_force_next_flush()::text') as t(x text);
  perform pg_sleep(0.3);
  return (select coalesce(fsyncs, 0) from pg_stat_get_backend_io(pid)
          where object = 'wal' and context = 'normal');
end $$;

select pg_temp.wal_fsyncs(:w_pid) as f0 \gset
select dblink_exec('w', $q$do $$ begin
  for i in 1..100 loop insert into commit_demo default values; commit; end loop;
end $$$q$) \g /dev/null
select pg_temp.wal_fsyncs(:w_pid) as f1 \gset

select format('100 commits with synchronous_commit = on: %s WAL fsyncs by that session', :f1 - :f0);
select lab.prove(
  'with synchronous_commit on, each commit waits for its own WAL flush: at least 90 fsyncs for 100 commits',
  :f1 - :f0 >= 90);

select dblink_exec('w', 'set synchronous_commit = off') \g /dev/null
select dblink_exec('w', $q$do $$ begin
  for i in 1..100 loop insert into commit_demo default values; commit; end loop;
end $$$q$) \g /dev/null
select pg_temp.wal_fsyncs(:w_pid) as f2 \gset

select format('100 commits with synchronous_commit = off: %s WAL fsyncs by that session', :f2 - :f1);
select lab.prove(
  'with synchronous_commit off, the same 100 commits don''t wait for a flush at all',
  :f2 - :f1 <= 5);

select dblink_exec('w', 'set synchronous_commit = on') \g /dev/null
select dblink_exec('w', 'insert into commit_demo select from generate_series(1, 200)') \g /dev/null
select pg_temp.wal_fsyncs(:w_pid) as f3 \gset

select lab.prove(
  'a commit costs one fsync, whatever it contains: 200 rows in one transaction flush once',
  :f3 - :f2 <= 3);

select dblink_disconnect('w') \g /dev/null

select lab.prove(
  'synchronous_commit can be changed per session; fsync is server-wide',
  (select context from pg_settings where name = 'synchronous_commit') = 'user'
  and (select context from pg_settings where name = 'fsync') = 'sighup');

\echo
\echo '## Size RAM to the working set'

select lab.prove(
  'events is 275 MB of heap and 43 MB of index; users 9008 kB; projects 1528 kB; accounts 72 kB',
  pg_size_pretty(pg_relation_size('events')) = '275 MB'
  and pg_size_pretty(pg_indexes_size('events')) = '43 MB'
  and pg_size_pretty(pg_relation_size('users')) = '9008 kB'
  and pg_size_pretty(pg_relation_size('projects')) = '1528 kB'
  and pg_size_pretty(pg_relation_size('accounts')) = '72 kB');

select lab.prove(
  'the latest 7 days of events sit in about 675 pages (5 MB), smaller than users',
  count(distinct (ctid::text::point)[0]) between 640 and 710
  and count(distinct (ctid::text::point)[0]) * 8192 < pg_relation_size('users'))
from events
where created_at > (select max(created_at) from events) - interval '7 days';

\echo
\echo '## Round trips cost more than queries'

select lab.prove(
  'one query fetches 100 projects by id in one index scan, a few hundred pages at most',
  lab.buffers($$ select * from projects
                 where id = any(array(select generate_series(1, 20000, 200))) $$) < 300
  and 'Index Scan' = any(lab.nodes($$ select * from projects
                 where id = any(array(select generate_series(1, 20000, 200))) $$))
  and (select count(*) from projects where id = any(array(select generate_series(1, 20000, 200)))) = 100);
