-- Lab for "Partition for the delete"
-- https://www.flagon.io/books/eight-kilobytes/partitioning
-- Run: ./lab 38-partitioning
--
-- Builds events_p, a monthly-partitioned copy of events, and checks every
-- measurable claim in the chapter against it. The seed ends at 2026-10-06 on
-- every kit; the months here are computed from the data, and they come out as
-- the chapter's literal dates: :mid_month is March 2026, :old_month is
-- November 2025, :last_month is October 2026.
-- Takes about two minutes.

\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;

-- Small helpers for this chapter.
-- rels(q): every relation the plan of q touches, in plan order.
create function rels(q text) returns text[] language sql as $$
  select array(select jsonb_array_elements_text(
           jsonb_path_query_array(lab.plan(q), 'strict $.**."Relation Name"')))
$$;
-- planning_ms(q): planning time of q, in milliseconds.
create function planning_ms(q text) returns numeric language sql as $$
  select (lab.plan(q) ->> 'Planning Time')::numeric
$$;

select date_trunc('month', min(created_at)) as first_month,
       date_trunc('month', max(created_at)) as last_month,
       date_trunc('month', min(created_at)) + interval '1 month' as old_month,
       date_trunc('month', max(created_at)) - interval '7 months' as mid_month,
       date_trunc('month', max(created_at)) - interval '6 months' as mid_end,
       date_trunc('month', max(created_at)) - interval '3 months' as join_from,
       date_trunc('month', max(created_at)) as join_to,
       max(created_at) as newest
from events \gset

select lab.prove('the seed''s months are the chapter''s: Oct 2025 to Oct 2026, March 2026 in the middle',
  :'first_month'::timestamptz = '2025-10-01' and :'old_month'::timestamptz = '2025-11-01'
  and :'mid_month'::timestamptz = '2026-03-01' and :'last_month'::timestamptz = '2026-10-01');

\echo
\echo == Range partitioning events by month

