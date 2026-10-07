-- Lab for "Keep your updates HOT"
-- https://www.flagon.io/books/eight-kilobytes/hot
-- Run: ./lab 06-hot
--
-- WAL and buffer counts come from EXPLAIN (ANALYZE, BUFFERS, WAL) on each
-- statement (lab.plan), so other sessions can't leak into them. HOT counts come
-- from pg_stat_xact_user_tables, which updates instantly inside a transaction.
-- Full-page images depend on when the last checkpoint ran, so the script runs
-- CHECKPOINT itself before the measurements that count them.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;

create extension if not exists dblink;

-- Runs one statement under EXPLAIN (ANALYZE, BUFFERS, WAL) and saves what it
-- cost: rows updated, how many were HOT, how many moved to a new page, WAL
-- records, full-page images, WAL bytes and buffers touched.
create table measurements (name text primary key, m jsonb not null);

create or replace function measure(name text, stmt text)
returns jsonb
language plpgsql
as $$
declare
  before record;
  after  record;
  p      jsonb;
  m      jsonb;
begin
  select coalesce(sum(n_tup_upd), 0) as upd, coalesce(sum(n_tup_hot_upd), 0) as hot,
         coalesce(sum(n_tup_newpage_upd), 0) as newpage
  into before from pg_stat_xact_user_tables;
  p := lab.plan(stmt) -> 'Plan';
  select coalesce(sum(n_tup_upd), 0) as upd, coalesce(sum(n_tup_hot_upd), 0) as hot,
         coalesce(sum(n_tup_newpage_upd), 0) as newpage
  into after from pg_stat_xact_user_tables;
  m := jsonb_build_object(
    'updated', after.upd - before.upd,
    'hot',     after.hot - before.hot,
    'newpage', after.newpage - before.newpage,
    'records', (p ->> 'WAL Records')::bigint,
    'fpi',     (p ->> 'WAL FPI')::bigint,
    'bytes',   (p ->> 'WAL Bytes')::numeric,
    'buffers', coalesce((p ->> 'Shared Hit Blocks')::bigint, 0)
             + coalesce((p ->> 'Shared Read Blocks')::bigint, 0));
  insert into measurements values (name, m)
  on conflict on constraint measurements_pkey do update set m = excluded.m;
  return m;
end
$$;

-- One number from a saved measurement.
create or replace function m(name text, field text)
returns numeric
language sql
as $$ select (m ->> field)::numeric from measurements where measurements.name = m.name $$;

-- Pruning can only remove versions that every transaction in this database
-- has finished with, including ones that only hold a snapshot (an autovacuum
-- ANALYZE, say). On your own lab kit this usually returns at once; if
-- something else is running, it waits (up to a minute) until no other session
-- here holds an xid or a snapshot older than this call. Last, it uses up one
-- transaction id: a session caches its cleanup horizon and recomputes it only
-- once newer transactions have finished, so without that a quiet session could
-- keep pruning against a snapshot that is already gone.
create or replace procedure wait_for_older_transactions()
language plpgsql
as $$
declare
  target xid := (pg_snapshot_xmax(pg_current_snapshot())::text::bigint % 4294967296)::text::xid;
begin
  commit;
  for i in 1 .. 600 loop
    exit when not exists (
      select 1 from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
        and (age(backend_xmin) > age(target) or age(backend_xid) > age(target)));
    commit;
    perform pg_sleep(0.1);
  end loop;
  perform pg_current_xact_id();
  commit;
end
$$;

\echo
\echo == A cold update pays for every index

create table users_hot (
  id           bigint not null,
  account_id   bigint not null,
  email        text not null,
  name         text not null,
  login_count  int not null default 0,
  updated_at   timestamptz not null,
  created_at   timestamptz not null
) with (fillfactor = 90, autovacuum_enabled = off);

insert into users_hot
select id, account_id, email, name, 0, created_at, created_at from users;

create index users_hot_updated_at_idx on users_hot (updated_at);
alter table users_hot add primary key (id);
create index users_hot_account_id_idx on users_hot (account_id);
create index users_hot_email_idx      on users_hot (email);
create index users_hot_created_at_idx on users_hot (created_at);
create index users_hot_name_idx       on users_hot (name);
vacuum analyze users_hot;

\echo -- one row, record by record
checkpoint;
select from measure('row 1 hot',  $$ update users_hot set login_count = login_count + 1 where id = 4242 $$);
select from measure('row 2 cold', $$ update users_hot set login_count = login_count + 1,
                                     updated_at = updated_at + interval '1 second' where id = 4243 $$);
call wait_for_older_transactions();
select from measure('row 3 hot',  $$ update users_hot set login_count = login_count + 1 where id = 4244 $$);
call wait_for_older_transactions();
select from measure('row 4 cold', $$ update users_hot set login_count = login_count + 1,
                                     updated_at = updated_at + interval '1 second' where id = 4245 $$);

