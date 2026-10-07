-- Lab for "Load it fast"
-- https://www.flagon.io/books/eight-kilobytes/loading
-- Run: ./lab 26-loading
--
-- The same events-shaped rows loaded several ways, at lab scale: 500 rows
-- for the one-statement-per-row methods, 100,000 for everything else. WAL is
-- read from pg_stat_get_backend_wal() (PostgreSQL 18+), which counts only this
-- session's WAL, so other work on the server can't skew it. Timings can be
-- skewed by other work, so the timing checks are generous ratios.
--
-- The 1,000,000-row comparison table in the chapter, wal_level = minimal, and
-- the max_wal_size experiment need a server of their own: bash 26-loading.sh.
--
-- Files: \copy writes and reads /tmp/ek-loading-*.csv inside the container.
-- psql (the client) and the server run in the same container here, so a
-- server-side COPY of the same path reads the same file.
\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;
set stats_fetch_consistency = none;
create extension if not exists pg_visibility;

-- This session's WAL records so far; lab.my_wal() has its bytes.
create function lab.my_records() returns bigint language sql
  as $$ select wal_records from pg_stat_get_backend_wal(pg_backend_pid()) $$;

-- An empty events-shaped table: identity key, no foreign keys, autovacuum off
-- so nothing but this script touches its pages.
create function lab.fresh(name text, persistence text default '') returns void
language plpgsql as $$
begin
  execute format('drop table if exists %I', name);
  execute format($f$
    create %s table %I (
      id          bigint generated always as identity primary key,
      account_id  bigint not null,
      project_id  bigint not null,
      user_id     bigint,
      kind        text not null,
      payload     jsonb not null default '{}',
      created_at  timestamptz not null default now()
    ) with (autovacuum_enabled = false)$f$, persistence, name);
end $$;

-- One row per method: rows, milliseconds, WAL bytes and records, sizes.
create unlogged table lab.runs (
  method text primary key, n bigint, ms numeric, wal numeric, records bigint,
  heap bigint, idx bigint);
create function lab.record(m text, n bigint, t0 timestamptz, w0 numeric, r0 bigint, rel regclass)
returns void language sql as $$
  insert into lab.runs
  values (m, n, extract(epoch from clock_timestamp() - t0) * 1000,
          lab.my_wal() - w0, lab.my_records() - r0,
          pg_relation_size(rel), pg_indexes_size(rel))
$$;
-- Expected errors land here, so a check can look at the SQLSTATE afterwards.
create table lab.errs (test text primary key, state text, msg text);

create function lab.rate(m text) returns numeric language sql
  as $$ select n / greatest(ms, 1) * 1000 from lab.runs where method = m $$;
create function lab.wal(m text) returns numeric language sql
  as $$ select wal from lab.runs where method = m $$;

-- The source: the first 100,000 events, as a CSV file.
\copy (select account_id, project_id, user_id, kind, payload, created_at from events where id <= 100000 order by id) to '/tmp/ek-loading-events.csv' with (format csv)

\echo
\echo == One statement per row: the commit is the cost
select lab.fresh('l_autocommit');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
select format('insert into l_autocommit (account_id, project_id, user_id, kind, payload, created_at) values (%L, %L, %L, %L, %L, %L)',
              account_id, project_id, user_id, kind, payload, created_at)
from events where id <= 500 order by id \gexec
select pg_stat_force_next_flush() as flushed \gset
select lab.record('single-row, autocommit', 500, :'t0', :w0, :r0, 'l_autocommit');

select lab.fresh('l_one_tx');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
begin;
select format('insert into l_one_tx (account_id, project_id, user_id, kind, payload, created_at) values (%L, %L, %L, %L, %L, %L)',
              account_id, project_id, user_id, kind, payload, created_at)
from events where id <= 500 order by id \gexec
commit;
select pg_stat_force_next_flush() as flushed \gset
select lab.record('single-row, one transaction', 500, :'t0', :w0, :r0, 'l_one_tx');

