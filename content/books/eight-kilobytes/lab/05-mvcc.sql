-- Lab for "Updates are inserts"
-- https://www.flagon.io/books/eight-kilobytes/mvcc
-- Run: ./lab 05-mvcc
--
-- Reads tuple headers with pageinspect, measures bloat with pgstattuple, and
-- opens a second session with dblink to watch snapshots and blocked cleanup.
\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;
create extension if not exists dblink;
create extension if not exists pg_visibility;

-- Statistics views lag a little; this pushes our own counters out so the
-- next statement sees them.
create function pg_temp.flush_stats() returns void language sql as
  $$ select pg_stat_force_next_flush() $$;

\echo
\echo == Transaction IDs
select lab.prove(
  'all two million events were inserted by one transaction, and none has been deleted',
  min(xmin::text::bigint) = max(xmin::text::bigint) and bool_and(xmax::text = '0'))
from events;

\echo
\echo == A demo table
create table account_usage (
  account_id    bigint primary key references accounts (id),
  events_today  int not null default 0,
  updated_at    timestamptz not null default now()
) with (autovacuum_enabled = off);
insert into account_usage (account_id) values (1), (2), (3);
select lab.prove(
  'three rows on page 0, all inserted by one transaction, none deleted',
  array_agg(ctid::text order by account_id) = '{"(0,1)","(0,2)","(0,3)"}'
  and count(distinct xmin::text) = 1 and bool_and(xmax::text = '0'))
from account_usage;

\echo
\echo == An update writes a whole new row
create temp table first_update as
  with u as (
    update account_usage set events_today = events_today + 1
    where account_id = 1
    returning old.ctid as old_ctid, new.ctid as new_ctid
  ) select * from u;
select lab.prove(
  'the updated row moved from (0,1) to a brand new slot, (0,4)',
  old_ctid = '(0,1)' and new_ctid = '(0,4)') from first_update;

create temp view page0 as
  select lp, lp_off, lp_flags, lp_len, t_xmin, t_xmax, t_ctid, raw_flags, combined_flags
  from heap_page_items(get_raw_page('account_usage', 0)),
       heap_tuple_infomask_flags(t_infomask, t_infomask2);

select lab.prove(
  'the old version is still there, stamped with the updater''s xid and pointing at (0,4)',
  (select t_xmax from page0 where lp = 1) = (select t_xmin from page0 where lp = 4)
  and (select t_ctid from page0 where lp = 1) = '(0,4)');
select lab.prove(
  'four tuples for three rows',
  (select count(*) from page0) = 4);
select lab.prove(
  'HEAP_HOT_UPDATED on the old version and HEAP_ONLY_TUPLE on the new: a HOT update',
  'HEAP_HOT_UPDATED' = any((select raw_flags from page0 where lp = 1)::text[])
  and 'HEAP_ONLY_TUPLE' = any((select raw_flags from page0 where lp = 4)::text[]));

update account_usage set events_today = events_today + 1 where account_id = 1;
update account_usage set events_today = events_today + 1 where account_id = 1;
select lab.prove(
  'two more updates: six tuples for three rows, chained (0,1) to (0,4) to (0,5) to (0,6)',
  (select count(*) from page0) = 6
  and (select array_agg(t_ctid::text order by lp) from page0 where lp in (1, 4, 5, 6))
      = '{"(0,4)","(0,5)","(0,6)","(0,6)"}');

-- A wide row: a 4-byte counter next to 1,000 bytes of text.
create table wide_counter (id int primary key, counter int not null, body text)
  with (fillfactor = 50, autovacuum_enabled = off);