select format('%s: %s records, %s fpi, %s bytes', name, m ->> 'records', m ->> 'fpi', m ->> 'bytes')
from measurements where name like 'row %' order by name;
select lab.prove(
  'right after a checkpoint, the HOT update is one record carrying two full-page images (heap and visibility map)',
  m('row 1 hot', 'records') = 1 and m('row 1 hot', 'fpi') = 2);
select lab.prove(
  'that HOT update writes about 15.7 kB of WAL for a 4-byte change',
  m('row 1 hot', 'bytes') between 15000 and 16500);
select lab.prove(
  'the cold update writes seven records: one heap record and one per index',
  m('row 2 cold', 'records') = 7);
select lab.prove(
  'every one of those seven records carried an 8 KB page image: about 51 KB',
  m('row 2 cold', 'fpi') = 7 and m('row 2 cold', 'bytes') between 50000 and 55000);
select lab.prove(
  'a moment later a HOT update costs about 127 bytes: the update plus a small prune record, no images',
  m('row 3 hot', 'records') = 2 and m('row 3 hot', 'fpi') = 0
  and m('row 3 hot', 'bytes') between 100 and 160);
select lab.prove(
  'the next cold update still writes a record per index, and two index leaves needed images: about 15 kB',
  m('row 4 cold', 'records') = 8 and m('row 4 cold', 'fpi') = 2
  and m('row 4 cold', 'bytes') between 14000 and 16500);

\echo -- 5,000 rows, with 1, 3 and 6 indexes

-- The same table built with one index (updated_at), three (plus the primary
-- key and account_id) or six. h* tables get HOT updates, c* tables cold ones.
create or replace function make_users_copy(tbl text, indexes int)
returns void
language plpgsql
as $$
begin
  execute format($f$
    create table %I (
      id bigint not null, account_id bigint not null, email text not null, name text not null,
      login_count int not null default 0, updated_at timestamptz not null, created_at timestamptz not null
    ) with (fillfactor = 90, autovacuum_enabled = off)$f$, tbl);
  execute format('insert into %I select id, account_id, email, name, 0, created_at, created_at from users', tbl);
  execute format('create index on %I (updated_at)', tbl);
  if indexes >= 3 then
    execute format('alter table %I add primary key (id)', tbl);
    execute format('create index on %I (account_id)', tbl);
  end if;
  if indexes >= 6 then
    execute format('create index on %I (email)', tbl);
    execute format('create index on %I (created_at)', tbl);
    execute format('create index on %I (name)', tbl);
  end if;
end
$$;

select from make_users_copy('h1', 1) t1, make_users_copy('h3', 3) t2, make_users_copy('h6', 6) t3,
            make_users_copy('c1', 1) t4, make_users_copy('c3', 3) t5, make_users_copy('c6', 6) t6;
vacuum analyze h1, h3, h6, c1, c3, c6;

