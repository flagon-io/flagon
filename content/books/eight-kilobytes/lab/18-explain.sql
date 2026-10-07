-- Lab for "Read the plan, not the clock"
-- https://www.flagon.io/books/eight-kilobytes/explain
-- Run: ./lab 18-explain
--
-- The plans in the chapter, checked by node type, row counts, and buffers.
-- The sample data ends at midnight on 2026-10-06, so time windows are fixed
-- dates: "the last 30 days" is created_at >= '2026-09-06'.

\pset tuples_only on
\pset format unaligned

-- The first plan node containing the given fields, e.g.
-- pg_temp.node(p, '{"Node Type": "Seq Scan", "Relation Name": "events"}').
create function pg_temp.node(p jsonb, match jsonb) returns jsonb
language sql as $$
  with recursive walk(n) as (
    select p -> 'Plan'
    union all
    select c from walk, jsonb_array_elements(coalesce(walk.n -> 'Plans', '[]')) c
  )
  select n from walk where n @> match limit 1
$$;

-- Total shared buffers (hit + read) at the top node of a captured plan.
create function pg_temp.bufs(p jsonb) returns bigint
language sql as $$
  select coalesce((p -> 'Plan' ->> 'Shared Hit Blocks')::bigint, 0)
       + coalesce((p -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0)
$$;

\echo
\echo == EXPLAIN guesses; EXPLAIN ANALYZE runs it

select lab.prove('events is 2,000,000 rows in 35,173 pages',
  (select count(*) from events) = 2000000
  and (select relpages from pg_class where relname = 'events') = 35173);

begin;
select lab.prove('plain explain of a delete runs nothing: every row is still there',
  lab.plan_text($$ delete from events where created_at < '2025-10-11' $$, 'costs off')
    like 'Delete on events%'
  and (select count(*) from events) = 2000000);
rollback;

create temp table p_alert as
  select lab.plan($$ select * from events where kind = 'alert' $$) as p;

select lab.prove('explain analyze reports actual rows: 249,714 alerts',
  (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 249714 from p_alert));

select lab.prove('the estimate (about 245,000) is within a few percent of the actual rows (5% allows for sampling)',
  (select abs((p -> 'Plan' ->> 'Plan Rows')::numeric - 249714) / 249714 < 0.05 from p_alert));

select lab.prove('PostgreSQL 18 includes Buffers without asking',
  lab.plan_text($$ select * from events where id = 1 $$, 'analyze, costs off') like '%Buffers: shared%');

select lab.prove('track_io_timing is on in the lab kit, so I/O Timings appear',
  current_setting('track_io_timing') = 'on'
  and lab.plan_text($$ select count(*) from events where kind = 'login' $$, 'analyze, costs off')
        like '%I/O Timings%');

begin;
create temp table p_del as
  select lab.plan($$ delete from events where created_at < '2025-10-11' $$) as p;
select lab.prove('explain analyze of a delete really deletes (about 27,000 rows here)',
  (select count(*) from events) < 2000000
  and (select lab.field(p, 'Seq Scan', 'Actual Rows')::numeric between 20000 and 60000 from p_del));
rollback;
select lab.prove('and rollback puts them back',
  (select count(*) from events) = 2000000);

select lab.prove('serialize (17+) and memory (17+) add their lines',
  lab.plan_text($$ select * from events where id < 1000 $$, 'analyze, serialize, memory, costs off')
    like '%Serialization: time=%output=128kB%'
  and lab.plan_text($$ select * from events where id < 1000 $$, 'analyze, serialize, memory, costs off')
    like '%Memory: used=%');

\echo
\echo == The plan is a tree; read it inside out

set max_parallel_workers_per_gather = 0;
create temp table p_tree as
  select lab.plan($$ select p.name, count(*)
                     from events e
                     join projects p on p.id = e.project_id
                     where e.created_at >= '2026-09-29'
                       and p.archived_at is not null
                     group by p.name $$) as p;

select lab.prove('the two-table join is GroupAggregate (a sorted Aggregate), Sort, Hash Join, Seq Scan, Hash, Seq Scan',
  lab.nodes($$ select p.name, count(*)
               from events e
               join projects p on p.id = e.project_id
               where e.created_at >= '2026-09-29'
                 and p.archived_at is not null
               group by p.name $$)
  = array['Aggregate', 'Sort', 'Hash Join', 'Seq Scan', 'Hash', 'Seq Scan']
  and (select lab.field(p, 'Aggregate', 'Strategy') = 'Sorted' from p_tree));

select lab.prove('3,911 archived projects, 191 pages, in a 1-batch hash',
  (select lab.field(p, 'Hash', 'Actual Rows')::numeric = 3911
      and lab.field(p, 'Hash', 'Hash Batches')::int = 1
   from p_tree)
  and (select relpages from pg_class where relname = 'projects') = 191);

select lab.prove('buffers are cumulative: the top node reports about 35,367, the events scan 35,173 of them',
  (select pg_temp.bufs(p) between 35364 and 35400 from p_tree)
  and (select (n ->> 'Shared Hit Blocks')::bigint + (n ->> 'Shared Read Blocks')::bigint = 35173
       from (select pg_temp.node(p, '{"Node Type": "Seq Scan", "Relation Name": "events"}') n from p_tree) x));

select lab.prove('the Hash Join''s first row comes late (startup time is most of its total)',
  (select lab.field(p, 'Hash Join', 'Actual Startup Time')::numeric
          > 0.5 * lab.field(p, 'Hash Join', 'Actual Total Time')::numeric from p_tree));
reset max_parallel_workers_per_gather;

\echo
\echo == Cost is a guess in made-up units

select lab.prove('cost settings are at their defaults: 1.0, 4.0, 0.01, 0.005, 0.0025',
  current_setting('seq_page_cost')::numeric = 1
  and current_setting('random_page_cost')::numeric = 4
  and current_setting('cpu_tuple_cost')::numeric = 0.01
  and current_setting('cpu_index_tuple_cost')::numeric = 0.005
  and current_setting('cpu_operator_cost')::numeric = 0.0025);

-- The seq scan with one filter costs exactly
--   relpages * seq_page_cost + reltuples * (cpu_tuple_cost + cpu_operator_cost)
select 'relpages ' || relpages || ', reltuples ' || reltuples::bigint
       || ', formula ' || round((relpages * 1.0 + reltuples * 0.01 + reltuples * 0.0025)::numeric, 2)
       || ', plan ' || (lab.plan($$ select * from events where kind = 'alert' $$) -> 'Plan' ->> 'Total Cost')
from pg_class where relname = 'events';

select lab.prove('the plan''s total cost equals relpages x 1.0 + reltuples x 0.01 + reltuples x 0.0025, to the cent',
  (select round((relpages * 1.0 + reltuples * 0.01 + reltuples * 0.0025)::numeric, 2)
   from pg_class where relname = 'events')
  = (select (p -> 'Plan' ->> 'Total Cost')::numeric
     from (select lab.plan($$ select * from events where kind = 'alert' $$) as p) x));

\echo
\echo == Loops: multiply

create temp table p_loops as
  select lab.plan($$ select e.id, e.kind, p.name
                     from events e
                     join projects p on p.id = e.project_id
                     where e.user_id = 4243 $$) as p;

select lab.prove('the join is a parallel Nested Loop with a projects_pkey lookup inside',
  (select lab.field(p, 'Nested Loop', 'Actual Loops')::int = 3
      and lab.field(p, 'Index Scan', 'Index Name') = 'projects_pkey'
   from p_loops));

select lab.prove('the inner index scan ran once per outer row: loops=102, 1 row each',
  (select lab.field(p, 'Index Scan', 'Actual Loops')::int = 102
      and lab.field(p, 'Index Scan', 'Actual Rows')::numeric = 1
      and lab.field(p, 'Index Scan', 'Index Searches')::int = 102
   from p_loops));

select lab.prove('buffers are totals across loops: about 3 pages per lookup',
  (select (lab.field(p, 'Index Scan', 'Shared Hit Blocks')::int
         + coalesce(lab.field(p, 'Index Scan', 'Shared Read Blocks')::int, 0)) between 290 and 320
   from p_loops));

\echo
\echo == Buffers are the evidence

create temp table p_login1 as select lab.plan($$ select * from events where kind = 'login' $$) as p;
create temp table p_login2 as select lab.plan($$ select * from events where kind = 'login' $$) as p;

select lab.prove('a second big sequential scan is still mostly reads, not hits (ring buffer)',
  (select coalesce((p -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0) > 25000 from p_login2));

select lab.prove('hit + read is the same total on both runs: all 35,173 pages',
  (select pg_temp.bufs(p) = 35173 from p_login1)
  and (select pg_temp.bufs(p) = 35173 from p_login2));

begin;
create temp table p_upd on commit drop as
  select lab.plan($$ update events set kind = 'build'
                     where id between 1 and 1000 and kind = 'build' $$) as p;
select lab.prove('updating 341 rows with only the primary key dirties a few dozen pages',
  (select lab.field(p, 'Index Scan', 'Actual Rows')::numeric = 341
      and (p -> 'Plan' ->> 'Shared Dirtied Blocks')::int < 80 from p_upd));
rollback;

create index events_user_id_idx on events (user_id);
begin;
create temp table p_upd on commit drop as
  select lab.plan($$ update events set kind = 'build'
                     where id between 1 and 1000 and kind = 'build' $$) as p;
select lab.prove('with an index on user_id too, the same update dirties hundreds of pages',
  (select (p -> 'Plan' ->> 'Shared Dirtied Blocks')::int > 200 from p_upd));
rollback;
drop index events_user_id_idx;

-- The rolled-back updates left dead row versions on new pages at the end of
-- the table; vacuum removes them so the page counts below match the chapter.
vacuum events;

\echo
\echo == Join nodes

set max_parallel_workers_per_gather = 0;
create temp table p_hash as
  select lab.plan($$ select e.id, u.email
                     from events e join users u on u.id = e.user_id
                     where e.created_at >= '2026-09-06' $$) as p;
select lab.prove('hash join: 100,000 users hashed in 1 batch at the default work_mem (about 7,274 kB)',
  (select lab.field(p, 'Hash', 'Actual Rows')::numeric = 100000
      and lab.field(p, 'Hash', 'Hash Batches')::int = 1
      and lab.field(p, 'Hash', 'Peak Memory Usage')::int between 7000 and 7500
   from p_hash));

begin;
set local work_mem = '1MB';
create temp table p_hash1 on commit drop as
  select lab.plan($$ select e.id, u.email
                     from events e join users u on u.id = e.user_id
                     where e.created_at >= '2026-09-06' $$) as p;
select lab.prove('at work_mem = 1MB it splits into 4 batches and writes temp files',
  (select lab.field(p, 'Hash', 'Hash Batches')::int = 4
      and lab.field(p, 'Hash', 'Temp Written Blocks')::int > 0
   from p_hash1));
commit;
reset max_parallel_workers_per_gather;

select lab.prove('hash_mem_multiplier defaults to 2',
  current_setting('hash_mem_multiplier')::numeric = 2);

create table project_stats as
  select id as project_id, 0::bigint as views from projects;
alter table project_stats add primary key (project_id);
analyze project_stats;

select lab.prove('with order by p.id, two index scans feed a Merge Join',
  lab.nodes($$ select p.id, p.name, s.views from projects p
               join project_stats s on s.project_id = p.id order by p.id $$)
  = array['Merge Join', 'Index Scan', 'Index Scan']);

select lab.prove('the full merge join reads about 412 pages',
  lab.warm_buffers($$ select p.id, p.name, s.views from projects p
                  join project_stats s on s.project_id = p.id order by p.id $$) between 400 and 420);

select lab.prove('without the order by, the same join is a Hash Join',
  'Hash Join' = any(lab.nodes($$ select p.id, p.name, s.views from projects p
                                 join project_stats s on s.project_id = p.id $$)));

select lab.prove('with limit 10, the merge join stops after 6 pages',
  lab.warm_buffers($$ select p.id, p.name, s.views from projects p
                  join project_stats s on s.project_id = p.id order by p.id limit 10 $$) = 6);

\echo
\echo == Sorts, hashes, and work_mem

select lab.prove('work_mem defaults to 4MB',
  current_setting('work_mem') = '4MB');

set max_parallel_workers_per_gather = 0;
create temp table p_sort as
  select lab.plan($$ select id, user_id, created_at from events
                     where created_at >= '2026-09-06'
                     order by user_id, created_at $$) as p;
select lab.prove('sorting 30 days of events (about 164,000 rows) spills: external merge, about 5,480 kB on disk',
  (select lab.field(p, 'Sort', 'Sort Method') = 'external merge'
      and lab.field(p, 'Sort', 'Sort Space Type') = 'Disk'
      and lab.field(p, 'Sort', 'Sort Space Used')::int between 4800 and 6000
      and lab.field(p, 'Sort', 'Actual Rows')::numeric between 150000 and 170000
      and lab.field(p, 'Sort', 'Temp Written Blocks')::int > 0
   from p_sort));

begin;
set local work_mem = '32MB';
create temp table p_sort32 on commit drop as
  select lab.plan($$ select id, user_id, created_at from events
                     where created_at >= '2026-09-06'
                     order by user_id, created_at $$) as p;
select lab.prove('at work_mem = 32MB it is a quicksort in memory, about 12,566 kB',
  (select lab.field(p, 'Sort', 'Sort Method') = 'quicksort'
      and lab.field(p, 'Sort', 'Sort Space Type') = 'Memory'
      and lab.field(p, 'Sort', 'Sort Space Used')::int between 11000 and 13500
   from p_sort32));
select lab.prove('memory used is more than twice the on-disk size',
  (select lab.field(a.p, 'Sort', 'Sort Space Used')::numeric
          / lab.field(b.p, 'Sort', 'Sort Space Used')::numeric > 2
   from p_sort32 a, p_sort b));
commit;

create temp table p_hagg as
  select lab.plan($$ select project_id, kind, count(*) from events group by project_id, kind $$) as p;
select lab.prove('a HashAggregate over 100,000 groups spills too: 5 batches',
  (select lab.field(p, 'Aggregate', 'Strategy') = 'Hashed'
      and lab.field(p, 'Aggregate', 'Actual Rows')::numeric = 100000
      and lab.field(p, 'Aggregate', 'HashAgg Batches')::int > 1
      and lab.field(p, 'Aggregate', 'Disk Usage')::int > 0
   from p_hagg));
reset max_parallel_workers_per_gather;

\echo
\echo == Limit bets on finding rows early

create temp table p_limit as
  select lab.plan($$ select e.id, e.kind, u.email
                     from events e join users u on u.id = e.user_id
                     order by e.user_id limit 10 $$) as p;

select lab.prove('without an index on user_id: a Nested Loop over a Materialize of all events',
  (select lab.nodes($$ select e.id, e.kind, u.email
                       from events e join users u on u.id = e.user_id
                       order by e.user_id limit 10 $$)
   = array['Limit', 'Nested Loop', 'Index Scan', 'Materialize', 'Seq Scan']));

select lab.prove('the Limit is costed near 20,860; the full nested loop over four billion',
  (select (p -> 'Plan' ->> 'Total Cost')::numeric between 19000 and 23000
      and lab.field(p, 'Nested Loop', 'Total Cost')::numeric > 4e9
   from p_limit));

select lab.prove('users 1 and 2 have no events: the third user found the ten rows (loops=3)',
  (select min(user_id) = 3 from events)
  and (select lab.field(p, 'Materialize', 'Actual Loops')::int = 3 from p_limit));

select lab.prove('Rows Removed by Join Filter is about 4.25 million, and the materialized copy went to disk',
  (select lab.field(p, 'Nested Loop', 'Rows Removed by Join Filter')::bigint between 4200000 and 4300000
      and lab.field(p, 'Materialize', 'Storage') = 'Disk'
   from p_limit));

create index events_user_id_idx on events (user_id);

create temp table p_limit2 as
  select lab.plan($$ select e.id, e.kind, u.email
                     from events e join users u on u.id = e.user_id
                     order by e.user_id limit 10 $$) as p;

-- The two plans cost within a few percent of each other, so which one wins
-- depends on the kit's sampled statistics. Both read 16 pages.
select lab.prove('with the index, it reads 16 pages: the events index feeds a merge join, or a nested loop with a Memoize (9 hits, 1 miss)',
  lab.warm_buffers($$ select e.id, e.kind, u.email
                  from events e join users u on u.id = e.user_id
                  order by e.user_id limit 10 $$) = 16
  and (select pg_temp.node(p, '{"Index Name": "events_user_id_idx"}') is not null
          and lab.field(p, 'Materialize', 'Node Type') is null
          and lab.field(p, 'Sort', 'Node Type') is null
          and (lab.field(p, 'Merge Join', 'Node Type') is not null
               or (lab.field(p, 'Memoize', 'Cache Hits')::int = 9
                   and lab.field(p, 'Memoize', 'Cache Misses')::int = 1))
       from p_limit2));

drop index events_user_id_idx;

\echo
\echo == Memoize

create index events_account_created_idx on events (account_id, created_at);
create index events_user_id_idx on events (user_id);
set max_parallel_workers_per_gather = 0;
create temp table p_memo as
  select lab.plan($$ select e.id, e.kind, u.email
                     from events e join users u on u.id = e.user_id
                     where e.account_id = 42
                       and e.created_at >= '2026-07-08' $$) as p;
select lab.prove('a tenant''s events joined to its users: Memoize, about 523 lookups, 20 misses (one per distinct user)',
  (select lab.field(p, 'Memoize', 'Cache Misses')::int = 20
      and lab.field(p, 'Memoize', 'Cache Hits')::int + 20
          = lab.field(p, 'Memoize', 'Actual Loops')::int
      and lab.field(p, 'Memoize', 'Actual Loops')::int between 450 and 600
      and lab.field(p, 'Memoize', 'Cache Evictions')::int = 0
   from p_memo));
reset max_parallel_workers_per_gather;
drop index events_user_id_idx;

\echo
\echo == Parallel query is faster, not cheaper

create temp table p_par as
  select lab.plan($$ select count(*) from events where kind = 'deploy' $$) as p;
select lab.prove('count of deploys: Finalize Aggregate over Gather, 2 workers, loops=3',
  (select (p -> 'Plan' ->> 'Node Type') = 'Aggregate'
      and (p -> 'Plan' ->> 'Partial Mode') = 'Finalize'
      and lab.field(p, 'Gather', 'Workers Planned')::int = 2
      and lab.field(p, 'Seq Scan', 'Actual Loops')::int = 3
   from p_par));
-- (the rolled-back update above left a few new pages at the end of the table)
select lab.prove('three processes still read every page of the table between them (35,173 and up)',
  (select pg_temp.bufs(p) = pg_relation_size('events') / 8192 from p_par));
select lab.prove('there are 499,992 deploys',
  (select count(*) from events where kind = 'deploy') = 499992);

\echo
\echo == Worked example 1: an activity feed

drop index events_account_created_idx;

select lab.prove('before: the feed reads about 35,249 pages for 50 rows',
  lab.buffers($$ select id, kind, created_at, payload from events
                 where account_id = 42 order by created_at desc limit 50 $$) between 35173 and 35400);

select lab.prove('the estimate is good: about 1,994 against 2,084 matching rows',
  (select count(*) from events where account_id = 42) = 2084
  and (select lab.field(p, 'Gather Merge', 'Plan Rows')::int between 1800 and 2300
       from (select lab.plan($$ select id, kind, created_at, payload from events
                                where account_id = 42 order by created_at desc limit 50 $$) as p) x));

create index events_account_created_idx on events (account_id, created_at);

select lab.prove('after (account_id, created_at): 51 pages, no Sort',
  lab.warm_buffers($$ select id, kind, created_at, payload from events
                  where account_id = 42 order by created_at desc limit 50 $$) = 51
  and lab.nodes($$ select id, kind, created_at, payload from events
                   where account_id = 42 order by created_at desc limit 50 $$) = array['Limit', 'Index Scan']);

select lab.prove('offset 1000 fetches 1,050 rows and reads about 1,027 pages to show 50',
  lab.warm_buffers($$ select id, kind, created_at, payload from events
                  where account_id = 42 order by created_at desc limit 50 offset 1000 $$) between 1000 and 1060
  and (select lab.field(p, 'Index Scan', 'Actual Rows')::numeric = 1050
       from (select lab.plan($$ select id, kind, created_at, payload from events
                                where account_id = 42 order by created_at desc limit 50 offset 1000 $$) as p) x));

\echo
\echo == Worked example 2: loops multiply

create temp table p_ex2 as
  select lab.plan($$ select u.email, last.kind, last.created_at
                     from users u
                     cross join lateral (
                       select e.kind, e.created_at
                       from events e
                       where e.user_id = u.id
                       order by e.created_at desc
                       limit 1
                     ) last
                     where u.account_id = 42
                       and u.id in (select owner_id from projects where account_id = 42) $$) as p;

select lab.prove('before: about 703,714 pages for 20 rows',
  (select pg_temp.bufs(p) between 703500 and 704500
      and (p -> 'Plan' ->> 'Actual Rows')::numeric = 20 from p_ex2));

select lab.prove('the inner Limit ran 20 times, each a full Seq Scan with Filter (user_id = u.id)',
  (select lab.field(p, 'Limit', 'Actual Loops')::int = 20
      and pg_temp.node(p, '{"Node Type": "Seq Scan", "Relation Name": "events"}') ->> 'Filter' = '(user_id = u.id)'
      and (lab.field(p, 'Limit', 'Shared Hit Blocks')::bigint
         + lab.field(p, 'Limit', 'Shared Read Blocks')::bigint) = 20 * (pg_relation_size('events') / 8192)
   from p_ex2));

select lab.prove('703,463 pages is more than 5 GB',
  20 * 35173 * 8192::bigint > 5e9);

select lab.prove('the Memoize over users did nothing: 0 hits, 20 misses',
  (select lab.field(p, 'Memoize', 'Cache Hits')::int = 0
      and lab.field(p, 'Memoize', 'Cache Misses')::int = 20 from p_ex2));

create index events_user_created_idx on events (user_id, created_at);

select lab.prove('after (user_id, created_at): 331 pages',
  lab.warm_buffers($$ select u.email, last.kind, last.created_at
                  from users u
                  cross join lateral (
                    select e.kind, e.created_at
                    from events e
                    where e.user_id = u.id
                    order by e.created_at desc
                    limit 1
                  ) last
                  where u.account_id = 42
                    and u.id in (select owner_id from projects where account_id = 42) $$) = 331);

create temp table p_ex2_after as
  select lab.plan($$ select u.email, last.kind, last.created_at
                     from users u
                     cross join lateral (
                       select e.kind, e.created_at
                       from events e
                       where e.user_id = u.id
                       order by e.created_at desc
                       limit 1
                     ) last
                     where u.account_id = 42
                       and u.id in (select owner_id from projects where account_id = 42) $$) as p;

-- (lab.plan of the same query, after the index)
select lab.prove('each loop now costs 4 pages: 80 for 20 loops',
  (select (lab.field(p, 'Limit', 'Shared Hit Blocks')::int
         + coalesce(lab.field(p, 'Limit', 'Shared Read Blocks')::int, 0)) = 80
      and lab.field(p, 'Limit', 'Actual Loops')::int = 20
   from p_ex2_after));

\echo
\echo == Worked example 3: a misestimate picks the wrong join

drop index events_account_created_idx;
drop index events_user_created_idx;

select lab.prove('with no secondary indexes, the on-call query reads about 42,397 pages',
  lab.buffers($$ select p.id, p.name, count(*) as failures
                 from events e
                 join projects p on p.id = e.project_id
                 where e.kind = 'deploy'
                   and e.payload->>'status' = 'failed'
                   and e.created_at >= '2026-09-29'
                 group by p.id, p.name
                 order by failures desc
                 limit 10 $$) between 41000 and 44000);

create index events_created_at_idx on events (created_at);

create temp table p_ex3 as
  select lab.plan($$ select p.id, p.name, count(*) as failures
                     from events e
                     join projects p on p.id = e.project_id
                     where e.kind = 'deploy'
                       and e.payload->>'status' = 'failed'
                       and e.created_at >= '2026-09-29'
                     group by p.id, p.name
                     order by failures desc
                     limit 10 $$) as p;

select lab.prove('with (created_at): a Nested Loop doing one projects_pkey lookup per event (about 2,402)',
  (select lab.field(p, 'Nested Loop', 'Actual Rows')::numeric between 2000 and 2800
      and pg_temp.node(p, '{"Index Name": "events_created_at_idx"}') is not null
      and (pg_temp.node(p, '{"Index Name": "projects_pkey"}') ->> 'Actual Loops')::numeric
          = lab.field(p, 'Nested Loop', 'Actual Rows')::numeric
   from p_ex3));

select lab.prove('the events scan estimated about 49 rows: at least 20x too few',
  (select (n ->> 'Actual Rows')::numeric / (n ->> 'Plan Rows')::numeric > 20
      and (n ->> 'Plan Rows')::int between 30 and 70
   from (select pg_temp.node(p, '{"Index Name": "events_created_at_idx"}') n from p_ex3) x));

select lab.prove('about 7,990 pages, most of them projects lookups',
  lab.warm_buffers($$ select p.id, p.name, count(*) as failures
                  from events e
                  join projects p on p.id = e.project_id
                  where e.kind = 'deploy'
                    and e.payload->>'status' = 'failed'
                    and e.created_at >= '2026-09-29'
                  group by p.id, p.name
                  order by failures desc
                  limit 10 $$) between 7000 and 9000);

select lab.prove('the default selectivity for an expression without statistics is 0.5%; the real share of failed is 25%',
  (select avg((payload->>'status' = 'failed')::int) between 0.24 and 0.26 from events));

create statistics events_status_stats on (payload->>'status') from events;
analyze events;

create temp table p_ex3b as
  select lab.plan($$ select p.id, p.name, count(*) as failures
                     from events e
                     join projects p on p.id = e.project_id
                     where e.kind = 'deploy'
                       and e.payload->>'status' = 'failed'
                       and e.created_at >= '2026-09-29'
                     group by p.id, p.name
                     order by failures desc
                     limit 10 $$) as p;

select lab.prove('with expression statistics, the estimate is within 25% of actual',
  (select abs((n ->> 'Plan Rows')::numeric / (n ->> 'Actual Rows')::numeric - 1) < 0.25
   from (select pg_temp.node(p, '{"Index Name": "events_created_at_idx"}') n from p_ex3b) x));

select lab.prove('and the planner switches to a Hash Join and a hashed aggregate on its own',
  (select lab.field(p, 'Hash Join', 'Node Type') is not null
      and lab.field(p, 'Nested Loop', 'Node Type') is null
      and lab.field(p, 'Aggregate', 'Strategy') = 'Hashed'
   from p_ex3b));

select lab.prove('about 975 pages instead of 7,990',
  lab.warm_buffers($$ select p.id, p.name, count(*) as failures
                  from events e
                  join projects p on p.id = e.project_id
                  where e.kind = 'deploy'
                    and e.payload->>'status' = 'failed'
                    and e.created_at >= '2026-09-29'
                  group by p.id, p.name
                  order by failures desc
                  limit 10 $$) between 900 and 1050);

\echo
\echo == Worked example 4: a report that spills

drop index events_created_at_idx;
set max_parallel_workers_per_gather = 0;

create temp table p_ex4 as
  select lab.plan($$ select id, user_id, created_at from events
                     where created_at >= '2026-09-06'
                     order by user_id, created_at $$) as p;
select lab.prove('the report spills (external merge) and scans the whole table for 8% of it',
  (select lab.field(p, 'Sort', 'Sort Method') = 'external merge'
      and lab.field(p, 'Seq Scan', 'Rows Removed by Filter')::bigint between 1800000 and 1860000
   from p_ex4));

begin;
set local work_mem = '32MB';
select lab.prove('with set local work_mem = ''32MB'', the spill is gone',
  (select lab.field(p, 'Sort', 'Sort Method') = 'quicksort'
   from (select lab.plan($$ select id, user_id, created_at from events
                            where created_at >= '2026-09-06'
                            order by user_id, created_at $$) as p) x));
commit;
select lab.prove('and set local ended with the transaction',
  current_setting('work_mem') = '4MB');