insert into wide_counter select g, 0, repeat('x', 1000) from generate_series(1, 100) g;
-- Measure an update that writes no full-page image (if another session's
-- checkpoint lands first, the update carries an 8 KB page image; try again).
create temp table wide_wal (bytes numeric);
do $$
declare p jsonb;
begin
  for attempt in 1..5 loop
    p := lab.plan($q$ update wide_counter set counter = counter + 1 where id = 50 $q$);
    if (p -> 'Plan' ->> 'WAL FPI')::bigint = 0 then
      insert into wide_wal values ((p -> 'Plan' ->> 'WAL Bytes')::numeric);
      exit;
    end if;
  end loop;
end $$;
select ctid as wide_ctid from wide_counter where id = 50 \gset
select lab.prove(
  'incrementing a 4-byte counter in a 1 KB row writes a whole new 1 KB tuple',
  lp_len > 1000)
from heap_page_items(get_raw_page('wide_counter', (:'wide_ctid'::text::point)[0]::int))
where lp = (:'wide_ctid'::text::point)[1]::int;
select lab.prove(
  'but the WAL record for a same-page update logs only the changed bytes (under 100)',
  bytes < 100) from wide_wal;

\echo
\echo == Dead tuples and pruning
vacuum account_usage;
select lab.prove(
  'after vacuum, lp 1 is a redirect (lp_flags 2) to slot 6',
  lp_flags = 2 and lp_off = 6) from page0 where lp = 1;
select lab.prove(
  'lp 4 and 5 are unused (lp_flags 0), free for the next insert or update',
  count(*) = 2 and bool_and(lp_flags = 0)) from page0 where lp in (4, 5);
select lab.prove(
  'lp 6 holds the live version, compacted to offset 8048',
  lp_flags = 1 and lp_off = 8048) from page0 where lp = 6;

\echo
\echo == HOT updates skip the indexes
create index account_usage_updated_at_idx on account_usage (updated_at);
update account_usage
set events_today = events_today + 1, updated_at = now()
where account_id = 2;

select lab.prove(
  'account 1 still has one primary key entry, pointing at (0,1), after three HOT updates',
  array_agg(ctid::text) = '{"(0,1)"}')
from bt_page_items('account_usage_pkey', 1)
where data = '01 00 00 00 00 00 00 00';
select lab.prove(
  'account 2 now has two primary key entries: the update changed an indexed column, so it was not HOT',
  array_agg(ctid::text order by itemoffset) = '{"(0,2)","(0,4)"}')
from bt_page_items('account_usage_pkey', 1)
where data = '02 00 00 00 00 00 00 00';
select pg_temp.flush_stats() \g /dev/null
select lab.prove(
  'pg_stat_user_tables: n_tup_upd is 4, n_tup_hot_upd is 3',
  n_tup_upd = 4 and n_tup_hot_upd = 3)
from pg_stat_user_tables where relname = 'account_usage';

\echo
\echo == Making room for HOT with fillfactor
create table users_ff100 (like users including all) with (autovacuum_enabled = off);
create table users_ff85 (like users including all)
  with (fillfactor = 85, autovacuum_enabled = off);
insert into users_ff100 (account_id, email, name, created_at)
  select account_id, email, name, created_at from users;
insert into users_ff85 (account_id, email, name, created_at)
  select account_id, email, name, created_at from users;
vacuum analyze users_ff100, users_ff85;
update users_ff100 set name = name || '!' where id % 10 = 0;
update users_ff85 set name = name || '!' where id % 10 = 0;
select pg_temp.flush_stats() \g /dev/null

select lab.prove(
  'fillfactor 100: 0 of 10,000 updates were HOT, and the table grew from 1,126 to 1,239 pages',
  s.n_tup_upd = 10000 and s.n_tup_hot_upd = 0
  and pg_relation_size('users_ff100') / 8192 between 1200 and 1280)
from pg_stat_user_tables s where relname = 'users_ff100';
select lab.prove(
  'fillfactor 85: all 10,000 updates were HOT, and the table did not grow (1,322 pages)',
  s.n_tup_upd = 10000 and s.n_tup_hot_upd = 10000
  and pg_relation_size('users_ff85') / 8192 = 1322)