-- Vacuum can't run inside a function, so measure its cost around it: index
-- pages it read (pg_statio) and WAL it wrote (this backend's WAL counters).
create table vacuum_cost (tbl text primary key, idx_blocks bigint, wal_records bigint, wal_bytes numeric);

create or replace function vacuum_start(tbl text)
returns void
language sql
as $$
  insert into vacuum_cost
  select tbl,
         (select idx_blks_hit + idx_blks_read from pg_statio_user_tables where relname = tbl),
         w.wal_records, w.wal_bytes
  from pg_stat_get_backend_wal(pg_backend_pid()) w
$$;

create or replace function vacuum_end(tbl text)
returns void
language sql
as $$
  update vacuum_cost v
  set idx_blocks  = (select idx_blks_hit + idx_blks_read from pg_statio_user_tables where relname = tbl) - v.idx_blocks,
      wal_records = w.wal_records - v.wal_records,
      wal_bytes   = w.wal_bytes - v.wal_bytes
  from pg_stat_get_backend_wal(pg_backend_pid()) w
  where v.tbl = vacuum_end.tbl
$$;

-- For each table: checkpoint, a first batch (one row in twenty), a second
-- batch on different rows, then a vacuum. \gexec runs each generated
-- statement in turn, so the checkpoint and vacuum run at top level.
select stmt
from (values (1, 'h1', ''), (2, 'h3', ''), (3, 'h6', ''),
             (4, 'c1', ', updated_at = updated_at + interval ''1 second'''),
             (5, 'c3', ', updated_at = updated_at + interval ''1 second'''),
             (6, 'c6', ', updated_at = updated_at + interval ''1 second''')
     ) as t(n, tbl, extra),
     unnest(array[
       'checkpoint',
       format('select from measure(%L, %L)', tbl || ' batch 1',
              format('update %I set login_count = login_count + 1%s where id %% 20 = 0', tbl, extra)),
       'call wait_for_older_transactions()',
       format('select from measure(%L, %L)', tbl || ' batch 2',
              format('update %I set login_count = login_count + 1%s where id %% 20 = 10', tbl, extra)),
       'select from pg_stat_force_next_flush()',
       format('select from vacuum_start(%L)', tbl),
       format('vacuum %I', tbl),
       'select from pg_stat_force_next_flush()',
       format('select from vacuum_end(%L)', tbl)
     ]) with ordinality as s(stmt, k)
order by n, k
\gexec

select format('%s: %s records, %s fpi, %s bytes, %s buffers', name, m ->> 'records', m ->> 'fpi',
              m ->> 'bytes', m ->> 'buffers')
from measurements where name ~ '^[hc][136] batch' order by name;
select format('vacuum %s: %s index blocks, %s WAL records, %s WAL bytes', tbl, idx_blocks, wal_records, wal_bytes)
from vacuum_cost order by tbl;
select lab.prove(
  'the HOT batch writes one record per row, 5,000, with one, three or six indexes',
  m('h1 batch 1', 'records') = 5000 and m('h3 batch 1', 'records') = 5000
  and m('h6 batch 1', 'records') = 5000);
select lab.prove(
  'every batch on the h tables was HOT, every batch on the c tables cold',
  (select bool_and(case when name like 'h%' then (m ->> 'hot')::int = 5000
                        else (m ->> 'hot')::int = 0 end)
   from measurements where name ~ '^[hc][136] batch'));
select lab.prove(
  'the HOT batch writes the same WAL for one, three or six indexes (within 1 percent)',
  (select max(m('h' || n || ' batch 1', 'bytes')) / min(m('h' || n || ' batch 1', 'bytes'))
   from unnest(array[1, 3, 6]) n) < 1.01);
select lab.prove(
  'right after a checkpoint the HOT batch writes about 1,371 full-page images and 10 MB',
  m('h6 batch 1', 'fpi') between 1300 and 1450
  and m('h6 batch 1', 'bytes') between 10e6 and 11e6);
select lab.prove(
  'cold batches write one more record per row per index: 10,000, about 20,250 and about 35,250',
  m('c1 batch 1', 'records') = 10000
  and m('c3 batch 1', 'records') between 20000 and 20500
  and m('c6 batch 1', 'records') between 35000 and 35500);
select lab.prove(
  'right after a checkpoint, cold with six indexes writes about 2.4 times the WAL of HOT',
  m('c6 batch 1', 'bytes') / m('h6 batch 1', 'bytes') between 2.2 and 2.7);
select lab.prove(
  'the second HOT batch writes about 438 kB (no images, plus one prune record per page)',
  m('h6 batch 2', 'bytes') between 400e3 and 500e3
  and m('h6 batch 2', 'fpi') = 0
  and m('h6 batch 2', 'records') between 6000 and 6700);
select lab.prove(
  'second batch, cold vs HOT: about 2.3x with one index',
  m('c1 batch 2', 'bytes') / m('h1 batch 2', 'bytes') between 2.0 and 2.6);
select lab.prove(
  'second batch, cold vs HOT: about 4.5x with three indexes',
  m('c3 batch 2', 'bytes') / m('h3 batch 2', 'bytes') between 4.0 and 5.0);
select lab.prove(
  'second batch, cold vs HOT: about 6.9x with six indexes',
  m('c6 batch 2', 'bytes') / m('h6 batch 2', 'bytes') between 6.2 and 7.6);
select lab.prove(
  'the HOT batch touches the same buffers in every configuration; cold with six indexes about 7.7 times as many',
  m('h1 batch 2', 'buffers') = m('h6 batch 2', 'buffers')
  and m('c6 batch 2', 'buffers') / m('h6 batch 2', 'buffers') between 7.0 and 8.3);

\echo -- the bill keeps coming: vacuum

select lab.prove(
  'after HOT updates, vacuum has nothing to remove from any index (it reads only metapages)',
  (select idx_blocks from vacuum_cost where tbl = 'h6') < 20);
select lab.prove(
  'after cold updates, vacuum reads every page of all six indexes',
  (select idx_blocks from vacuum_cost where tbl = 'c6')
    >= pg_indexes_size('c6') / 8192 - 5);
select lab.prove(
  'vacuum after the cold six-index updates writes more than twice the WAL of vacuum after HOT ones',
  (select wal_bytes from vacuum_cost where tbl = 'c6')
    > 2 * (select wal_bytes from vacuum_cost where tbl = 'h6'));

\echo
\echo == HOT-safe, and then HOT

create table projects_hot (
  id          bigint primary key,
  account_id  bigint not null,
  name        text not null,
  slug        text not null,
  budget      numeric not null default 1.0,
  archived_at timestamptz,
  created_at  timestamptz not null
) with (fillfactor = 80);

insert into projects_hot
select id, account_id, name, lower(replace(name, ' ', '-')), 1.0, null, created_at
from projects;

create index on projects_hot (account_id) where archived_at is null;  -- partial
create index on projects_hot (account_id) include (name);             -- covering
create index on projects_hot (lower(slug));                           -- expression
create index on projects_hot using brin (created_at);                 -- summarizing
create index on projects_hot (budget);
vacuum analyze projects_hot;

update projects_hot set archived_at = now() where id = 1;
select from pg_stat_force_next_flush();
select lab.prove(
  'a partial index predicate column counts: archiving is cold (after a flush, 1 update, 0 HOT)',
  (select n_tup_upd = 1 and n_tup_hot_upd = 0
   from pg_stat_user_tables where relname = 'projects_hot'));

select from measure('include',    $$ update projects_hot set name = name || ' (old)' where id = 2 $$);
select from measure('expression', $$ update projects_hot set slug = upper(slug) where id = 3 $$);
select from measure('brin',       $$ update projects_hot set created_at = created_at - interval '1 day' where id = 4 $$);
select from measure('scale',      $$ update projects_hot set budget = 1.00 where id = 5 $$);
select from measure('same',       $$ update projects_hot set name = name, account_id = account_id,
                                     budget = budget where id = 6 $$);
select from measure('control',    $$ update projects_hot set budget = 1.0 where id = 7 $$);

select lab.prove('INCLUDE columns count: renaming is cold',
  m('include', 'updated') = 1 and m('include', 'hot') = 0);
select lab.prove('expression indexes count the column: changing slug is cold even though lower() gives the same value',
  m('expression', 'hot') = 0
  and (select lower(slug) = lower(upper(slug)) from projects_hot where id = 3));
select lab.prove('a column covered only by BRIN stays HOT (PostgreSQL 16+)',
  m('brin', 'hot') = 1);
select lab.prove('numeric 1.0 to 1.00 is cold: equal as numbers, different bytes',
  m('scale', 'hot') = 0
  and 1.0::numeric = 1.00::numeric
  and numeric_send(1.0) <> numeric_send(1.00));
select lab.prove('set x = x on indexed columns stays HOT: the bytes did not change',
  m('same', 'hot') = 1);
select lab.prove('(control) writing the same budget value is HOT',
  m('control', 'hot') = 1);
select lab.prove('none of these cold updates moved to another page: they had room',
  (select sum((m ->> 'newpage')::int) from measurements
   where name in ('include', 'expression', 'scale')) = 0);

\echo -- an invalid index still blocks HOT

create table invalid_demo (
  id    int primary key,
  code  int not null,
  note  int not null default 0
) with (fillfactor = 90);
insert into invalid_demo select g, g % 10 from generate_series(1, 1000) g;
vacuum invalid_demo;

-- A concurrent unique build that fails on duplicates leaves an invalid index.
-- (CREATE INDEX CONCURRENTLY can't run in a function, so it runs over dblink.)
do $$
begin
  perform dblink_exec('dbname=' || current_database(),
    'create unique index concurrently invalid_demo_code_idx on invalid_demo (code)');
  raise exception 'no error';
exception when unique_violation then
  null;
end
$$;

select lab.prove('the failed concurrent build left an invalid index behind',
  (select not indisvalid from pg_index where indexrelid = 'invalid_demo_code_idx'::regclass));
select from measure('invalid indexed', $$ update invalid_demo set code = code + 100 where id = 1 $$);
select from measure('invalid other',   $$ update invalid_demo set note = 1 where id = 2 $$);
select lab.prove('an invalid, never-finished index still makes updates of its column cold',
  m('invalid indexed', 'hot') = 0 and m('invalid indexed', 'newpage') = 0);
select lab.prove('(control) updating an unindexed column of the same table is HOT',
  m('invalid other', 'hot') = 1);

\echo
\echo == Inside a HOT chain

create table counters (
  id    int primary key,
  hits  int not null default 0,
  label text not null
) with (autovacuum_enabled = off);

insert into counters (id, label)
select g, 'counter ' || lpad(g::text, 12, '0') from generate_series(1, 128) g;
vacuum counters;

select lab.prove('128 short rows fill one page to within 488 bytes',
  pg_relation_size('counters') = 8192
  and (select upper - lower from page_header(get_raw_page('counters', 0))) = 488);

-- A second session opens a repeatable-read transaction and holds it.
select from dblink_connect('held', 'dbname=' || current_database());
select from dblink_exec('held', 'begin isolation level repeatable read');
select from dblink('held', 'select count(*) from accounts') as t(n bigint);

update counters set hits = hits + 1 where id = 1;
update counters set hits = hits + 1 where id = 1;
update counters set hits = hits + 1 where id = 1;

create view page0 as
select lp, lp_flags, lp_off, t_ctid, raw_flags
from heap_page_items(get_raw_page('counters', 0)),
     heap_tuple_infomask_flags(t_infomask, t_infomask2);

select lab.prove('four versions of row 1, linked by t_ctid: slot 1 to 129 to 130 to 131',
  (select array_agg(t_ctid::text order by lp) from page0 where lp in (1, 129, 130, 131))
  = array['(0,129)', '(0,130)', '(0,131)', '(0,131)']);
select lab.prove('the original version is HEAP_HOT_UPDATED and not heap-only',
  (select 'HEAP_HOT_UPDATED' = any(raw_flags) and not 'HEAP_ONLY_TUPLE' = any(raw_flags)
   from page0 where lp = 1));
select lab.prove('the middle versions are both HEAP_HOT_UPDATED and HEAP_ONLY_TUPLE',
  (select bool_and('HEAP_HOT_UPDATED' = any(raw_flags) and 'HEAP_ONLY_TUPLE' = any(raw_flags))
   from page0 where lp in (129, 130)));
select lab.prove('the newest version is HEAP_ONLY_TUPLE: no index points at it',
  (select 'HEAP_ONLY_TUPLE' = any(raw_flags) and not 'HEAP_HOT_UPDATED' = any(raw_flags)
   from page0 where lp = 131));
select lab.prove('the index has one entry for key 1, still pointing at (0,1)',
  (select count(*) = 1 and min(ctid::text) = '(0,1)'
   from bt_page_items('counters_pkey', 1)
   where data = '01 00 00 00 00 00 00 00'));

set enable_seqscan = off;
select lab.prove('an index scan follows the chain in two buffers: one index page, one heap page',
  lab.buffers($$ select * from counters where id = 1 $$) = 2);

\echo -- pruning turns the chain into a redirect

select from dblink_exec('held', 'commit');
call wait_for_older_transactions();

select from measure('prune read', $$ select * from counters where id = 1 $$);
select lab.prove('a read query wrote WAL: one small prune record',
  m('prune read', 'records') = 1 and m('prune read', 'bytes') < 100);
select format('the read: WAL records=%s bytes=%s', m('prune read', 'records'), m('prune read', 'bytes'));
select format('lp %s: lp_flags %s, lp_off %s, t_ctid %s', lp, lp_flags, lp_off, coalesce(t_ctid::text, '-'))
from page0 where lp in (1, 2) or lp > 128 order by lp;
select lab.prove('slot 1 is now a redirect (lp_flags 2) to slot 131',
  (select lp_flags = 2 and lp_off = 131 from page0 where lp = 1));
select lab.prove('slots 129 and 130 are unused (lp_flags 0), with no vacuum and no index change',
  (select bool_and(lp_flags = 0) from page0 where lp in (129, 130)));
select lab.prove('slot 131 holds the live version',
  (select lp_flags = 1 from page0 where lp = 131));

delete from counters where id = 1;
call wait_for_older_transactions();
select * from counters where id = 2 \g /dev/null

select lab.prove('when the whole chain dies, the root becomes a dead stub (lp_flags 3)',
  (select lp_flags = 3 from page0 where lp = 1));
select lab.prove('slots 129 to 131 vanished: unused slots at the end get trimmed off',
  (select max(lp) from page0) = 128);
select lab.prove('the primary key still has an entry for key 1 until vacuum',
  (select count(*) from bt_page_items('counters_pkey', 1)
   where data = '01 00 00 00 00 00 00 00') = 1);

vacuum counters;
select lab.prove('after vacuum, the index entry for key 1 is gone and slot 1 is unused',
  (select lp_flags = 0 from page0 where lp = 1)
  and (select count(*) from bt_page_items('counters_pkey', 1)
       where data = '01 00 00 00 00 00 00 00') = 0);
select from dblink_disconnect('held');

\echo -- when pruning runs

select lab.prove('the on-access pruning floor is 10 percent of a page: 819 bytes',
  current_setting('block_size')::int / 10 = 819);

create table roomy (id int primary key, hits int not null default 0);
insert into roomy (id) values (1), (2), (3);
update roomy set hits = hits + 1 where id = 1;
update roomy set hits = hits + 1 where id = 1;
call wait_for_older_transactions();

select from measure('roomy read', $$ select * from roomy where id = 1 $$);
select lab.prove('a roomy page is not pruned on access: no WAL, the old versions stay',
  m('roomy read', 'records') = 0
  and (select count(*) from heap_page_items(get_raw_page('roomy', 0)) where lp_flags = 1) = 5);
select lab.prove('it carries a prune hint but has far more than 819 bytes free',
  (select prune_xid <> '0' and upper - lower > 7000 from page_header(get_raw_page('roomy', 0))));
reset enable_seqscan;

\echo -- a page holds at most 291 line pointers

create table no_columns ();
insert into no_columns select from generate_series(1, 600);
select lab.prove('a page holds at most 291 line pointers, even for empty rows',
  (select count(*) from no_columns where (ctid::text::point)[0] = 0) = 291);

\echo
\echo == Leave room on the page, or every update moves

create or replace function make_users_ff(tbl text, ff int, autovacuum boolean default false)
returns void
language plpgsql
as $$
begin
  execute format($f$
    create table %I (
      id bigint primary key, account_id bigint not null, email text not null, name text not null,
      login_count int not null default 0, created_at timestamptz not null,
      unique (account_id, email)
    ) with (fillfactor = %s, autovacuum_enabled = %s)$f$, tbl, ff, autovacuum);
  execute format('insert into %I select id, account_id, email, name, 0, created_at from users', tbl);
end
$$;

\echo -- one app, one row at a time

-- 50,000 single-row updates on random users, each its own transaction, the
-- way an app does it (same random sequence for both tables).
create or replace procedure random_updates(tbl text, n int)
language plpgsql
as $$
begin
  perform setseed(0.42);
  for i in 1 .. n loop
    execute format('update %I set login_count = login_count + 1 where id = $1', tbl)
      using (1 + floor(random() * 100000))::bigint;
    commit;
  end loop;
end
$$;

select from make_users_ff('users_ff100', 100) t1, make_users_ff('users_ff90', 90) t2;
vacuum analyze users_ff100, users_ff90;
create table sizes_before as
select relname, pg_relation_size(relid) / 8192 as heap_pages, pg_indexes_size(relid) / 8192 as index_pages
from pg_stat_user_tables where relname in ('users_ff100', 'users_ff90');

call wait_for_older_transactions();
-- The loops commit 100,000 times; don't wait for a flush on each one. (Only
-- here: vacuum can't mark pages all-visible until the commit that wrote their
-- rows has been flushed, so the rest of the script keeps the default.)
set synchronous_commit = off;
call random_updates('users_ff100', 50000);
call random_updates('users_ff90', 50000);
reset synchronous_commit;
select from pg_stat_force_next_flush();

select lab.prove('fillfactor 90: every one of 50,000 single-row updates was HOT, none moved',
  (select n_tup_upd = 50000 and n_tup_hot_upd = 50000 and n_tup_newpage_upd = 0
   from pg_stat_user_tables where relname = 'users_ff90'));
select lab.prove('fillfactor 90: the table did not grow',
  pg_relation_size('users_ff90') / 8192
  = (select heap_pages from sizes_before where relname = 'users_ff90'));
select lab.prove('fillfactor 100: thousands of HOT-safe updates moved to new pages and went cold',
  (select n_tup_newpage_upd between 1000 and 5000
       and n_tup_hot_upd + n_tup_newpage_upd = n_tup_upd
   from pg_stat_user_tables where relname = 'users_ff100'));
select lab.prove('fillfactor 100: the packed table grew',
  pg_relation_size('users_ff100') / 8192
  > (select heap_pages from sizes_before where relname = 'users_ff100'));

\echo -- batch jobs are harsher

select from make_users_ff('bulk_ff100', 100) t1, make_users_ff('bulk_ff90', 90) t2,
       make_users_ff('bulk_ff70', 70) t3, make_users_ff('held_ff90', 90) t4;
vacuum analyze bulk_ff100, bulk_ff90, bulk_ff70, held_ff90;
create table bulk_before as
select relname, pg_relation_size(relid) / 8192 as heap_pages, pg_indexes_size(relid) / 8192 as index_pages
from pg_stat_user_tables where relname like 'bulk_ff%' or relname = 'held_ff90';

select lab.prove('freshly loaded: 1,137 pages at fillfactor 100, 1,266 at 90, 1,613 at 70',
  (select array_agg(heap_pages order by relname) from bulk_before where relname like 'bulk%')
  = array[1137, 1613, 1266]::bigint[]);

-- Five batches, each updating 10 percent of rows in one statement.
select stmt
from generate_series(0, 4) as k,
     unnest(array[
       'call wait_for_older_transactions()',
       format('select from measure(%L, %L)', 'bulk_ff100 ' || k,
              format('update bulk_ff100 set login_count = login_count + 1 where id %% 10 = %s', k)),
       format('select from measure(%L, %L)', 'bulk_ff90 ' || k,
              format('update bulk_ff90 set login_count = login_count + 1 where id %% 10 = %s', k)),
       format('select from measure(%L, %L)', 'bulk_ff70 ' || k,
              format('update bulk_ff70 set login_count = login_count + 1 where id %% 10 = %s', k))
     ]) with ordinality as s(stmt, n)
order by k, n
\gexec

select lab.prove('first batch at fillfactor 100: 0 of 10,000 updates HOT, about 40,471 WAL records',
  m('bulk_ff100 0', 'hot') = 0 and m('bulk_ff100 0', 'records') between 40000 and 41000);
select lab.prove('first batch at fillfactor 90 and 70: all 10,000 HOT, one record each',
  m('bulk_ff90 0', 'hot') = 10000 and m('bulk_ff90 0', 'records') = 10000
  and m('bulk_ff70 0', 'hot') = 10000 and m('bulk_ff70 0', 'records') = 10000);
select lab.prove('the packed table wrote about five times the WAL (3.5 MB vs 703 KB)',
  m('bulk_ff100 0', 'bytes') / m('bulk_ff90 0', 'bytes') between 4.5 and 5.6);
select lab.prove('and touched almost five times the buffers (103,024 vs 22,532)',
  m('bulk_ff100 0', 'buffers') / m('bulk_ff90 0', 'buffers') between 4.2 and 5.0);
select lab.prove('after five batches the fillfactor 100 table reached about 77 percent HOT',
  (select sum((m ->> 'hot')::int) from measurements where name like 'bulk_ff100 %')
    between 35000 and 42000);
select lab.prove('and grew to the size of the fillfactor 90 table, 1,266 pages',
  abs(pg_relation_size('bulk_ff100') / 8192 - pg_relation_size('bulk_ff90') / 8192) <= 5);
select lab.prove('its indexes grew (by about 43 pages); the fillfactor 90 indexes did not',
  pg_indexes_size('bulk_ff100') / 8192
    - (select index_pages from bulk_before where relname = 'bulk_ff100') between 20 and 80
  and pg_indexes_size('bulk_ff90') / 8192
    = (select index_pages from bulk_before where relname = 'bulk_ff90'));

\echo -- what headroom costs

select lab.prove('fillfactor 90 is about 11 percent bigger than 100; 70 is about 42 percent bigger',
  (select heap_pages from bulk_before where relname = 'bulk_ff90') / 1137.0 between 1.09 and 1.13
  and (select heap_pages from bulk_before where relname = 'bulk_ff70') / 1137.0 between 1.40 and 1.44);

\echo -- changing it later rewrites nothing

create table users_copy as select * from users;
select pg_relation_size('users_copy') / 8192 as pages_before \gset
alter table users_copy set (fillfactor = 80);
select lab.prove('alter table ... set (fillfactor = 80) leaves every existing page packed',
  pg_relation_size('users_copy') / 8192 = :pages_before);
vacuum full users_copy;
select lab.prove('vacuum full rewrites the table at the new fillfactor: about 23 percent more pages',
  pg_relation_size('users_copy') / 8192.0 / :pages_before between 1.18 and 1.28);

\echo
\echo == A long transaction turns HOT off

select from dblink_connect('held', 'dbname=' || current_database());
select from dblink_exec('held', 'begin isolation level repeatable read');
select from dblink('held', 'select count(*) from accounts') as t(n bigint);

select stmt
from generate_series(0, 4) as k,
     unnest(array[
       format('select from measure(%L, %L)', 'held_ff90 ' || k,
              format('update held_ff90 set login_count = login_count + 1 where id %% 10 = %s', k))
     ]) as stmt
order by k
\gexec

select from dblink_exec('held', 'commit');
select from dblink_disconnect('held');

select lab.prove('with no open transaction, the fillfactor 90 table stayed (almost) 100 percent HOT',
  (select sum((m ->> 'hot')::int) from measurements where name like 'bulk_ff90 %') >= 49950);
select lab.prove('with session A holding a snapshot, the HOT rate fell to about 23 percent',
  (select sum((m ->> 'hot')::int) from measurements where name like 'held_ff90 %')
    between 9000 and 14000);
select lab.prove('the table grew about 39 percent (1,266 to about 1,755 pages)',
  pg_relation_size('held_ff90') / 8192.0
    / (select heap_pages from bulk_before where relname = 'held_ff90') between 1.3 and 1.45);
select lab.prove('its indexes grew about 37 percent',
  pg_indexes_size('held_ff90') / 8192.0
    / (select index_pages from bulk_before where relname = 'held_ff90') between 1.3 and 1.45);

\echo
\echo == Designs that keep updates HOT

\echo -- move hot counters to a narrow table

create table profiles (
  id          bigint primary key,
  account_id  bigint not null,
  bio         text not null,
  view_count  bigint not null default 0
) with (fillfactor = 90, autovacuum_enabled = off);
insert into profiles select id, account_id, repeat(md5(id::text), 13), 0 from users;

create table profile_counters (
  profile_id  bigint primary key,
  view_count  bigint not null default 0
) with (fillfactor = 90, autovacuum_enabled = off);
insert into profile_counters select id from users;
vacuum analyze profiles, profile_counters;

select lab.prove('the wide table holds 15 rows per page (6,667 pages); the side table 599 pages',
  pg_relation_size('profiles') / 8192 = 6667 and pg_relation_size('profile_counters') / 8192 = 599);

checkpoint;
select from measure('wide 1',   $$ update profiles set view_count = view_count + 1 where id % 10 = 0 $$);
select from measure('narrow 1', $$ update profile_counters set view_count = view_count + 1 where profile_id % 10 = 0 $$);
call wait_for_older_transactions();
select from measure('wide 2',   $$ update profiles set view_count = view_count + 1 where id % 10 = 5 $$);
select from measure('narrow 2', $$ update profile_counters set view_count = view_count + 1 where profile_id % 10 = 5 $$);

select lab.prove('the narrow counter table stays HOT and does not grow',
  m('narrow 1', 'hot') = 10000 and m('narrow 2', 'hot') = 10000
  and pg_relation_size('profile_counters') / 8192 = 599);
select lab.prove('(so does the wide table, at this pace)',
  m('wide 1', 'hot') = 10000 and m('wide 2', 'hot') = 10000);
select lab.prove('right after a checkpoint the side table writes about a tenth of the WAL',
  m('wide 1', 'bytes') / m('narrow 1', 'bytes') between 8 and 12);
select lab.prove('in steady state the gap is small: a same-page update logs only the bytes that changed',
  m('wide 2', 'bytes') / m('narrow 2', 'bytes') < 2);

-- A burst: one statement updating every fifth row, on fresh copies of both.
create table profiles_burst (like profiles including all) with (fillfactor = 90, autovacuum_enabled = off);
insert into profiles_burst select * from profiles;
create table counters_burst (like profile_counters including all) with (fillfactor = 90, autovacuum_enabled = off);
insert into counters_burst select * from profile_counters;
vacuum analyze profiles_burst, counters_burst;
select from measure('wide burst',   $$ update profiles_burst set view_count = view_count + 1 where id % 5 = 0 $$);
select from measure('narrow burst', $$ update counters_burst set view_count = view_count + 1 where profile_id % 5 = 0 $$);

select lab.prove('a burst of 20,000 updates in one statement costs both tables HOT: about 67 and 54 percent',
  m('wide burst', 'hot') between 12000 and 14400
  and m('narrow burst', 'hot') between 9000 and 13000);
select lab.prove('and both grew: the wide table to about 7,112 pages, the narrow one to about 654',
  pg_relation_size('profiles_burst') / 8192 between 7000 and 7250
  and pg_relation_size('counters_burst') / 8192 between 620 and 700);

\echo -- bottom-up index deletion is the safety net

create table churn (
  id          bigint primary key,
  email       text not null,
  updated_at  timestamptz not null,
  saves       int not null default 0
) with (autovacuum_enabled = off);
insert into churn select id, email, created_at, 0 from users;
create index churn_email_idx on churn (email);
create index churn_updated_at_idx on churn (updated_at);
analyze churn;

create table churn_before as
select relname, pg_relation_size(oid) / 8192 as pages
from pg_class where relname like 'churn%idx' or relname = 'churn_pkey';

-- Heap pointers held in an index's leaf pages (posting lists count each TID).
create or replace function heap_pointers(idx text)
returns bigint
language sql
as $$
  select sum(coalesce(cardinality(i.tids), 1))
  from generate_series(1, pg_relation_size(idx::regclass) / 8192 - 1) as blk,
       lateral bt_page_stats(idx, blk::int) as s,
       lateral bt_page_items(idx, blk::int) as i
  where s.type = 'l'
    and not (s.btpo_next <> 0 and i.itemoffset = 1)  -- skip the high key
$$;

-- 300,000 cold updates in 30 committed batches, each changing updated_at.
create or replace procedure churn_batches(n int)
language plpgsql
as $$
begin
  for k in 1 .. n loop
    update churn set updated_at = updated_at + interval '1 second', saves = saves + 1
    where id % 10 = k % 10;
    commit;
    call wait_for_older_transactions();
  end loop;
end
$$;
call churn_batches(30);
select from pg_stat_force_next_flush();

select lab.prove('all 300,000 churn updates were cold',
  (select n_tup_upd = 300000 and n_tup_hot_upd = 0 from pg_stat_user_tables where relname = 'churn'));
select lab.prove('the updated_at index holds all 400,000 pointers: live and stale',
  heap_pointers('churn_updated_at_idx') = 400000);
select lab.prove('the primary key, whose key never changed, deleted over half its stale entries on the fly',
  heap_pointers('churn_pkey') < 250000);
select lab.prove('so did the email index',
  heap_pointers('churn_email_idx') < 250000);
select lab.prove('the updated_at index quadrupled in size; the primary key only doubled',
  pg_relation_size('churn_updated_at_idx') / 8192.0
    / (select pages from churn_before where relname = 'churn_updated_at_idx') > 3.5
  and pg_relation_size('churn_pkey') / 8192.0
    / (select pages from churn_before where relname = 'churn_pkey') < 2.2);

\echo
\echo == Measuring HOT in production

select from pg_stat_force_next_flush();
create table hot_report as
select relname,
       n_tup_upd,
       n_tup_hot_upd                                 as hot,
       n_tup_newpage_upd                             as no_room,
       n_tup_upd - n_tup_hot_upd - n_tup_newpage_upd as index_changed,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) as hot_pct
