-- Lab for "The B-tree does the heavy lifting"
-- https://www.flagon.io/books/eight-kilobytes/btree
-- Run: ./lab 16-btree
--
-- Every page count in the chapter, checked against a fresh copy of the
-- sample data. Queries run twice where it matters: the first run warms the
-- cache and the metapage, the second is the one we count.
-- The sample data ends at midnight on 2026-10-06, so "the last 30 days" is
-- written as a fixed date: created_at >= '2026-09-06'.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 2;

\echo
\echo == The dashboard query, before any index

select lab.prove('events is 275 MB, 35,173 pages',
  pg_size_pretty(pg_relation_size('events')) = '275 MB'
  and (select relpages from pg_class where relname = 'events') = 35173);

select lab.prove('with no index, the dashboard query reads the whole table (about 35,249 pages)',
  lab.buffers($$ select * from events where project_id = 4242
                  order by created_at desc limit 20 $$) between 35173 and 35400);

select lab.prove('and it plans a parallel sequential scan under a Gather Merge',
  (select lab.field(p, 'Seq Scan', 'Parallel Aware')::boolean
          and lab.field(p, 'Gather Merge', 'Workers Planned')::int = 2
   from lab.plan($$ select * from events where project_id = 4242
                    order by created_at desc limit 20 $$) p));

\echo
\echo == A B-tree is a shallow tree of pages

select lab.prove('the primary key root is block 412 at level 2 (three levels)',
  (select root = 412 and level = 2 and allequalimage from bt_metap('events_pkey')));

select lab.prove('one root page with 19 children',
  (select count(*) = 1 and min(live_items) = 19
   from bt_multi_page_stats('events_pkey', 1, -1) where type = 'r'));

select lab.prove('19 internal pages averaging about 289 items',
  (select count(*) = 19 and round(avg(live_items)) between 280 and 295
   from bt_multi_page_stats('events_pkey', 1, -1) where type = 'i'));

select lab.prove('5,465 leaves holding about 367 entries of 16 bytes',
  (select count(*) = 5465 and round(avg(live_items)) = 367 and round(avg(avg_item_size)) = 16
   from bt_multi_page_stats('events_pkey', 1, -1) where type = 'l'));

select lab.prove('leaves times entries per leaf is about two million rows',
  5465 * 366 between 1990000 and 2010000);

select lab.prove('item 1 of the first leaf is the high key, 367 (0x16f)',
  (select data = '6f 01 00 00 00 00 00 00' from bt_page_items('events_pkey', 1) where itemoffset = 1));

select lab.prove('id 1 lives at heap page 0, item 1; id 2 at page 0, item 2',
  (select ctid = '(0,1)' from bt_page_items('events_pkey', 1) where itemoffset = 2)
  and (select ctid = '(0,2)' from bt_page_items('events_pkey', 1) where itemoffset = 3));

select lab.prove('the next leaf starts at id 367',
  (select data = '6f 01 00 00 00 00 00 00' from bt_page_items('events_pkey', 2) where itemoffset = 2));

\echo
\echo == A lookup costs three or four pages

select lab.prove('a primary key lookup reads 4 pages: root, internal, leaf, heap',
  lab.warm_buffers($$ select * from events where id = 1234567 $$) = 4);

select lab.prove('Index Searches is 1 for a simple equality',
  lab.field(lab.plan($$ select * from events where id = 1234567 $$),
                'Index Scan', 'Index Searches')::int = 1);

\echo
\echo == The first index: 35,249 pages to 91

create index events_project_id_idx on events (project_id);

select lab.prove('the index on project_id is 14 MB',
  pg_size_pretty(pg_relation_size('events_project_id_idx')) = '14 MB');

select lab.prove('the dashboard query now reads about 91 pages',
  lab.warm_buffers($$ select * from events where project_id = 4242
                  order by created_at desc limit 20 $$) between 85 and 100);

select lab.prove('it finds the 85 rows with a bitmap scan, then sorts them',
  lab.nodes($$ select * from events where project_id = 4242
               order by created_at desc limit 20 $$)
  = array['Limit', 'Sort', 'Bitmap Heap Scan', 'Bitmap Index Scan']);