create table events_p (
  id          bigint generated always as identity,
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

-- One partition per month of data, plus one empty month ahead.
select format('create table events_p_%s partition of events_p for values from (%L) to (%L)',
              to_char(m, 'YYYY_MM'), m, m + interval '1 month')
from generate_series(:'first_month'::timestamptz,
                     :'last_month'::timestamptz + interval '1 month',
                     interval '1 month') as m
\gexec

insert into events_p (id, account_id, project_id, user_id, kind, payload, created_at)
overriding system value
select id, account_id, project_id, user_id, kind, payload, created_at from events order by id;
select setval(pg_get_serial_sequence('events_p', 'id'), (select max(id) from events_p)) \g /dev/null
vacuum analyze events_p;

select count(*) as nparts from pg_inherits where inhparent = 'events_p'::regclass \gset

select lab.prove('every row lands in exactly one partition, and the copy keeps all 2,000,000',
  (select count(*) from events_p) = 2000000
  and (select count(*) from only events_p) = 0);

select lab.prove('the parent holds no rows: it has no heap at all',
  pg_relation_size('events_p') = 0
  and (select relkind from pg_class where oid = 'events_p'::regclass) = 'p');

select lab.prove('a full month is about 3,000 pages; the unpartitioned events is about 35,000',
  (select max(pg_relation_size(inhrelid)) / 8192 from pg_inherits
   where inhparent = 'events_p'::regclass) between 2800 and 3100
  and pg_relation_size('events') / 8192 between 34000 and 36500);

\echo
\echo == List partitioning

create table audit_log (
  region  text not null,
  id      bigint generated always as identity,
  body    text,
  primary key (region, id)
) partition by list (region);
create table audit_log_us partition of audit_log for values in ('iad', 'sfo');
create table audit_log_eu partition of audit_log for values in ('fra', 'ams');

select lab.prove('a row whose key matches no partition is rejected (23514)',
  lab.try($$ insert into audit_log (region, body) values ('syd', 'x') $$)
    = '23514: no partition of relation "audit_log" found for row');

\echo
\echo == Hash partitioning

create table sessions_h (
  user_id  bigint not null,
  token    text not null,
  primary key (user_id, token)
) partition by hash (user_id);
select format('create table sessions_h_%s partition of sessions_h for values with (modulus 4, remainder %s)', r, r)
from generate_series(0, 3) r
\gexec
insert into sessions_h select u.id, md5(u.id || ':' || g) from users u, generate_series(1, 4) g;
analyze sessions_h;

select lab.prove('400,000 rows spread over 4 hash buckets within 1% of 100,000 each',
  (select bool_and(n between 99000 and 101000) and sum(n) = 400000
   from (select count(*) as n from sessions_h group by tableoid) b));

select lab.prove('an equality lookup on the hash key touches exactly one bucket',
  cardinality(rels('select * from sessions_h where user_id = 42')) = 1);

\echo
\echo == Pruning at plan time

\set q_mid_p 'select count(*) from events_p where created_at >= ' :'mid_month' ' and created_at < ' :'mid_end'
\set q_mid   'select count(*) from events where created_at >= ' :'mid_month' ' and created_at < ' :'mid_end'

select lab.prove('one month on events_p: only that partition appears in the plan',
  (select count(distinct r) from unnest(rels(:'q_mid_p')) r) = 1);

select lab.prove('one month reads about 3,000 pages on events_p and all ~35,000 on events',
  lab.buffers(:'q_mid_p') < 3100 and lab.buffers(:'q_mid') > 34000);

\echo
\echo == A BRIN index gets most of the way without partitioning

create index events_created_brin on events using brin (created_at);
select lab.prove('the BRIN index on events.created_at is about 24 kB',
  pg_relation_size('events_created_brin') between 16384 and 40960);
select lab.prove('with BRIN, the unpartitioned month read is within 15% of the pruned partition read',
  lab.buffers(:'q_mid') < 1.15 * lab.buffers(:'q_mid_p'));
drop index events_created_brin;

\echo
\echo == Pruning at run time

select lab.prove('a filter on now() prunes when execution starts: Subplans Removed > 0',
  (lab.plan($$ select count(*) from events_p where created_at >= now() - interval '7 days' $$)
     @? '$.** ? (@."Subplans Removed" > 0)'));

set plan_cache_mode = force_generic_plan;
prepare recent(timestamptz) as select count(*) from events_p where created_at >= $1;
select lab.prove('a generic prepared plan prunes at run time too',
  lab.plan(format('execute recent(%L)', :'newest'::timestamptz - interval '8 days'))
    @? '$.** ? (@."Subplans Removed" > 0)');
reset plan_cache_mode;
deallocate recent;

\echo
\echo '== When pruning can''t happen'

select lab.prove('date_trunc() on the key: every partition is scanned',
  (select count(distinct r) from unnest(rels(format(
     $$ select count(*) from events_p where date_trunc('day', created_at) = %L $$,
     :'mid_month'::timestamptz + interval '14 days'))) r) = :nparts);

select lab.prove('the same day as a half-open range: one partition',
  (select count(distinct r) from unnest(rels(format(
     $$ select count(*) from events_p where created_at >= %L and created_at < %L $$,
     :'mid_month'::timestamptz + interval '14 days',
     :'mid_month'::timestamptz + interval '15 days'))) r) = 1);

\echo
\echo == Queries without the key pay once per partition

create index on events (account_id, created_at);
create index on events_p (account_id, created_at);
analyze events, events_p;

select lab.prove('a lookup by id alone: one index scan per partition on events_p',
  (select count(distinct r) from unnest(rels('select * from events_p where id = 1234567')) r) = :nparts);

select lab.prove('a lookup by id: about 7 pages on events, several times that on events_p',
  lab.buffers('select * from events where id = 1234567') <= 10
  and lab.buffers('select * from events_p where id = 1234567') > 3 * lab.buffers('select * from events where id = 1234567'));

select lab.prove('counting one account''s events: about 13 pages on events, several times that on events_p',
  lab.buffers('select count(*) from events where account_id = 42') < 25
  and lab.buffers('select count(*) from events_p where account_id = 42')
      > 3 * lab.buffers('select count(*) from events where account_id = 42'));

select lab.prove('the id lookup plans several times slower on events_p (median of 15)',
  (select percentile_cont(0.5) within group (order by planning_ms('select * from events_p where id = 1234567'))
   from generate_series(1, 15))
  > 3 * (select percentile_cont(0.5) within group (order by planning_ms('select * from events where id = 1234567'))
         from generate_series(1, 15)));

\echo
\echo == Ordered partitions stop early

\set q_latest_p 'select * from events_p where account_id = 42 order by created_at desc limit 20'
\set q_latest   'select * from events where account_id = 42 order by created_at desc limit 20'

select lab.prove('latest 20 for an account: an ordered Append, no Merge Append, no Sort',
  lab.nodes(:'q_latest_p') @> array['Limit', 'Append', 'Index Scan']
  and not lab.nodes(:'q_latest_p') && array['Merge Append', 'Sort']);

select lab.prove('older partitions are never executed',
  jsonb_array_length(jsonb_path_query_array(lab.plan(:'q_latest_p'),
    'strict $.** ? (@."Actual Loops" == 0)')) >= :nparts - 4);

select lab.prove('execution reads about as many pages as the unpartitioned table (both under 40)',
  lab.buffers(:'q_latest_p') < 40 and lab.buffers(:'q_latest') < 40);

\echo
\echo == Partition-wise joins

create table deliveries_p (
  event_id          bigint not null,
  event_created_at  timestamptz not null,
  attempt           int not null,
  status            int not null,
  primary key (event_id, event_created_at, attempt)
) partition by range (event_created_at);
select format('create table deliveries_p_%s partition of deliveries_p for values from (%L) to (%L)',
              to_char(m, 'YYYY_MM'), m, m + interval '1 month')
from generate_series(:'first_month'::timestamptz,
                     :'last_month'::timestamptz + interval '1 month',
                     interval '1 month') as m
\gexec

-- Loading first and adding the foreign key after is much faster than checking
-- it row by row; the result is the same table as in the chapter.
insert into deliveries_p
select id, created_at, 1, case when id % 10 = 0 then 500 else 200 end
from events_p where kind = 'deploy';
alter table deliveries_p add foreign key (event_id, event_created_at) references events_p (id, created_at);
vacuum analyze deliveries_p;

select lab.prove('one delivery per deploy event: about 500,000 rows, about 50,000 failed',
  (select count(*) from deliveries_p) between 490000 and 510000
  and (select count(*) from deliveries_p where status = 500) between 49000 and 51000);

\set q_join 'select e.project_id, count(*) from events_p e join deliveries_p d on d.event_id = e.id and d.event_created_at = e.created_at where e.created_at >= ' :'join_from' ' and e.created_at < ' :'join_to' ' and d.status = 500 group by e.project_id'

select lab.prove('default: the events side prunes to 3 months, the deliveries side scans every partition',
  (select count(distinct r) filter (where r like 'events_p%') from unnest(rels(:'q_join')) r) = 3
  and (select count(distinct r) filter (where r like 'deliveries_p%') from unnest(rels(:'q_join')) r) = :nparts);

select lab.prove('default: one join over two Appends',
  (select count(*) from unnest(lab.nodes(:'q_join')) n where n like '%Join' or n = 'Nested Loop') = 1);

set enable_partitionwise_join = on;

select lab.prove('partition-wise: three per-month joins under one Append',
  (select count(*) from unnest(lab.nodes(:'q_join')) n where n like '%Join' or n = 'Nested Loop') = 3);

select lab.prove('partition-wise: only the 3 matching deliveries partitions are read',
  (select count(distinct r) filter (where r like 'deliveries_p%') from unnest(rels(:'q_join')) r) = 3);

reset enable_partitionwise_join;

\echo
\echo == Partition-wise aggregates

set enable_partitionwise_aggregate = on;

select lab.prove('grouping by the key: a whole aggregate per partition under an Append',
  (lab.nodes('select created_at, count(*) from events_p group by 1'))[1] = 'Append'
  and (select count(*) from unnest(lab.nodes('select created_at, count(*) from events_p group by 1')) n
       where n = 'Aggregate') = :nparts);

select lab.prove('grouping by another column: a partial aggregate per partition, one final combine',
  (select count(*) from jsonb_path_query(
     lab.plan('select kind, count(*) from events_p group by kind'),
     'strict $.** ? (@."Partial Mode" == "Partial")')) = :nparts
  and lab.plan('select kind, count(*) from events_p group by kind') @? '$.** ? (@."Partial Mode" == "Finalize")');

select lab.prove('grouping by date_trunc() of the key: one ordinary aggregate over the Append',
  (select count(*) from unnest(lab.nodes(
     $$ select date_trunc('month', created_at), count(*) from events_p group by 1 $$)) n
   where n = 'Aggregate') = 1);

reset enable_partitionwise_aggregate;

\echo
\echo == Unique constraints must include the key

select lab.prove('a unique index on id alone is rejected: it lacks the partition key',
  lab.try('create unique index on events_p (id)')
    = '0A000: unique constraint on partitioned table must include all partitioning columns');

select lab.prove('a foreign key to events_p (id) alone is rejected (42830)',
  lab.try($$ create table event_comments (
                id bigint generated always as identity primary key,
                event_id bigint not null references events_p (id),
                body text not null) $$)
    = '42830: there is no unique constraint matching given keys for referenced table "events_p"');

insert into events_p (id, account_id, project_id, kind, created_at)
overriding system value
values (1234567, 1, 1, 'deploy', :'newest'::timestamptz - interval '1 day');

select lab.prove('the same id can exist twice, in different partitions',
  (select count(*) = 2 and count(distinct tableoid) = 2 from events_p where id = 1234567));

delete from events_p where id = 1234567 and created_at = :'newest'::timestamptz - interval '1 day';

\echo
\echo == Building indexes without blocking writes

create index events_p_kind_idx on only events_p (kind);
select lab.prove('an index created ON ONLY the parent starts out invalid',
  not (select indisvalid from pg_index where indexrelid = 'events_p_kind_idx'::regclass));

select format('create index concurrently %I on %s (kind)', c.relname || '_kind_idx', c.oid::regclass),
       format('alter index events_p_kind_idx attach partition %I', c.relname || '_kind_idx')
from pg_inherits i join pg_class c on c.oid = i.inhrelid
where i.inhparent = 'events_p'::regclass
order by c.relname
\gexec

select lab.prove('after every partition''s index is attached, the parent index is valid',
  (select indisvalid from pg_index where indexrelid = 'events_p_kind_idx'::regclass));

\echo
\echo == Avoid the default partition

create table events_p_default partition of events_p default;
insert into events_p (account_id, project_id, kind, created_at)
values (1, 1, 'deploy', :'last_month'::timestamptz + interval '2 months 14 days');

select lab.prove('with a stray row in the default, creating its month fails (23514)',
  lab.try(format('create table events_p_future partition of events_p for values from (%L) to (%L)',
                  :'last_month'::timestamptz + interval '2 months',
                  :'last_month'::timestamptz + interval '3 months'))
    like '23514: updated partition constraint for default partition "events_p_default" would be violated%');

select lab.prove('a default partition blocks DETACH ... CONCURRENTLY',
  -- DETACH CONCURRENTLY can't run in a transaction block, so it goes
  -- through a second connection (dblink) as a top-level statement.
  lab.try(format('select dblink_exec(%L, %L)', 'dbname=' || current_database(),
                  format('alter table events_p detach partition %I concurrently',
                         'events_p_' || to_char(:'first_month'::timestamptz, 'YYYY_MM'))))
    = '55000: cannot detach partitions concurrently when a default partition exists');

select lab.prove('with a foreign key pointing at events_p, the default can''t simply be dropped (2BP01)',
  lab.try('drop table events_p_default') like '2BP01: cannot drop table events_p_default because other objects depend on it');

delete from events_p_default;
alter table events_p detach partition events_p_default;
drop table events_p_default;

\echo
\echo == Updates that change the key move the row

-- A login event (nothing references it), moved forward a month by one
-- session while another waits to lock it.
select id as mover from events_p where kind = 'login' and id > 1000000 order by id limit 1 \gset
select dblink_connect('other', 'dbname=' || current_database()) \g /dev/null
begin;
update events_p set created_at = created_at + interval '1 month' where id = :mover;
select dblink_send_query('other', 'select id from events_p where id = ' || :mover || ' for update') \g /dev/null
select pg_sleep(0.5) \g /dev/null
commit;
select pg_sleep(0.2) \g /dev/null
select count(*) from dblink_get_result('other', false) as t(id bigint) \g /dev/null
select lab.prove('a session waiting to lock a row that moved partitions gets an error instead of following it',
  dblink_error_message('other') like '%already moved to another partition%');
select dblink_disconnect('other') \g /dev/null

\echo
\echo == Retention: detach, then drop

\set old_events 'events_p_' `echo`
select 'events_p_' || to_char(:'old_month'::timestamptz, 'YYYY_MM') as old_events,
       'deliveries_p_' || to_char(:'old_month'::timestamptz, 'YYYY_MM') as old_deliveries \gset

select lab.prove('the old month holds about 164,000 rows',
  (select count(*) from events where created_at >= :'old_month'::timestamptz
                                 and created_at < :'old_month'::timestamptz + interval '1 month')
    between 150000 and 175000);

select lab.prove('foreign keys set the order: the events partition can''t go before its deliveries (23503)',
  lab.try(format('alter table events_p detach partition %I', :'old_events')) like '23503: removing partition%violates foreign key constraint%');

-- The delete, on the unpartitioned table, and the vacuum it leaves behind.
select lab.wal_bytes(format($$ delete from events where created_at >= %L and created_at < %L $$,
                            :'old_month'::timestamptz, :'old_month'::timestamptz + interval '1 month')) as delete_wal \gset
vacuum events;

-- The partitioned way: children first, then the month itself.
alter table deliveries_p detach partition :old_deliveries concurrently;
drop table :old_deliveries;
alter table events_p detach partition :old_events concurrently;
drop table :old_events;

select coalesce(sum(wal_bytes) filter (where query ~ '^vacuum events$'), 0) as vacuum_wal,
       coalesce(sum(wal_bytes) filter (where query ~ ('^(alter table events_p detach partition|drop table) ' || :'old_events')), 0) as drop_wal
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database()) \gset