from pg_stat_user_tables s where relname = 'users_ff85';

\echo
\echo == Snapshots and visibility
-- Session A updates account 3 and leaves its transaction open.
select dblink_connect('session_a', 'dbname=' || current_database()) is not null \g /dev/null
select dblink_exec('session_a', 'begin') is not null \g /dev/null
select x as a_xid from dblink('session_a', 'select pg_current_xact_id()::text') as t(x text) \gset
select dblink_exec('session_a',
  'update account_usage set events_today = 100 where account_id = 3') is not null \g /dev/null

select lab.prove(
  'session B still sees the old version at (0,3), with A''s xid already in its xmax',
  ctid = '(0,3)' and xmax::text = :'a_xid' and events_today = 0)
from account_usage where account_id = 3;
select lab.prove(
  'both versions are on the page: lp 3 points at the new one in slot 5, whose xmin is A',
  (select t_ctid from page0 where lp = 3) = '(0,5)'
  and (select t_xmin::text from page0 where lp = 5) = :'a_xid');
select lab.prove(
  'pg_xact_status says A is in progress',
  pg_xact_status(:'a_xid'::xid8) = 'in progress');

begin isolation level read uncommitted;
select lab.prove(
  'read uncommitted behaves as read committed: it still does not see A''s uncommitted row',
  events_today = 0) from account_usage where account_id = 3;
commit;

select dblink_exec('session_a', 'commit') is not null \g /dev/null
select lab.prove(
  'after A commits, a new snapshot sees the new version at (0,5)',
  ctid = '(0,5)' and xmin::text = :'a_xid' and events_today = 100)
from account_usage where account_id = 3;

\echo
\echo == Commit status and hint bits
create table hint_demo2 (id int, v text) with (autovacuum_enabled = off);
insert into hint_demo2 select g, md5(g::text) from generate_series(1, 200000) g;
select lab.prove(
  'a freshly loaded tuple has no HEAP_XMIN_COMMITTED hint yet',
  not ('HEAP_XMIN_COMMITTED' = any(raw_flags)))
from heap_page_items(get_raw_page('hint_demo2', 100)),
     heap_tuple_infomask_flags(t_infomask, t_infomask2)
where lp = 1;
select count(*) from hint_demo2 \g /dev/null
select lab.prove(
  'after a plain count(*), the tuple carries HEAP_XMIN_COMMITTED: a read modified the page',
  'HEAP_XMIN_COMMITTED' = any(raw_flags))
from heap_page_items(get_raw_page('hint_demo2', 100)),
     heap_tuple_infomask_flags(t_infomask, t_infomask2)
where lp = 1;

\echo
\echo == A delete only stamps the row
begin;
select lab.prove('no xid before anything happens',
                 pg_current_xact_id_if_assigned() is null);
select count(*) from accounts \g /dev/null
select lab.prove('still no xid after a read: reads don''t need one',
                 pg_current_xact_id_if_assigned() is null);
insert into account_usage (account_id) values (4);
select lab.prove('the first write assigns an xid',
                 pg_current_xact_id_if_assigned() is not null);
commit;

select ctid as deleted_ctid from account_usage where account_id = 4 \gset
delete from account_usage where account_id = 4;
select lab.prove(
  'the deleted row stays on the page at full size, with an xmax and HEAP_KEYS_UPDATED',
  lp_flags = 1 and lp_len > 0 and t_xmax::text <> '0'
  and t_ctid = :'deleted_ctid'::tid and 'HEAP_KEYS_UPDATED' = any(raw_flags))
from page0 where lp = (:'deleted_ctid'::tid::text::point)[1]::int;

\echo
\echo == xmax does not always mean deleted
select lab.prove(
  'an untouched account row has xmax = the seed transaction that inserted events: a KEY SHARE lock, not a delete',
  h.t_xmax::text = (select xmin::text from events where id = 1)
  and 'HEAP_XMAX_LOCK_ONLY' = any(f.raw_flags)
  and 'HEAP_XMAX_KEYSHR_LOCK' = any(f.raw_flags))