select lab.prove('3 index pages and 85 heap pages, one per row',
  (select lab.field(p, 'Bitmap Index Scan', 'Shared Hit Blocks')::int
        + coalesce(lab.field(p, 'Bitmap Index Scan', 'Shared Read Blocks')::int, 0) = 3
      and lab.field(p, 'Bitmap Heap Scan', 'Exact Heap Blocks')::int = 85
      and lab.field(p, 'Bitmap Heap Scan', 'Actual Rows')::numeric = 85
   from lab.plan($$ select * from events where project_id = 4242 $$) p));

select lab.prove('all of the project''s rows, unsorted, cost 88 pages',
  lab.warm_buffers($$ select * from events where project_id = 4242 $$) = 88);

\echo
\echo == Three ways to read an index

select lab.prove('40,000 rows (2%) from a range of projects use a bitmap scan',
  'Bitmap Heap Scan' = any(lab.nodes($$ select * from events where project_id between 4000 and 4400 $$)));

select lab.prove('the index part costs under 50 pages, the heap part about 23,913 pages (68% of the table)',
  (select lab.field(p, 'Bitmap Index Scan', 'Shared Hit Blocks')::int
        + lab.field(p, 'Bitmap Index Scan', 'Shared Read Blocks')::int < 50
      and lab.field(p, 'Bitmap Heap Scan', 'Exact Heap Blocks')::int between 23500 and 24300
      and lab.field(p, 'Bitmap Heap Scan', 'Actual Rows')::numeric between 39000 and 41000
   from lab.plan($$ select * from events where project_id between 4000 and 4400 $$) p));

select lab.prove('count(*) for the project is an Index Only Scan with 0 heap fetches',
  (select lab.field(p, 'Index Only Scan', 'Heap Fetches')::int = 0
   from lab.plan($$ select count(*) from events where project_id = 4242 $$) p));

select lab.prove('and reads 5 pages instead of 88',
  lab.warm_buffers($$ select count(*) from events where project_id = 4242 $$) <= 6);

\echo
\echo == Multicolumn indexes: order is the design

create index events_project_created_idx on events (project_id, created_at);

select lab.prove('with (project_id, created_at), the dashboard reads about 23 pages',
  lab.warm_buffers($$ select * from events where project_id = 4242
                  order by created_at desc limit 20 $$) between 20 and 30);

select lab.prove('no Sort node: an Index Scan Backward feeds the Limit',
  (select lab.nodes($$ select * from events where project_id = 4242
                       order by created_at desc limit 20 $$) = array['Limit', 'Index Scan'])
  and (select lab.field(p, 'Index Scan', 'Scan Direction') = 'Backward'
       from lab.plan($$ select * from events where project_id = 4242
                        order by created_at desc limit 20 $$) p));

select lab.prove('35,249 pages to 23 is more than 1,000 times less work',
  35249.0 / lab.warm_buffers($$ select * from events where project_id = 4242
                            order by created_at desc limit 20 $$) > 1000);

select lab.prove('a mixed-direction sort uses an Incremental Sort presorted on project_id',
  'Incremental Sort' = any(lab.nodes($$ select * from events
                                        order by project_id, created_at desc limit 10 $$)));

create index events_created_project_idx on events (created_at, project_id);

-- Leave only the wrong-order index, so the planner has to use it.
begin;
drop index events_project_created_idx;
drop index events_project_id_idx;
select lab.prove('with (created_at, project_id), "this project, last 30 days" reads about 643 pages',
  lab.warm_buffers($$ select * from events where project_id = 4242
                  and created_at >= '2026-09-06' $$) between 500 and 800);
select lab.prove('and the dashboard query reads about 1,399 pages walking the time range backward',
  lab.warm_buffers($$ select * from events where project_id = 4242
                  order by created_at desc limit 20 $$) between 1200 and 1600);
rollback;