from pg_stat_user_tables
where n_tup_upd > 0;

\pset tuples_only off
\pset format aligned
select * from hot_report
where relname in ('churn', 'held_ff90', 'bulk_ff100', 'users_ff100', 'users_ff90', 'projects_hot')
order by n_tup_upd desc, hot;
\pset format unaligned
\pset tuples_only on

select lab.prove('n_tup_upd counts HOT and new-page updates too: the remainder is never negative',
  (select bool_and(index_changed >= 0) from hot_report));
select lab.prove('when no indexed column changes, every cold update is a "no room" one',
  (select index_changed = 0 and no_room > 0 from hot_report where relname = 'bulk_ff100'));
select lab.prove('projects_hot: four cold updates, all because an indexed column changed',
  (select index_changed = 4 and no_room = 0 and hot = 3 from hot_report where relname = 'projects_hot'));
select lab.prove('churn: some cold updates moved pages, the rest changed an index in place',
  (select no_room > 0 and index_changed > 0 from hot_report where relname = 'churn'));

begin;
update roomy set hits = hits + 1 where id = 2;
select lab.prove('inside a transaction, pg_stat_xact_user_tables already shows the update',
  (select n_tup_upd = 1 from pg_stat_xact_user_tables where relname = 'roomy'));
commit;