from heap_page_items(get_raw_page('accounts', 0)) h,
     heap_tuple_infomask_flags(h.t_infomask, h.t_infomask2) f
where h.lp = 42;

\echo
\echo == TRUNCATE does not respect an older snapshot
create table imports (id int);
create table deletes_demo (id int);
insert into imports select generate_series(1, 500);
insert into deletes_demo select generate_series(1, 500);
select dblink_exec('session_a', 'begin isolation level repeatable read') is not null \g /dev/null
select n from dblink('session_a', 'select count(*) from accounts') as t(n bigint) \g /dev/null
truncate imports;
delete from deletes_demo;
select lab.prove(
  'an older REPEATABLE READ snapshot sees the truncated table as empty',
  (select n from dblink('session_a', 'select count(*) from imports') as t(n bigint)) = 0);
select lab.prove(
  'but still sees all 500 deleted rows',
  (select n from dblink('session_a', 'select count(*) from deletes_demo') as t(n bigint)) = 500);
select dblink_exec('session_a', 'commit') is not null \g /dev/null

\echo
\echo == Bloat
select lab.prove(
  'users starts at about 9 MB, 94.5% live tuples, no dead ones',
  table_len between 9000000 and 9500000 and tuple_percent > 94 and dead_tuple_count = 0)
from pgstattuple('users');
select pg_indexes_size('users') as idx_before \gset

update users set name = upper(name);
select lab.prove(
  'after updating every row: about 18 MB, 100,000 live and 100,000 dead tuples',
  table_len between 18000000 and 19000000 and tuple_count = 100000 and dead_tuple_count = 100000)
from pgstattuple('users');
select lab.prove(
  'the indexes grew from about 8 MB to about 12 MB',
  :idx_before between 8000000 and 9000000
  and pg_indexes_size('users') between 12000000 and 13500000);

select pg_temp.flush_stats() \g /dev/null
vacuum users;
select lab.prove(
  'after vacuum: no dead tuples, still about 18 MB, about half of it free space',
  dead_tuple_count = 0 and table_len between 18000000 and 19000000 and free_percent between 45 and 55)
from pgstattuple('users');

update users set name = lower(name);
select pg_temp.flush_stats() \g /dev/null
select lab.prove(
  'the next full update reuses the space: still about 18 MB, not 27',
  pg_relation_size('users') between 18000000 and 19000000);
select lab.prove(
  'only a handful of the second update''s 100,000 changes were HOT (the pages with room held no live rows)',
  n_tup_upd = 200000 and n_tup_hot_upd < 1000)
from pg_stat_user_tables where relname = 'users';

\echo
\echo == Long transactions hold everything back
-- Session A takes a repeatable-read snapshot and sits there.
select dblink_exec('session_a', 'begin isolation level repeatable read') is not null \g /dev/null
select n from dblink('session_a', 'select count(*) from accounts') as t(n bigint) \g /dev/null
select lab.prove(
  'pg_stat_activity shows session A holding a snapshot (backend_xmin)',
  count(*) = 1)
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid()
  and backend_xmin is not null and state = 'idle in transaction';

delete from users_ff100 where id % 2 = 0;
vacuum users_ff100;
select lab.prove(
  'vacuum removes nothing: the 50,000 deleted rows are still there, dead but not yet removable',
  dead_tuple_count = 50000) from pgstattuple('users_ff100');

select dblink_exec('session_a', 'commit') is not null \g /dev/null
vacuum users_ff100;
select lab.prove(
  'once A commits, the same vacuum removes them',
  dead_tuple_count = 0) from pgstattuple('users_ff100');
select lab.prove(
  'and truncates the table from 1,239 to 1,126 pages',
  pg_relation_size('users_ff100') / 8192 = 1126);