select lab.prove('with (project_id, created_at), the same 30-day query reads about 14 pages',
  lab.warm_buffers($$ select * from events where project_id = 4242
                  and created_at >= '2026-09-06' $$) between 10 and 20);

select lab.prove('and the planner prefers it when both exist',
  (select lab.field(p, 'Index Scan', 'Index Name') = 'events_project_created_idx'
   from lab.plan($$ select * from events where project_id = 4242
                    and created_at >= '2026-09-06' $$) p));

select lab.prove('the last 30 days hold about 164,000 events',
  (select count(*) from events where created_at >= '2026-09-06') between 150000 and 170000);

drop index events_created_project_idx;

\echo
\echo == Skip scan (PostgreSQL 18+)

create index events_kind_created_idx on events (kind, created_at);

select lab.prove('a query on created_at alone uses the (kind, created_at) index',
  (select lab.field(p, 'Index Only Scan', 'Index Name') = 'events_kind_created_idx'
   from lab.plan($$ select count(*) from events where created_at >= '2026-10-05' $$) p));

select lab.prove('with 6 index searches for the 5 kinds',
  (select lab.field(p, 'Index Only Scan', 'Index Searches')::int = 6
   from lab.plan($$ select count(*) from events where created_at >= '2026-10-05' $$) p));

select lab.prove('reading about 44 pages',
  lab.warm_buffers($$ select count(*) from events where created_at >= '2026-10-05' $$) < 60);

begin;
set local enable_indexscan = off;
set local enable_indexonlyscan = off;
set local enable_bitmapscan = off;
select lab.prove('against 35,173 or more for a sequential scan',
  lab.buffers($$ select count(*) from events where created_at >= '2026-10-05' $$) >= 35173);
rollback;

select lab.prove('a lookup by email alone does not skip-scan users (account_id, email): 1,000 accounts is too many',
  'Seq Scan' = any(lab.nodes($$ select id from users where email = 'user4242@example.com' $$)));

drop index events_kind_created_idx;

\echo
\echo == Covering indexes with INCLUDE

select lab.prove('created_at and kind for 50 rows: about 53 pages with (project_id, created_at)',
  lab.warm_buffers($$ select created_at, kind from events where project_id = 4242
                  order by created_at desc limit 50 $$) between 50 and 58);

create temp table sizes as
  select 'before'::text as k, pg_relation_size('events_project_created_idx') as bytes;

drop index events_project_created_idx;
create index events_project_created_idx
  on events (project_id, created_at) include (kind);

insert into sizes select 'after', pg_relation_size('events_project_created_idx');

select lab.prove('with include (kind), it is an Index Only Scan reading 6 pages',
  'Index Only Scan' = any(lab.nodes($$ select created_at, kind from events where project_id = 4242
                                       order by created_at desc limit 50 $$))
  and lab.warm_buffers($$ select created_at, kind from events where project_id = 4242
                      order by created_at desc limit 50 $$) <= 7);

select lab.prove('the index grew from 60 MB to 77 MB',
  (select pg_size_pretty(bytes) = '60 MB' from sizes where k = 'before')
  and (select pg_size_pretty(bytes) = '77 MB' from sizes where k = 'after'));

select lab.prove('INCLUDE indexes never deduplicate (allequalimage is false)',
  (select not allequalimage from bt_metap('events_project_created_idx')));

\echo
\echo == Index-only scans and the visibility map

update events set payload = payload || '{"seen": true}' where project_id = 4242;

create temp table ios as
  select lab.plan($$ select created_at, kind from events where project_id = 4242
                     order by created_at desc limit 50 $$) as p;

select lab.prove('after updating the project''s 85 rows, the first index-only scan fetches heap tuples (about 99)',
  (select lab.field(p, 'Index Only Scan', 'Heap Fetches')::int between 50 and 120 from ios));