select lab.prove(
  'autocommit writes one extra WAL record per row: its commit',
  (select records from lab.runs where method = 'single-row, autocommit')
  - (select records from lab.runs where method = 'single-row, one transaction') between 490 and 600);
select lab.prove(
  'the same 500 inserts in one transaction run at least 1.5 times as fast as autocommit',
  lab.rate('single-row, one transaction') > 1.5 * lab.rate('single-row, autocommit'));

\echo
\echo == Fewer statements: multi-row VALUES and unnest
select lab.fresh('l_values');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
select 'insert into l_values (account_id, project_id, user_id, kind, payload, created_at) values '
       || string_agg(format('(%s, %s, %s, %L, %L::jsonb, %L::timestamptz)',
                            account_id, project_id, coalesce(user_id::text, 'null'), kind, payload, created_at), ', ' order by id)
from events where id <= 100000
group by (id - 1) / 1000 order by min(id) \gexec
select pg_stat_force_next_flush() as flushed \gset
select lab.record('multi-row VALUES, 1,000 per statement', 100000, :'t0', :w0, :r0, 'l_values');

-- unnest: one prepared statement with six array parameters, which is what a
-- driver sends. The arrays arrive as text, the way most drivers send them.
select lab.fresh('l_unnest');
prepare load_unnest (bigint[], bigint[], bigint[], text[], jsonb[], timestamptz[]) as
  insert into l_unnest (account_id, project_id, user_id, kind, payload, created_at)
  select * from unnest($1, $2, $3, $4, $5, $6);
select array_agg(account_id order by id) as a_account, array_agg(project_id order by id) as a_project,
       array_agg(user_id order by id) as a_user, array_agg(kind order by id) as a_kind,
       array_agg(payload order by id) as a_payload, array_agg(created_at order by id) as a_created
from events where id <= 100000 \gset
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
execute load_unnest(:'a_account', :'a_project', :'a_user', :'a_kind', :'a_payload', :'a_created');
select pg_stat_force_next_flush() as flushed \gset
select lab.record('INSERT ... SELECT from unnest', 100000, :'t0', :w0, :r0, 'l_unnest');
deallocate load_unnest;
\unset a_account
\unset a_project
\unset a_user
\unset a_kind
\unset a_payload
\unset a_created

-- Over psql's local socket a round trip costs next to nothing, so single-row
-- inserts in one transaction are a tough baseline here; over a real network
-- every one of them pays a round trip. The literal VALUES statements spend
-- most of their time being sent and parsed.
select lab.prove(
  'unnest loads at least as many rows per second as multi-row VALUES of literals (within 10%)',
  lab.rate('INSERT ... SELECT from unnest') > 0.9 * lab.rate('multi-row VALUES, 1,000 per statement'));
select lab.prove(
  'unnest loads at least twice as many rows per second as single-row inserts in one transaction',
  lab.rate('INSERT ... SELECT from unnest') > 2 * lab.rate('single-row, one transaction'));
select lab.prove(
  'VALUES and unnest write about the same WAL: one heap record and one index record per row',
  lab.wal('INSERT ... SELECT from unnest') between 0.8 * lab.wal('multi-row VALUES, 1,000 per statement')
                                               and 1.25 * lab.wal('multi-row VALUES, 1,000 per statement'));