\echo
\echo == Wraparound and freezing
vacuum (freeze) account_usage;
select lab.prove(
  'after vacuum (freeze), every live tuple is HEAP_XMIN_FROZEN: committed and invalid together',
  count(*) = 3 and bool_and('HEAP_XMIN_FROZEN' = any(combined_flags))
  and bool_and('HEAP_XMIN_COMMITTED' = any(raw_flags) and 'HEAP_XMIN_INVALID' = any(raw_flags)))
from page0 where lp_flags = 1;
select lab.prove(
  'the deleted row for account 4 was removed in the same pass',
  not exists (select 1 from page0 where lp_flags = 1 and t_xmax::text <> '0'));
select lab.prove(
  'relfrozenxid jumps to the present: its age is near zero',
  age(relfrozenxid) < 1000) from pg_class where relname = 'account_usage';
select lab.prove(
  'the visibility map marks the page all-visible and all-frozen',
  all_visible and all_frozen) from pg_visibility_map('account_usage') where blkno = 0;

select lab.prove(
  'freeze defaults: 50 million, 150 million, 200 million, failsafe 1.6 billion',
  current_setting('vacuum_freeze_min_age') = '50000000'
  and current_setting('vacuum_freeze_table_age') = '150000000'
  and current_setting('autovacuum_freeze_max_age') = '200000000'
  and current_setting('vacuum_failsafe_age') = '1600000000');

\echo
\echo == Isolation levels, briefly
select lab.prove(
  'read committed is the default',
  current_setting('default_transaction_isolation') = 'read committed');

-- Repeatable read: A's snapshot can't see B's committed change, so A's
-- update of the same row fails with a serialization error.
select dblink_exec('session_a', 'begin isolation level repeatable read') is not null \g /dev/null
select n from dblink('session_a',
  'select events_today from account_usage where account_id = 3') as t(n int) \g /dev/null
update account_usage set events_today = 200 where account_id = 3;
do $$
begin
  perform dblink_exec('session_a',
    'update account_usage set events_today = 300 where account_id = 3');
  raise exception 'no error';
exception when others then
  if sqlerrm not like '%could not serialize access due to concurrent update%' then
    raise;
  end if;
end $$;
select lab.prove(
  'in repeatable read, updating a row changed since the snapshot fails with a serialization error',
  true);
select dblink_exec('session_a', 'rollback') is not null \g /dev/null

-- Read committed: A changes the row and holds it; B's update of the same row
-- waits, then re-checks the newest committed version and applies to that.
select dblink_connect('session_b', 'dbname=' || current_database()) is not null \g /dev/null
select dblink_exec('session_a', 'begin') is not null \g /dev/null
select dblink_exec('session_a',
  'update account_usage set events_today = 400 where account_id = 3') is not null \g /dev/null
select dblink_send_query('session_b',
  'update account_usage set events_today = events_today + 1 where account_id = 3') = 1 \g /dev/null
-- Give B a moment (up to 10 seconds on a busy server) to reach its lock wait.
do $$ begin
  for i in 1..100 loop
    perform pg_stat_clear_snapshot();  -- pg_stat_activity is read once per transaction
    exit when exists (select 1 from pg_stat_activity
                      where datname = current_database() and wait_event_type = 'Lock');
    perform pg_sleep(0.1);
  end loop;
end $$;
select lab.prove(
  'in read committed, B''s update of the same row waits for A',
  count(*) = 1)
from pg_stat_activity
where datname = current_database() and wait_event_type = 'Lock'
  and query like 'update account_usage set events_today = events_today + 1%';
select dblink_exec('session_a', 'commit') is not null \g /dev/null
select status from dblink_get_result('session_b') as t(status text) \g /dev/null
select lab.prove(
  'then applies itself to A''s newly committed version (400 + 1)',
  events_today = 401) from account_usage where account_id = 3;
select dblink_disconnect('session_b') is not null \g /dev/null

select dblink_disconnect('session_a') is not null \g /dev/null