select lab.prove('and reads about 180 pages',
  (select (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int
   between 120 and 220 from ios));

vacuum events;

-- On a quiet server one vacuum is enough. If another session holds an old
-- snapshot, vacuum can't mark the pages all-visible yet, so retry for a while
-- (dblink runs VACUUM, which can't run inside this DO block's transaction).
create extension if not exists dblink;
do $$
begin
  for i in 1..60 loop
    exit when lab.field(lab.plan($q$ select created_at, kind from events where project_id = 4242
                                         order by created_at desc limit 50 $q$),
                            'Index Only Scan', 'Heap Fetches')::int = 0;
    perform pg_sleep(1);
    perform dblink_exec('dbname=' || current_database(), 'vacuum events');
  end loop;
end $$;

select lab.prove('after vacuum, Heap Fetches is 0',
  (select lab.field(p, 'Index Only Scan', 'Heap Fetches')::int = 0
   from lab.plan($$ select created_at, kind from events where project_id = 4242
                    order by created_at desc limit 50 $$) p));

select lab.prove('and the same plan reads 5 pages',
  lab.warm_buffers($$ select created_at, kind from events where project_id = 4242
                  order by created_at desc limit 50 $$) <= 6);

\echo
\echo == Partial indexes

select lab.prove('failed deploys are about 6% of events',
  (select avg((kind = 'deploy' and payload->>'status' = 'failed')::int) between 0.055 and 0.07 from events));

select lab.prove('without an index, the on-call query reads the whole table (about 35,251 pages)',
  lab.buffers($$ select id, project_id, created_at from events
                  where kind = 'deploy' and payload->>'status' = 'failed'
                  order by created_at desc limit 20 $$) >= 35173);

create index events_failed_deploys_idx on events (created_at)
  where kind = 'deploy' and payload->>'status' = 'failed';

select lab.prove('with the partial index, it reads about 11 pages',
  lab.warm_buffers($$ select id, project_id, created_at from events
                  where kind = 'deploy' and payload->>'status' = 'failed'
                  order by created_at desc limit 20 $$) <= 15);

create index events_created_at_idx on events (created_at);

select lab.prove('(created_at) on all rows is 43 MB; the partial one 2,768 kB',
  pg_size_pretty(pg_relation_size('events_created_at_idx')) = '43 MB'
  and pg_size_pretty(pg_relation_size('events_failed_deploys_idx')) = '2768 kB');

select lab.prove('the partial index is about sixteen times smaller',
  pg_relation_size('events_created_at_idx')::numeric
    / pg_relation_size('events_failed_deploys_idx') between 14 and 18);

set plan_cache_mode = force_generic_plan;
prepare q(text) as
  select id from events
  where kind = 'deploy' and payload->>'status' = $1
  order by created_at desc limit 20;
create temp table generic_plan (line text);
do $$
declare r text; plan text := '';
begin
  for r in execute 'explain (costs off) execute q(''failed'')' loop plan := plan || r || E'\n'; end loop;
  insert into generic_plan values (plan);
end $$;
select lab.prove('a generic plan ignores the partial index and uses events_created_at_idx',
  (select line not like '%events_failed_deploys_idx%' and line like '%events_created_at_idx%' from generic_plan));
reset plan_cache_mode;
deallocate q;

prepare q(text) as
  select id from events
  where kind = 'deploy' and payload->>'status' = $1
  order by created_at desc limit 20;
truncate generic_plan;
do $$
declare r text; plan text := '';
begin
  for r in execute 'explain (costs off) execute q(''failed'')' loop plan := plan || r || E'\n'; end loop;
  insert into generic_plan values (plan);
end $$;
select lab.prove('a custom plan (the first executions) does use it',
  (select line like '%events_failed_deploys_idx%' from generic_plan));
deallocate q;

\echo
\echo == Expression indexes

select lab.prove('lower(email) without an expression index: a Seq Scan of all 1,126 pages of users',
  'Seq Scan' = any(lab.nodes($$ select id from users where lower(email) = 'user4242@example.com' $$))
  and lab.warm_buffers($$ select id from users where lower(email) = 'user4242@example.com' $$) = 1126);

create index users_lower_email_idx on users (lower(email));

select lab.prove('with the expression index: a bitmap scan of 4 pages',
  'Bitmap Index Scan' = any(lab.nodes($$ select id from users where lower(email) = 'user4242@example.com' $$))
  and lab.warm_buffers($$ select id from users where lower(email) = 'user4242@example.com' $$) <= 5);

select lab.prove('where email = ... does not use the lower(email) index',
  'Seq Scan' = any(lab.nodes($$ select id from users where email = 'user4242@example.com' $$)));

create temp table caught (k text, state text, msg text);
do $$ begin
  create index events_day_idx on events ((created_at::date));
  raise exception 'no error';
exception when invalid_object_definition then
  insert into caught values ('immutable', sqlstate, sqlerrm);
end $$;
select lab.prove('created_at::date on a timestamptz cannot be indexed: functions in index expression must be marked IMMUTABLE',
  (select state = '42P17' and msg = 'functions in index expression must be marked IMMUTABLE'
   from caught where k = 'immutable'));

create index events_day_utc_idx on events (((created_at at time zone 'UTC')::date));
select lab.prove('spelling out the zone makes it indexable',
  to_regclass('events_day_utc_idx') is not null);
drop index events_day_utc_idx;

\echo
\echo == Unique indexes

create unique index users_lower_email_key on users (lower(email));

do $$ begin
  insert into users (account_id, email, name) values (1, 'USER4242@example.com', 'Dup');
  raise exception 'no error';
exception when unique_violation then
  insert into caught values ('unique', sqlstate, sqlerrm);
end $$;
select lab.prove('USER4242@example.com is rejected: duplicate key value violates unique constraint "users_lower_email_key"',
  (select state = '23505'
      and msg = 'duplicate key value violates unique constraint "users_lower_email_key"'
   from caught where k = 'unique'));

\echo
\echo == Deduplication (PostgreSQL 13+)

create index events_project_id_nodedup on events (project_id) with (deduplicate_items = off);
create index events_kind_idx on events (kind);
create index events_kind_nodedup on events (kind) with (deduplicate_items = off);

select lab.prove('sizes: kind 13 MB, kind without dedup 43 MB, pkey 43 MB, project_id 14 MB, project_id without dedup 43 MB',
  pg_size_pretty(pg_relation_size('events_kind_idx')) = '13 MB'
  and pg_size_pretty(pg_relation_size('events_kind_nodedup')) = '43 MB'
  and pg_size_pretty(pg_relation_size('events_pkey')) = '43 MB'
  and pg_size_pretty(pg_relation_size('events_project_id_idx')) = '14 MB'
  and pg_size_pretty(pg_relation_size('events_project_id_nodedup')) = '43 MB');

select lab.prove('deduplication makes low-cardinality indexes about three times smaller',
  pg_relation_size('events_project_id_nodedup')::numeric / pg_relation_size('events_project_id_idx') between 2.8 and 3.4
  and pg_relation_size('events_kind_nodedup')::numeric / pg_relation_size('events_kind_idx') between 2.8 and 3.6);

select lab.prove('a leaf holds about 13 posting-list tuples of about 550 bytes, against 367 plain 16-byte ones',
  (select round(avg(live_items)) between 12 and 15 and round(avg(avg_item_size)) between 500 and 600
   from bt_multi_page_stats('events_project_id_idx', 1, -1) where type = 'l')
  and (select round(avg(live_items)) = 367 and round(avg(avg_item_size)) = 16
       from bt_multi_page_stats('events_project_id_nodedup', 1, -1) where type = 'l'));

create table dedup_numeric (n numeric);
create index dedup_numeric_idx on dedup_numeric (n);
select lab.prove('numeric indexes cannot deduplicate (allequalimage is false)',
  (select not allequalimage from bt_metap('dedup_numeric_idx'))
  and (select allequalimage from bt_metap('events_project_id_idx')));
drop table dedup_numeric;

select lab.prove('each kind matches 12.5% to 37.5% of the table',
  (select min(c) between 245000 and 255000 and max(c) between 745000 and 755000
   from (select count(*) c from events group by kind) s)
  and (select count(distinct kind) = 5 from events));

select lab.prove('for kind = ''alert'' the bitmap scan visits nearly every heap page',
  (select lab.field(p, 'Bitmap Heap Scan', 'Exact Heap Blocks')::int
          > 0.99 * (select relpages from pg_class where relname = 'events')
   from lab.plan($$ select * from events where kind = 'alert' $$) p));

select lab.prove('so it reads more pages than a sequential scan would',
  lab.buffers($$ select * from events where kind = 'alert' $$) > 35173);

drop index events_project_id_nodedup;
drop index events_kind_nodedup;
drop index events_kind_idx;

\echo
\echo == Every index is a tax on writes

create table events_w (like events including defaults);
create temp table tax (k text, buffers bigint, wal numeric);

insert into tax select 'none',
  (p -> 'Plan' ->> 'Shared Hit Blocks')::bigint + (p -> 'Plan' ->> 'Shared Read Blocks')::bigint,
  (p -> 'Plan' ->> 'WAL Bytes')::numeric
  from lab.plan($$ insert into events_w select * from events where id <= 200000 $$) p;

truncate events_w;
alter table events_w add primary key (id);
insert into tax select 'pk',
  (p -> 'Plan' ->> 'Shared Hit Blocks')::bigint + (p -> 'Plan' ->> 'Shared Read Blocks')::bigint,
  (p -> 'Plan' ->> 'WAL Bytes')::numeric
  from lab.plan($$ insert into events_w select * from events where id <= 200000 $$) p;

truncate events_w;
create index on events_w (project_id, created_at);
create index on events_w (account_id, created_at);
create index on events_w (user_id);
create index on events_w (created_at);
insert into tax select 'pk+4',
  (p -> 'Plan' ->> 'Shared Hit Blocks')::bigint + (p -> 'Plan' ->> 'Shared Read Blocks')::bigint,
  (p -> 'Plan' ->> 'WAL Bytes')::numeric
  from lab.plan($$ insert into events_w select * from events where id <= 200000 $$) p;

\echo indexes | buffer accesses | WAL
select k || ' | ' || buffers || ' | ' || pg_size_pretty(wal) from tax order by buffers;

select lab.prove('no indexes: about 211,000 buffer accesses and 32 MB of WAL',
  (select buffers between 200000 and 225000 and wal between 30e6 and 38e6 from tax where k = 'none'));

select lab.prove('primary key: about 561,000 buffer accesses and 45 MB of WAL',
  (select buffers between 530000 and 600000 and wal between 42e6 and 52e6 from tax where k = 'pk'));

-- WAL varies a little with checkpoints (full-page images), hence the wide range.
select lab.prove('primary key plus 4 secondary: about 2.4 million buffer accesses and over 100 MB of WAL',
  (select buffers between 2200000 and 2600000 and wal between 95e6 and 140e6 from tax where k = 'pk+4'));

select lab.prove('four secondary indexes made the insert touch about four times as many buffers',
  (select a.buffers::numeric / b.buffers between 3.5 and 5 from tax a, tax b where a.k = 'pk+4' and b.k = 'pk'));

select lab.prove('and more than doubled its WAL',
  (select a.wal / b.wal > 2 from tax a, tax b where a.k = 'pk+4' and b.k = 'pk'));

drop table events_w;

\echo
\echo == Indexes and HOT

create table events_h (like events including defaults) with (fillfactor = 40);
insert into events_h select * from events where id <= 4000;
alter table events_h add primary key (id);
create index on events_h (project_id, created_at);
create index on events_h (user_id);
vacuum analyze events_h;

create temp table hot (k text, records bigint, upd bigint, hot bigint);

begin;
create temp table x0 on commit drop as
  select n_tup_upd as u, n_tup_hot_upd as h from pg_stat_xact_user_tables where relname = 'events_h';
create temp table x1 on commit drop as
  select (p -> 'Plan' ->> 'WAL Records')::bigint as r
  from lab.plan($$ update events_h set payload = payload || '{"seen": true}' $$) p;
insert into hot select 'three indexes', x1.r, s.n_tup_upd - x0.u, s.n_tup_hot_upd - x0.h
  from x0, x1, pg_stat_xact_user_tables s where s.relname = 'events_h';
commit;

vacuum events_h;
create index on events_h ((payload->>'status'));

begin;
create temp table x0 on commit drop as
  select n_tup_upd as u, n_tup_hot_upd as h from pg_stat_xact_user_tables where relname = 'events_h';
create temp table x1 on commit drop as
  select (p -> 'Plan' ->> 'WAL Records')::bigint as r
  from lab.plan($$ update events_h set payload = payload || '{"seen": 2}' $$) p;
insert into hot select 'plus status index', x1.r, s.n_tup_upd - x0.u, s.n_tup_hot_upd - x0.h
  from x0, x1, pg_stat_xact_user_tables s where s.relname = 'events_h';
commit;

\echo indexes | WAL records | updates | HOT updates
select k || ' | ' || records || ' | ' || upd || ' | ' || hot from hot;

select lab.prove('updating payload on 4,000 rows with room on every page: all 4,000 updates are HOT, about 4,000 WAL records',
  (select upd = 4000 and hot = 4000 and records between 4000 and 4400 from hot where k = 'three indexes'));

select lab.prove('add an expression index on payload->>''status'': no HOT updates, about 20,000 WAL records (one heap record plus one per index)',
  (select upd = 4000 and hot = 0 and records between 19000 and 21500 from hot where k = 'plus status index'));

drop table events_h;

\echo
\echo == Finding unused and duplicate indexes

create index events_project_id_idx2 on events (project_id);

select s.relname || ' | ' || s.indexrelname || ' | ' || s.idx_scan || ' | '
       || pg_size_pretty(pg_relation_size(s.indexrelid))
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.idx_scan = 0 and not i.indisunique and not i.indisprimary
order by pg_relation_size(s.indexrelid) desc;

select lab.prove('events_created_at_idx shows up too: EXPLAIN without ANALYZE never counts as a scan',
  (select idx_scan = 0 from pg_stat_user_indexes where indexrelname = 'events_created_at_idx'));

select lab.prove('the unused-index query lists a never-scanned index, and skips unique and primary keys',
  exists (
    select 1
    from pg_stat_user_indexes s
    join pg_index i on i.indexrelid = s.indexrelid
    where s.idx_scan = 0 and not i.indisunique and not i.indisprimary
      and s.indexrelname = 'events_project_id_idx2')
  and not exists (
    select 1
    from pg_stat_user_indexes s
    join pg_index i on i.indexrelid = s.indexrelid
    where s.idx_scan = 0 and not i.indisunique and not i.indisprimary
      and s.indexrelname in ('events_pkey', 'users_lower_email_key')));

create temp table dupes as
select a.indrelid::regclass::text   as table_name,
       a.indexrelid::regclass::text as redundant,
       b.indexrelid::regclass::text as covered_by
from pg_index a
join pg_index b
  on b.indrelid = a.indrelid
 and b.indexrelid <> a.indexrelid
 and b.indnkeyatts >= a.indnkeyatts
 and (b.indkey::text || ' ') like (a.indkey::text || ' %')
where not a.indisunique
  and a.indnatts = a.indnkeyatts
  and a.indpred is null and b.indpred is null
  and a.indexprs is null and b.indexprs is null
  and (a.indkey::text <> b.indkey::text or a.indexrelid > b.indexrelid);

select table_name || ' | ' || redundant || ' | ' || covered_by from dupes
order by redundant::regclass::oid, covered_by::regclass::oid;

select lab.prove('the duplicate query finds (project_id) covered by (project_id, created_at), and the exact copy',
  exists (select 1 from dupes where redundant = 'events_project_id_idx' and covered_by = 'events_project_created_idx')
  and exists (select 1 from dupes where redundant = 'events_project_id_idx2' and covered_by = 'events_project_created_idx')
  and exists (select 1 from dupes where redundant = 'events_project_id_idx2' and covered_by = 'events_project_id_idx')
  and (select count(*) from dupes) = 3);