\echo '   WAL: delete' :delete_wal 'bytes, its vacuum' :vacuum_wal 'bytes, detach + drop' :drop_wal 'bytes'

select lab.prove('deleting a month writes about 32 MB of WAL',
  :delete_wal between 25e6 and 40e6);
select lab.prove('the vacuum after it writes about 12 MB more',
  :vacuum_wal between 8e6 and 18e6);
select lab.prove('detach + drop writes over 100 times less WAL than delete + vacuum',
  :drop_wal > 0 and (:delete_wal + :vacuum_wal) > 100 * :drop_wal);

\echo
\echo == Convert a live table without downtime

create table events_copy (like events including defaults including identity including constraints);
insert into events_copy overriding system value select * from events;
alter table events_copy add primary key (id);
create index on events_copy (account_id, created_at);
select date_trunc('month', :'newest'::timestamptz) + interval '1 month' as bound \gset

-- Step 1: the matching unique index, built online.
create unique index concurrently events_copy_id_created_at_key on events_copy (id, created_at);

-- A naive attach trips on the identity column, then on the old primary key.
select lab.prove('attaching a table with an identity column fails',
  lab.try(format($$
    alter table events_copy rename to events_copy_old;
    create table events_copy (like events_copy_old including defaults) partition by range (created_at);
    alter table events_copy attach partition events_copy_old for values from (minvalue) to (%L) $$, :'bound'))
  like '%being attached contains an identity column "id"');