\echo
\echo == COPY: the bulk path
select lab.fresh('l_copy');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
\copy l_copy (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/ek-loading-events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select lab.record('COPY FROM STDIN', 100000, :'t0', :w0, :r0, 'l_copy');

select lab.prove(
  'COPY loads more rows per second than multi-row VALUES',
  lab.rate('COPY FROM STDIN') > lab.rate('multi-row VALUES, 1,000 per statement'));
select lab.prove(
  'COPY writes less WAL than row-at-a-time inserts: one heap record per page, not per row',
  lab.wal('COPY FROM STDIN') < lab.wal('multi-row VALUES, 1,000 per statement'));
select lab.prove(
  'COPY writes far fewer WAL records than the 2 per row an INSERT writes (heap + primary key)',
  (select records from lab.runs where method = 'COPY FROM STDIN')
  < 0.7 * (select records from lab.runs where method = 'multi-row VALUES, 1,000 per statement'));
-- (l_copy is deliberately not read here: a later section needs its first read.)
select lab.prove(
  'every method produced the same 100,000 rows and the same size of table',
  (select count(*) from l_values) = 100000 and (select count(*) from l_unnest) = 100000
  and pg_relation_size('l_copy') between 0.95 * pg_relation_size('l_values')
                                     and 1.05 * pg_relation_size('l_values')
  and pg_relation_size('l_unnest') between 0.95 * pg_relation_size('l_values')
                                       and 1.05 * pg_relation_size('l_values'));

\echo
\echo == COPY FREEZE
select lab.fresh('l_freeze');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
begin;
truncate l_freeze;
\copy l_freeze (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/ek-loading-events.csv' with (format csv, freeze)
commit;
select pg_stat_force_next_flush() as flushed \gset
select lab.record('COPY FREEZE', 100000, :'t0', :w0, :r0, 'l_freeze');

select lab.prove(
  'after COPY FREEZE every page holding rows is all-visible and all-frozen in the visibility map',
  (select all_visible = (select count(distinct (ctid::text::point)[0]) from l_freeze)
      and all_frozen = all_visible
   from pg_visibility_map_summary('l_freeze')));
-- Why count pages holding rows rather than the file's pages: COPY extends the
-- file several pages at a time, so the last few pages are allocated but still
-- empty, and an empty page has nothing to mark.
select lab.prove(
  'COPY leaves a few empty pages at the end of the file: allocated ahead, under 5% of it',
  (select count(distinct (ctid::text::point)[0]) from l_freeze)
    between 0.95 * pg_relation_size('l_freeze') / 8192 and pg_relation_size('l_freeze') / 8192);
select lab.prove(
  'after a plain COPY no page is all-visible yet',
  (select all_visible = 0 and all_frozen = 0 from pg_visibility_map_summary('l_copy')));
select lab.prove(
  'COPY FREEZE costs about the same WAL as a plain COPY (within 25%)',
  lab.wal('COPY FREEZE') < 1.25 * lab.wal('COPY FROM STDIN'));

select pg_relation_size('l_freeze') as freeze_size \gset
do $$
begin
  copy l_freeze (account_id, project_id, user_id, kind, payload, created_at)
    from '/tmp/ek-loading-events.csv' with (format csv, freeze);
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('freeze without truncate', sqlstate, sqlerrm);
end $$;
-- 55000: "the table was not created or truncated in the current
-- subtransaction". Inside a DO block PostgreSQL may first see the block's own
-- snapshot and say "because of prior transaction activity" (25000) instead.
select lab.prove(
  'COPY FREEZE into a table not created or truncated in the same transaction is an error, and loads nothing',
  (select state in ('55000', '25000') and msg like 'cannot perform COPY FREEZE%'
   from lab.errs where test = 'freeze without truncate')
  and pg_relation_size('l_freeze') = :freeze_size);

\echo
\echo == Unlogged, then SET LOGGED: the WAL comes due
select lab.fresh('l_unlogged', 'unlogged');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
\copy l_unlogged (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/ek-loading-events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select lab.record('COPY into an unlogged table', 100000, :'t0', :w0, :r0, 'l_unlogged');

select pg_relation_filenode('l_unlogged') as filenode_before \gset
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
alter table l_unlogged set logged;
select pg_stat_force_next_flush() as flushed \gset
select lab.record('ALTER TABLE ... SET LOGGED', 100000, :'t0', :w0, :r0, 'l_unlogged');

select lab.prove(
  'COPY into an unlogged table writes almost no WAL (under 1% of a logged COPY)',
  lab.wal('COPY into an unlogged table') < 0.01 * lab.wal('COPY FROM STDIN'));
select lab.prove(
  'SET LOGGED rewrites the table into a new file',
  pg_relation_filenode('l_unlogged') <> :filenode_before);
select lab.prove(
  'SET LOGGED writes WAL about the size of the table plus its index (0.7x to 1.3x)',
  (select wal between 0.7 * (heap + idx) and 1.3 * (heap + idx)
   from lab.runs where method = 'ALTER TABLE ... SET LOGGED'));
select lab.prove(
  'so the unlogged detour saves no WAL: SET LOGGED alone writes at least half what the plain COPY did',
  lab.wal('ALTER TABLE ... SET LOGGED') > 0.5 * lab.wal('COPY FROM STDIN'));

\echo
\echo == Indexes and foreign keys: before or after the load
-- Before: the table has its primary key, two secondary indexes and three
-- foreign keys while 100,000 rows arrive.
select lab.fresh('l_before');
create index l_before_project_created_idx on l_before (project_id, created_at);
create index l_before_account_idx on l_before (account_id);
alter table l_before
  add foreign key (account_id) references accounts (id),
  add foreign key (project_id) references projects (id),
  add foreign key (user_id) references users (id);

select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
\copy l_before (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/ek-loading-events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select lab.record('indexes and FKs present during COPY', 100000, :'t0', :w0, :r0, 'l_before');

-- After: a bare table, then the same indexes and constraints.
drop table if exists l_after;
create table l_after (
  id          bigint generated always as identity,
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
) with (autovacuum_enabled = false);

select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, lab.my_records() as r0 \gset
\copy l_after (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/ek-loading-events.csv' with (format csv)
alter table l_after add primary key (id);
create index l_after_project_created_idx on l_after (project_id, created_at);
create index l_after_account_idx on l_after (account_id);
alter table l_after
  add constraint l_after_account_fk foreign key (account_id) references accounts (id) not valid,
  add constraint l_after_project_fk foreign key (project_id) references projects (id) not valid,
  add constraint l_after_user_fk    foreign key (user_id)    references users (id)    not valid;
alter table l_after validate constraint l_after_account_fk;
alter table l_after validate constraint l_after_project_fk;
alter table l_after validate constraint l_after_user_fk;
select pg_stat_force_next_flush() as flushed \gset
select lab.record('COPY, then indexes, then FKs NOT VALID + VALIDATE', 100000, :'t0', :w0, :r0, 'l_after');

-- Total time is proved at 1,000,000 rows on a quiet server of its own in
-- 26-loading.sh; at this scale, on a shared machine, it is too noisy to check.
select lab.prove(
  'with indexes in place, every row writes a WAL record per index; built afterwards, under a tenth as many records',
  (select records from lab.runs where method = 'indexes and FKs present during COPY') > 300000
  and (select records from lab.runs where method = 'COPY, then indexes, then FKs NOT VALID + VALIDATE')
      < 0.1 * (select records from lab.runs where method = 'indexes and FKs present during COPY'));
select lab.prove(
  'loading bare and building afterwards writes less WAL in total',
  lab.wal('COPY, then indexes, then FKs NOT VALID + VALIDATE') < lab.wal('indexes and FKs present during COPY'));
select lab.prove(
  'the (project_id, created_at) index is at least 15% bigger when it grew row by row than when built after',
  pg_relation_size('l_before_project_created_idx') > 1.15 * pg_relation_size('l_after_project_created_idx'));
select lab.prove(
  'both tables end with the same rows and all three foreign keys validated',
  (select count(*) from l_after) = 100000 and (select count(*) from l_before) = 100000
  and (select count(*) from pg_constraint
       where conrelid = 'l_after'::regclass and contype = 'f' and convalidated) = 3);

-- A NOT VALID foreign key skips the rows already there, checks every new row,
-- and VALIDATE checks the old ones later. Plant an orphan to see all three.
alter table l_after drop constraint l_after_project_fk;
insert into l_after (account_id, project_id, user_id, kind) values (1, -1, null, 'build');
alter table l_after add constraint l_after_project_fk
  foreign key (project_id) references projects (id) not valid;
do $$
begin
  insert into l_after (account_id, project_id, user_id, kind) values (1, -2, null, 'build');
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('not valid fk, new row', sqlstate, sqlerrm);
end $$;
do $$
begin
  alter table l_after validate constraint l_after_project_fk;
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('validate finds orphan', sqlstate, sqlerrm);
end $$;
select lab.prove(
  'NOT VALID added the constraint over an orphan without complaint, yet a new orphan is rejected (23503)',
  (select state = '23503' from lab.errs where test = 'not valid fk, new row'));
select lab.prove(
  'VALIDATE finds the old orphan (23503) and the constraint stays not validated',
  (select state = '23503' from lab.errs where test = 'validate finds orphan')
  and (select not convalidated from pg_constraint where conname = 'l_after_project_fk'));
delete from l_after where project_id = -1;
alter table l_after validate constraint l_after_project_fk;

\echo
\echo == maintenance_work_mem: index builds sort in memory or on disk
set max_parallel_maintenance_workers = 0;
drop index l_after_project_created_idx;

select pg_stat_force_next_flush();
select temp_files as tf0 from pg_stat_database where datname = current_database() \gset
set maintenance_work_mem = '1MB';
create index l_after_project_created_idx on l_after (project_id, created_at);
select pg_stat_force_next_flush();
select temp_files as tf1 from pg_stat_database where datname = current_database() \gset
drop index l_after_project_created_idx;

set maintenance_work_mem = '256MB';
create index l_after_project_created_idx on l_after (project_id, created_at);
select pg_stat_force_next_flush();
select temp_files as tf2 from pg_stat_database where datname = current_database() \gset
reset maintenance_work_mem;
reset max_parallel_maintenance_workers;

select lab.prove(
  'with maintenance_work_mem = 1MB the index build spills its sort to temporary files',
  :tf1 > :tf0);
select lab.prove(
  'with 256MB the same build sorts in memory: no temporary files',
  :tf2 = :tf1);

\echo
\echo == The first read after a load writes
-- l_copy was loaded by a plain COPY and nothing has read it since. Checkpoint
-- first, so we can also see the hint bits' WAL (data checksums are on).
checkpoint;
select lab.plan('select count(*) from l_copy') as first_scan \gset
select lab.plan('select count(*) from l_copy') as second_scan \gset

-- Now that it has been read, count the pages that hold rows (the file has a
-- few empty ones at the end, allocated ahead by COPY).
select count(distinct (ctid::text::point)[0]) as copy_pages from l_copy \gset
select lab.prove(
  'the first scan after a plain COPY dirties every page that holds rows (hint bits)',
  (:'first_scan'::jsonb -> 'Plan' ->> 'Shared Dirtied Blocks')::bigint = :copy_pages);
select lab.prove(
  'after a checkpoint, with checksums on, that read also writes a full-page image of each of those pages',
  (:'first_scan'::jsonb -> 'Plan' ->> 'WAL FPI')::bigint = :copy_pages);
select lab.prove(
  'the second scan dirties nothing and writes no WAL',
  coalesce((:'second_scan'::jsonb -> 'Plan' ->> 'Shared Dirtied Blocks')::bigint, 0) = 0
  and coalesce((:'second_scan'::jsonb -> 'Plan' ->> 'WAL Bytes')::numeric, 0) = 0);
select lab.prove(
  'the first scan after COPY FREEZE dirties nothing: the rows were written frozen',
  coalesce((lab.plan('select count(*) from l_freeze') -> 'Plan' ->> 'Shared Dirtied Blocks')::bigint, 0) = 0);

\echo
\echo == VACUUM (FREEZE) right after the load
select pg_stat_force_next_flush() as flushed \gset
select lab.my_wal() as w0 \gset
vacuum (freeze) l_values;
select pg_stat_force_next_flush() as flushed \gset
select lab.my_wal() - :w0 as vac_plain_wal \gset
select pg_stat_force_next_flush() as flushed \gset
select lab.my_wal() as w0 \gset
vacuum (freeze) l_freeze;
select pg_stat_force_next_flush() as flushed \gset
select lab.my_wal() - :w0 as vac_frozen_wal \gset

select lab.prove(
  'after VACUUM (FREEZE) every page of the plainly loaded table is all-frozen',
  (select all_frozen = pg_relation_size('l_values') / 8192 from pg_visibility_map_summary('l_values')));
select lab.prove(
  'freezing a freshly loaded table writes WAL for every page (at least 40 bytes a page)',
  :vac_plain_wal > 40 * pg_relation_size('l_values') / 8192);
select lab.prove(
  'the COPY FREEZE table has nothing left to freeze: under a twentieth of that WAL',
  :vac_frozen_wal < :vac_plain_wal / 20);

\echo
\echo == ANALYZE after loading
select lab.fresh('l_stats');
\copy l_stats (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/ek-loading-events.csv' with (format csv)
select count(*) as alerts from l_stats where kind = 'alert' \gset
select lab.est_rows($$ select * from l_stats where kind = 'alert' $$) as est_before \gset
analyze l_stats;
select lab.est_rows($$ select * from l_stats where kind = 'alert' $$) as est_after \gset

select lab.prove(
  'never analyzed, the planner guesses alerts at under a fifth of the real count',
  :est_before < :alerts / 5.0);
select lab.prove(
  'after ANALYZE the estimate is within 20% of the real count',
  abs(:est_after - :alerts) < 0.2 * :alerts);
\echo
\echo == COPY options for messy input (PostgreSQL 17 and 18)
create table l_strict (id int primary key, n int not null, note text);
copy (values ('1', '10', 'ok'), ('2', 'ten', 'not a number'),
             ('3', '30', 'ok'), ('4', '4O', 'letter O, not zero'))
  to '/tmp/ek-loading-bad.csv' with (format csv);

do $$
begin
  copy l_strict from '/tmp/ek-loading-bad.csv' with (format csv);
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('on_error stop', sqlstate, sqlerrm);
end $$;
select lab.prove('by default one bad value fails the whole COPY (22P02) and nothing is loaded',
  (select state = '22P02' from lab.errs where test = 'on_error stop')
  and (select count(*) from l_strict) = 0);

copy l_strict from '/tmp/ek-loading-bad.csv' with (format csv, on_error ignore, log_verbosity silent);
select lab.prove('ON_ERROR ignore skips the two rows that fail type conversion and loads the other two',
  (select array_agg(id order by id) from l_strict) = '{1,3}');
truncate l_strict;

do $$
begin
  copy l_strict from '/tmp/ek-loading-bad.csv' with (format csv, on_error ignore, reject_limit 1);
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('reject_limit 1', sqlstate, sqlerrm);
end $$;
select lab.prove('REJECT_LIMIT 1 with two bad rows fails the COPY, and nothing is loaded',
  (select msg like 'skipped more than REJECT_LIMIT (1) rows%' from lab.errs where test = 'reject_limit 1')
  and (select count(*) from l_strict) = 0);
copy l_strict from '/tmp/ek-loading-bad.csv' with (format csv, on_error ignore, reject_limit 2);
select lab.prove('REJECT_LIMIT 2 tolerates both and loads the good rows',
  (select count(*) from l_strict) = 2);
truncate l_strict;

copy (values ('1', '10', 'ok'), ('1', '11', 'duplicate id'))
  to '/tmp/ek-loading-dup.csv' with (format csv);
do $$
begin
  copy l_strict from '/tmp/ek-loading-dup.csv' with (format csv, on_error ignore);
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('on_error and a duplicate', sqlstate, sqlerrm);
end $$;
select lab.prove('ON_ERROR ignore does not skip constraint violations: a duplicate key still fails the COPY (23505)',
  (select state = '23505' from lab.errs where test = 'on_error and a duplicate')
  and (select count(*) from l_strict) = 0);

\echo
\echo == Loading a partitioned table
-- Every 20th event: 100,000 rows spread across the whole year.
create table l_part (
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null
) partition by range (created_at);

do $$
declare m timestamptz;
begin
  for m in select generate_series(date_trunc('month', min(created_at)),
                                  date_trunc('month', max(created_at)), interval '1 month')
           from events
  loop
    execute format('create table %I partition of l_part for values from (%L) to (%L)',
                   'l_part_' || to_char(m, 'YYYY_MM'), m, m + interval '1 month');
  end loop;
end $$;

\copy (select account_id, project_id, user_id, kind, payload, created_at from events where id % 20 = 0 order by id) to '/tmp/ek-loading-year.csv' with (format csv)
\copy l_part from '/tmp/ek-loading-year.csv' with (format csv)

select lab.prove('COPY into the parent routes all 100,000 rows to the monthly partitions',
  (select count(*) from l_part) = 100000
  and (select count(distinct tableoid) from l_part) >= 12);

do $$
begin
  copy l_part from '/tmp/ek-loading-year.csv' with (format csv, freeze);
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('freeze on parent', sqlstate, sqlerrm);
end $$;
select lab.prove('COPY FREEZE on a partitioned table is refused (0A000)',
  (select state = '0A000' and msg = 'cannot perform COPY FREEZE on a partitioned table'
   from lab.errs where test = 'freeze on parent'));

-- The last full month, straight into its own partition, with FREEZE.
select 'l_part_' || to_char(date_trunc('month', max(created_at)) - interval '1 month', 'YYYY_MM') as leaf
from events \gset
\copy (select account_id, project_id, user_id, kind, payload, created_at from events where id % 20 = 0 and created_at >= date_trunc('month', (select max(created_at) from events)) - interval '1 month' and created_at < date_trunc('month', (select max(created_at) from events)) order by id) to '/tmp/ek-loading-month.csv' with (format csv)
select count(*) as leaf_rows from :"leaf" \gset
begin;
truncate :"leaf";
copy :"leaf" from '/tmp/ek-loading-month.csv' with (format csv, freeze);
commit;
select lab.prove('COPY FREEZE works on one partition truncated in the same transaction: same rows, all frozen',
  (select count(*) from :"leaf") = :leaf_rows
  and (select all_frozen >= 0.9 * pg_relation_size(:'leaf') / 8192 from pg_visibility_map_summary(:'leaf')));

do $$
begin
  execute format('copy %I from %L with (format csv)',
                 'l_part_' || to_char((select date_trunc('month', min(created_at)) from events), 'YYYY_MM'),
                 '/tmp/ek-loading-month.csv');
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('wrong partition', sqlstate, sqlerrm);
end $$;
select lab.prove('rows copied straight into the wrong partition fail its partition constraint (23514)',
  (select state = '23514' and msg like '%violates partition constraint%'
   from lab.errs where test = 'wrong partition'));

\echo
\echo == Upserts in bulk: stage, then one statement
-- A rollup of events per project. About half the projects already have a row.
create table ps_row (project_id bigint primary key, events bigint not null, last_event_at timestamptz not null);
insert into ps_row
select project_id, count(*), max(created_at) from events
where id <= 100000 and project_id <= 10000 group by project_id;
create table ps_bulk  (like ps_row including all);
create table ps_merge (like ps_row including all);
insert into ps_bulk  select * from ps_row;
insert into ps_merge select * from ps_row;

-- The feed: the next 100,000 events, rolled up per project.
\copy (select project_id, count(*), max(created_at) from events where id between 100001 and 200000 group by project_id order by project_id) to '/tmp/ek-loading-feed.csv' with (format csv)
select count(*) as feed_rows,
       count(*) filter (where exists (select 1 from ps_row p where p.project_id = f.project_id)) as feed_updates
from (select distinct project_id from events where id between 100001 and 200000) f \gset

-- Row by row: one INSERT ... ON CONFLICT per feed row, all in one transaction.
select clock_timestamp() as t0 \gset
begin;
select format('insert into ps_row values (%s, %s, %L) on conflict (project_id) do update set events = ps_row.events + excluded.events, last_event_at = greatest(ps_row.last_event_at, excluded.last_event_at)',
              project_id, count(*), max(created_at))
from events where id between 100001 and 200000 group by project_id order by project_id \gexec
commit;
select extract(epoch from clock_timestamp() - :'t0') * 1000 as row_ms \gset

-- In bulk: COPY into a temporary staging table, then one statement.
create temp table stage (project_id bigint, events bigint, last_event_at timestamptz);
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0 \gset
\copy stage from '/tmp/ek-loading-feed.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select lab.my_wal() - :w0 as stage_wal \gset
insert into ps_bulk
select * from stage
on conflict (project_id) do update
  set events = ps_bulk.events + excluded.events,
      last_event_at = greatest(ps_bulk.last_event_at, excluded.last_event_at);
select extract(epoch from clock_timestamp() - :'t0') * 1000 as bulk_ms \gset

merge into ps_merge t
using stage s on t.project_id = s.project_id
when matched then update set events = t.events + s.events,
                             last_event_at = greatest(t.last_event_at, s.last_event_at)
when not matched then insert values (s.project_id, s.events, s.last_event_at);

select lab.prove('row-by-row, staged ON CONFLICT and MERGE produce identical tables',
  not exists (select * from ps_row except select * from ps_bulk)
  and not exists (select * from ps_bulk except select * from ps_row)
  and not exists (select * from ps_merge except select * from ps_row)
  and (select count(*) from ps_row) = (select count(*) from ps_merge));
select lab.prove('the feed was about half updates and half inserts',
  :feed_updates between 0.4 * :feed_rows and 0.6 * :feed_rows);
\echo one upsert per row: :row_ms ms; staged, one statement: :bulk_ms ms
select lab.prove('staging plus one upsert is at least twice as fast as one upsert per row',
  :bulk_ms * 2 < :row_ms);
select lab.prove('COPY into a temporary staging table writes almost no WAL (under 8 kB)',
  :stage_wal < 8192);

-- The same key twice in one batch:
insert into stage select project_id, 1, last_event_at from stage
where project_id = (select min(project_id) from stage);
do $$
begin
  insert into ps_bulk select * from stage
  on conflict (project_id) do update set events = ps_bulk.events + excluded.events;
  raise exception 'no error';
exception when others then
  insert into lab.errs values ('same key twice', sqlstate, sqlerrm);
end $$;
select lab.prove('a batch with the same key twice fails ON CONFLICT DO UPDATE (21000)',
  (select state = '21000' and msg like 'ON CONFLICT DO UPDATE command cannot affect row a second time%'
   from lab.errs where test = 'same key twice'));
with r as (
  insert into ps_bulk
  select project_id, sum(events), max(last_event_at) from stage group by project_id
  on conflict (project_id) do update set events = ps_bulk.events + excluded.events
  returning 1)
select lab.prove('aggregating the stage by key first fixes it: one row per key',
  count(*) = :feed_rows) from r;

\echo
\echo == The numbers at lab scale
\pset tuples_only off
\pset format aligned
select method, n as rows, round(ms) as ms, round(n / greatest(ms, 1) * 1000) as rows_per_s,
       pg_size_pretty(wal) as wal, round(wal / n) as wal_per_row,
       pg_size_pretty(heap) as table, pg_size_pretty(idx) as indexes
from lab.runs order by ms / n desc;