select lab.prove('keeping the old primary key on (id) next to a new one fails (42P16)',
  lab.try($$ alter table events_copy add constraint p2 primary key using index events_copy_id_created_at_key $$)
    = '42P16: multiple primary keys for table "events_copy" are not allowed');

-- The swap WITHOUT the check constraint, rolled back: attach scans every row.
begin;
alter table events_copy rename to events_copy_old;
alter table events_copy_old drop constraint events_copy_pkey;
alter table events_copy_old add constraint events_copy_old_pkey primary key using index events_copy_id_created_at_key;
alter table events_copy_old alter column id drop identity;
create table events_copy (
  id bigint generated always as identity, account_id bigint not null, project_id bigint not null,
  user_id bigint, kind text not null, payload jsonb not null default '{}',
  created_at timestamptz not null default now(), primary key (id, created_at)
) partition by range (created_at);
select seq_scan as scans_before, clock_timestamp() as t0 from pg_stat_xact_user_tables where relid = 'events_copy_old'::regclass \gset
alter table events_copy attach partition events_copy_old for values from (minvalue) to (:'bound');
select seq_scan - :scans_before as scan_nocheck, extract(epoch from clock_timestamp() - :'t0'::timestamptz) * 1000 as ms_nocheck
from pg_stat_xact_user_tables where relid = 'events_copy_old'::regclass \gset
rollback;

-- Step 1, continued: the check constraint, added NOT VALID and validated online.
alter table events_copy add constraint events_copy_old_range check (created_at < :'bound') not valid;
alter table events_copy validate constraint events_copy_old_range;

-- Step 2: the swap, in one short transaction.
begin;
set local lock_timeout = '2s';
alter table events_copy rename to events_copy_old;
alter table events_copy_old drop constraint events_copy_pkey;
alter table events_copy_old add constraint events_copy_old_pkey primary key using index events_copy_id_created_at_key;
alter table events_copy_old alter column id drop identity;
create table events_copy (
  id          bigint generated always as identity,
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
select seq_scan as scans_before, clock_timestamp() as t0 from pg_stat_xact_user_tables where relid = 'events_copy_old'::regclass \gset
alter table events_copy attach partition events_copy_old for values from (minvalue) to (:'bound');
select seq_scan - :scans_before as scan_check, extract(epoch from clock_timestamp() - :'t0'::timestamptz) * 1000 as ms_check
from pg_stat_xact_user_tables where relid = 'events_copy_old'::regclass \gset
select format('create table events_copy_next partition of events_copy for values from (%L) to (%L)',
              :'bound', :'bound'::timestamptz + interval '1 month') \gexec
select setval(pg_get_serial_sequence('events_copy', 'id'), (select max(id) from events_copy_old)) \g /dev/null
commit;

\echo '   attach without the check:' :ms_nocheck 'ms; with it:' :ms_check 'ms'

select lab.prove('without the check constraint, attach scans the whole table',
  :scan_nocheck = 1);
select lab.prove('with a validated check constraint, attach skips the scan',
  :scan_check = 0);
select lab.prove('and is at least 5 times faster',
  :ms_check * 5 < :ms_nocheck);

insert into events_copy (account_id, project_id, kind, created_at)
values (1, 1, 'deploy', :'newest'), (1, 1, 'deploy', :'bound'::timestamptz + interval '14 days');
select lab.prove('new rows route by date and ids continue from the old sequence',
  (select array_agg(tableoid::regclass::text order by id) = array['events_copy_old', 'events_copy_next']
          and min(id) = 2000001
   from events_copy where id > 2000000));

\echo
\echo == Too many partitions

select format('create table pt_%s (id bigint not null, account_id bigint not null, created_at date not null, primary key (id, created_at)) partition by range (created_at)', n),
       format('create index on pt_%s (account_id)', n)
from unnest(array[12, 365, 1000]) n
\gexec
select format('create table pt_%s_%s partition of pt_%s for values from (%L) to (%L)',
              n, i, n, date '2020-01-01' + i, date '2020-01-01' + i + 1)
from unnest(array[12, 365, 1000]) n, generate_series(0, n - 1) i
\gexec

create temp table planning as
select n,
       percentile_cont(0.5) within group (order by planning_ms(format(
          'select count(*) from pt_%s where created_at = %L and account_id = 42', n, date '2020-01-05'))) as with_key,
       percentile_cont(0.5) within group (order by planning_ms(format(
          'select count(*) from pt_%s where account_id = 42', n))) as without_key
from unnest(array[12, 365, 1000]) n, generate_series(1, 15) run
group by n;

\pset tuples_only off
select n as partitions, round(with_key::numeric, 3) as "with key, ms", round(without_key::numeric, 3) as "without key, ms"
from planning order by n;
\pset tuples_only on

select lab.prove('without the key, planning grows with the partition count (1,000 is over 20 times 12)',
  (select without_key from planning where n = 1000) > 20 * (select without_key from planning where n = 12)
  and (select without_key from planning where n = 365) > 5 * (select without_key from planning where n = 12));

select lab.prove('with the key, pruning keeps 1,000 partitions planning over 20 times faster than without it',
  (select with_key * 20 < without_key from planning where n = 1000));

begin;
select count(*) from pt_12 where account_id = 42 \g /dev/null
select lab.prove('12 partitions: every lock fits in the fast path',
  (select count(*) filter (where not fastpath) = 0 from pg_locks
   where pid = pg_backend_pid() and mode = 'AccessShareLock'));
commit;

begin;
select count(*) from pt_365 where account_id = 42 \g /dev/null
select lab.prove('365 partitions: 64 fast-path locks, over 1,000 in the shared lock table',
  (select count(*) filter (where fastpath) <= 64
          and count(*) filter (where not fastpath) > 1000
   from pg_locks where pid = pg_backend_pid() and mode = 'AccessShareLock'));
commit;

begin;
select count(*) from pt_1000 where account_id = 42 \g /dev/null
select lab.prove('1,000 partitions: almost 3,000 locks in the shared lock table',
  (select count(*) filter (where not fastpath) between 2800 and 3000
   from pg_locks where pid = pg_backend_pid() and mode = 'AccessShareLock'));
commit;
