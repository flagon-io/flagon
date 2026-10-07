-- Lab for "The cheapest plan wins"
-- https://www.flagon.io/books/eight-kilobytes/plans
-- Run: ./lab 20-plans
--
-- Every claim the chapter makes about plan choice, checked on your copy of
-- the data. Row estimates come from your own ANALYZE sample, so the exact
-- numbers differ from the book; the checks compare the planner against the
-- formulas, and plan shapes against each other, not against our numbers.
-- Takes a minute or two (it builds a 2-million-row shuffled copy of events).

\pset tuples_only on
\pset format unaligned

-- Plans in the chapter are captured single-process and without JIT unless the
-- section is about parallelism or JIT.
set max_parallel_workers_per_gather = 0;
set jit = off;

-- The newest event (2026-10-06 00:00 on every kit): every time window below is
-- measured back from it.
select set_config('plans.t_end', max(created_at)::text, false) from events \g /dev/null

-- Helpers. These use plain EXPLAIN (nothing runs) unless noted.
-- The whole plain EXPLAIN output, JIT section included (lab.estimate() is
-- just its top plan node).
create function est(q text) returns jsonb language plpgsql as $$
declare p jsonb;
begin
  execute 'explain (format json) ' || q into p;
  return p -> 0;
end $$;

create function est_cost(q text) returns numeric language sql as $$
  select (lab.estimate(q) ->> 'Total Cost')::numeric $$;

-- The first node below Limit / Aggregate / Gather wrappers: the access path.
create function scan_node(q text) returns text language plpgsql as $$
declare n jsonb := lab.estimate(q);
begin
  while n ->> 'Node Type' in ('Limit', 'Aggregate', 'Gather', 'Gather Merge', 'Sort') loop
    n := n -> 'Plans' -> 0;
  end loop;
  return n ->> 'Node Type';
end $$;

-- The first join node, outermost first.
create function join_node(q text) returns text language sql as $$
  select n from unnest(lab.est_nodes(q)) n
  where n in ('Nested Loop', 'Hash Join', 'Merge Join') limit 1 $$;

create function workers(q text) returns int language sql as $$
  select (x ->> 'Workers Planned')::int
  from jsonb_path_query(est(q), 'strict $.**') x
  where jsonb_typeof(x) = 'object' and x ? 'Workers Planned' limit 1 $$;

-- Best of n planning times, in ms.
create function plan_ms(q text, n int default 3) returns numeric language plpgsql as $$
declare p jsonb; best numeric; t numeric;
begin
  for i in 1..n loop
    execute 'explain (summary, format json) ' || q into p;
    t := (p -> 0 ->> 'Planning Time')::numeric;
    if best is null or t < best then best := t; end if;
  end loop;
  return best;
end $$;

\echo
\echo == Before any costing: the rewriter and the preprocessor

create view recent_deploys as
  select id, project_id, created_at from events where kind = 'deploy';

select lab.prove('a view is expanded into its query: one scan, both conditions',
  lab.est_nodes($$ select * from recent_deploys where project_id = 42 $$) = '{Seq Scan}'
  and lab.plan_text($$ select * from recent_deploys where project_id = 42 $$)
      like '%Filter: ((kind = ''deploy''::text) AND (project_id = 42))%');

select lab.prove('a subquery in FROM is pulled up into the outer query',
  lab.est_nodes($$ select * from (select id, project_id, kind from events
                              where kind = 'deploy') s
               where s.project_id = 42 $$) = '{Seq Scan}');

select lab.prove('a filter on a grouped subquery is pushed below the aggregate',
  lab.est_nodes($$ select * from (select project_id, count(*) from events
                              group by project_id) s
               where project_id = 42 $$) = '{Aggregate,Seq Scan}'
  and lab.est_rows($$ select * from (select project_id, count(*) from events
                                 group by project_id) s
                  where project_id = 42 $$) = 1);

select lab.prove('IN (subquery) becomes a join, not a per-row subplan',
  lab.plan_text($$ select * from projects
               where owner_id in (select id from users where account_id = 42) $$)
    !~ 'SubPlan'
  and join_node($$ select * from projects
                   where owner_id in (select id from users where account_id = 42) $$)
      is not null);

select lab.prove('constant expressions are folded: id = 2 * 21 becomes id = 42',
  lab.plan_text($$ select * from events where id = 2 * 21 $$) like '%Index Cond: (id = 42)%');

select lab.prove('a contradiction plans to a Result node that reads nothing',
  lab.est_nodes($$ select * from events where id = 42 and 1 = 2 $$) = '{Result}'
  and lab.plan_text($$ select * from events where id = 42 and 1 = 2 $$)
      like '%One-Time Filter: false%');

select lab.prove('a WHERE on the nullable side turns a LEFT JOIN into an inner join',
  join_node($$ select p.name, e.kind from projects p
               left join events e on e.project_id = p.id
               where e.kind = 'deploy' $$) = 'Hash Join'
  and lab.plan_text($$ select p.name, e.kind from projects p
                   left join events e on e.project_id = p.id
                   where e.kind = 'deploy' $$) !~ '(Left|Right) Join');

select lab.prove('an unused LEFT JOIN to a unique key is removed entirely',
  lab.est_nodes($$ select p.* from projects p left join users u on u.id = p.owner_id $$)
    = '{Seq Scan}');

select lab.prove('the same join is kept when a column from users is selected',
  join_node($$ select p.*, u.email from projects p
               left join users u on u.id = p.owner_id $$) is not null);

select lab.prove('a plain CTE is inlined: the outer filter reaches the primary key',
  lab.est_nodes($$ with d as (select * from events where kind = 'deploy')
               select * from d where id = 42 $$) = '{Index Scan}');

select lab.prove('a MATERIALIZED CTE is a fence: the whole CTE is computed first',
  'CTE Scan' = any(lab.est_nodes($$ with d as materialized
                                  (select * from events where kind = 'deploy')
                                select * from d where id = 42 $$)));

select lab.prove('PostgreSQL 18 removes a self-join on the primary key',
  lab.est_nodes($$ select e1.* from events e1 join events e2 on e2.id = e1.id
               where e2.kind = 'deploy' and e1.id < 100 $$) = '{Index Scan}');

set enable_self_join_elimination = off;
select lab.prove('with enable_self_join_elimination off, the join comes back',
  join_node($$ select e1.* from events e1 join events e2 on e2.id = e1.id
               where e2.kind = 'deploy' and e1.id < 100 $$) is not null);
reset enable_self_join_elimination;

select lab.prove('PostgreSQL 18 turns id = 1 OR id = 2 OR id = 3 into one = ANY index probe',
  lab.est_nodes($$ select * from events where id = 1 or id = 2 or id = 3 $$) = '{Index Scan}'
  and lab.plan_text($$ select * from events where id = 1 or id = 2 or id = 3 $$)
      like '%Index Cond: (id = ANY (''{1,2,3}''::integer[]))%');

create index projects_account_id_idx on projects (account_id);

begin;
create role plans_tenant;
grant select on projects to plans_tenant;
grant usage on schema lab to plans_tenant;
alter table projects enable row level security;
create policy tenant_isolation on projects
  using (account_id = current_setting('app.account_id')::bigint);
set local app.account_id = '42';
set local role plans_tenant;
select lab.prove('an RLS policy is added as a qual and can use the tenant index',
  lab.plan_text($$ select id, name from projects where archived_at is null $$)
    like '%Index Cond: (account_id = (current_setting(''app.account_id''::text))::bigint)%');
reset role;
rollback;

\echo
\echo == Errors compound up the join tree
-- (The single-table arithmetic, MCVs and histograms, is in 19-planner.)

select lab.prove('a redundant tenant clause divides the join estimate by about 1,000',
  lab.est_rows($$ select * from events e join projects p
              on p.id = e.project_id and p.account_id = e.account_id $$)
  between 1500 and 2500
  and lab.est_rows($$ select * from events e join projects p on p.id = e.project_id $$)
      > 1900000);

select lab.prove('with a second redundant join, the estimate falls to a handful of rows',
  lab.est_rows($$ select e.id from events e
              join projects p on p.id = e.project_id and p.account_id = e.account_id
              join users u on u.id = p.owner_id and u.account_id = p.account_id $$) < 10
  and 'Nested Loop' = join_node($$ select count(*) from events e
              join projects p on p.id = e.project_id and p.account_id = e.account_id
              join users u on u.id = p.owner_id and u.account_id = p.account_id $$));

select lab.prove('the compounded misestimate costs over 100x the pages of the plain join',
  lab.buffers($$ select count(*) from events e
                 join projects p on p.id = e.project_id and p.account_id = e.account_id
                 join users u on u.id = p.owner_id and u.account_id = p.account_id $$)
  > 100 * lab.buffers($$ select count(*) from events e
                         join projects p on p.id = e.project_id
                         join users u on u.id = p.owner_id $$));

-- The planner reads foreign keys when it estimates joins: with a composite key
-- covering both conditions, the redundant clause is estimated correctly.
begin;
alter table projects add constraint projects_id_account_key unique (id, account_id);
alter table events add constraint events_project_account_fkey
  foreign key (project_id, account_id) references projects (id, account_id);
analyze projects;
select lab.prove('with a composite foreign key, the two-condition join is estimated at about 2 million rows',
  lab.est_rows($$ select * from events e join projects p
              on p.id = e.project_id and p.account_id = e.account_id $$) > 1900000);
rollback;

\echo
\echo == Access paths and where they cross over

create index events_created_at_idx on events (created_at);
create table events_shuffled as select * from events order by random();
create index events_shuffled_created_at_idx on events_shuffled (created_at);
analyze events_shuffled;

select lab.prove('events.created_at is in physical order; the shuffled copy is not',
  (select correlation from pg_stats where tablename = 'events' and attname = 'created_at') > 0.99
  and (select abs(correlation) from pg_stats
       where tablename = 'events_shuffled' and attname = 'created_at') < 0.05);

-- The access path chosen for "the last N minutes" of a table.
create function path_at(tbl text, mins int) returns text language sql as $$
  select scan_node(format('select * from %I where created_at >= %L', tbl,
         current_setting('plans.t_end')::timestamptz - make_interval(mins => mins))) $$;

create function rows_at(tbl text, mins int) returns numeric language sql as $$
  select lab.est_rows(format('select * from %I where created_at >= %L', tbl,
         current_setting('plans.t_end')::timestamptz - make_interval(mins => mins))) $$;

-- Binary search for the window width where the plan changes. Returns the last
-- width (minutes) that kept the first plan.
create function flip(tbl text, lo int, hi int) returns int language plpgsql as $$
declare first text := path_at(tbl, lo); m int;
begin
  while hi - lo > 1 loop
    m := (lo + hi) / 2;
    if path_at(tbl, m) = first then lo := m; else hi := m; end if;
  end loop;
  return lo;
end $$;

set enable_bitmapscan = off;
select lab.prove('the same one-day index scan costs over 20x more on the shuffled copy',
  est_cost(format('select * from events_shuffled where created_at >= %L',
           current_setting('plans.t_end')::timestamptz - interval '1 day'))
  > 20 * est_cost(format('select * from events where created_at >= %L',
           current_setting('plans.t_end')::timestamptz - interval '1 day')));
reset enable_bitmapscan;

select set_config('plans.flip_corr', flip('events', 1, 525600)::text, false),
       set_config('plans.flip_ib', flip('events_shuffled', 1, 600)::text, false),
       set_config('plans.flip_bs', flip('events_shuffled', 600, 525600)::text, false)
\g /dev/null

\echo The flips on your data (minutes, estimated rows):
select format('  correlated:  Index Scan up to %s min (%s rows), then %s',
              current_setting('plans.flip_corr'),
              rows_at('events', current_setting('plans.flip_corr')::int),
              path_at('events', current_setting('plans.flip_corr')::int + 1));
select format('  shuffled:    Index Scan up to %s min (%s rows), then %s',
              current_setting('plans.flip_ib'),
              rows_at('events_shuffled', current_setting('plans.flip_ib')::int),
              path_at('events_shuffled', current_setting('plans.flip_ib')::int + 1));
select format('  shuffled:    Bitmap Heap Scan up to %s min (%s rows), then %s',
              current_setting('plans.flip_bs'),
              rows_at('events_shuffled', current_setting('plans.flip_bs')::int),
              path_at('events_shuffled', current_setting('plans.flip_bs')::int + 1));

select lab.prove('correlated: the index scan holds until 50 to 80 percent of the table, then a seq scan',
  path_at('events', 60) = 'Index Scan'
  and path_at('events', current_setting('plans.flip_corr')::int + 1) = 'Seq Scan'
  and rows_at('events', current_setting('plans.flip_corr')::int)
      / (select reltuples from pg_class where relname = 'events') between 0.5 and 0.8);

select lab.prove('shuffled: index scan only for a handful of rows (under 100), then bitmap',
  path_at('events_shuffled', 1) = 'Index Scan'
  and path_at('events_shuffled', current_setting('plans.flip_ib')::int + 1) = 'Bitmap Heap Scan'
  and rows_at('events_shuffled', current_setting('plans.flip_ib')::int) < 100);

select lab.prove('shuffled: bitmap until 20 to 60 percent of the table, then a seq scan',
  path_at('events_shuffled', current_setting('plans.flip_bs')::int + 1) = 'Seq Scan'
  and rows_at('events_shuffled', current_setting('plans.flip_bs')::int)
      / (select reltuples from pg_class where relname = 'events_shuffled') between 0.2 and 0.6);

select lab.prove('count(*) over a range is an index-only scan with zero heap fetches',
  (select (p -> 'Plan' -> 'Plans' -> 0 ->> 'Node Type') = 'Index Only Scan'
      and (p -> 'Plan' -> 'Plans' -> 0 ->> 'Heap Fetches')::int = 0
   from lab.plan(format('select count(*) from events where created_at >= %L',
        current_setting('plans.t_end')::timestamptz - interval '7 days')) p));

\echo
\echo == Sorted output is a property of a path

select lab.prove('ORDER BY created_at DESC LIMIT 10 walks the index backward: no Sort, under 20 pages',
  lab.est_nodes($$ select id, kind, created_at from events
               order by created_at desc limit 10 $$) = '{Limit,Index Scan}'
  and lab.buffers($$ select id, kind, created_at from events
                     order by created_at desc limit 10 $$) < 20);

select lab.prove('ORDER BY kind, created_at DESC LIMIT 10 has no matching index: it reads the whole table',
  'Sort' = any(lab.est_nodes($$ select id, kind, created_at from events
                           order by kind, created_at desc limit 10 $$))
  and lab.buffers($$ select id, kind, created_at from events
                     order by kind, created_at desc limit 10 $$) > 30000);

select lab.prove('ORDER BY created_at DESC, kind LIMIT 10 uses an incremental sort on the index order',
  lab.est_nodes($$ select id, kind, created_at from events
               order by created_at desc, kind limit 10 $$)
    = '{Limit,Incremental Sort,Index Scan}'
  and lab.buffers($$ select id, kind, created_at from events
                     order by created_at desc, kind limit 10 $$) < 20);

\echo
\echo == Join search: dynamic programming, then GEQO

do $$ begin
  for i in 1..14 loop
    execute format('create table j%s (id int primary key, v int)', i);
    execute format('insert into j%s select g, g %% 10 from generate_series(1, 1000) g', i);
    execute format('analyze j%s', i);
  end loop;
end $$;

-- n tables joined on one key, as a comma list or as explicit JOINs.
create function join_sql(n int, style text) returns text language sql as $$
  select case when style = 'comma' then
    'select count(*) from ' || (select string_agg('j' || i, ', ' order by i) from generate_series(1, n) i)
    || ' where ' || (select string_agg(format('j%s.id = j%s.id', i - 1, i), ' and ' order by i)
                     from generate_series(2, n) i)
  else
    'select count(*) from j1' || (select string_agg(format(' join j%s on j%s.id = j%s.id', i, i, i - 1), '' order by i)
                                  from generate_series(2, n) i)
  end $$;

set geqo = off;
select set_config('plans.ms7', plan_ms(join_sql(7, 'comma'))::text, false),
       set_config('plans.ms11', plan_ms(join_sql(11, 'comma'))::text, false),
       set_config('plans.ms12', plan_ms(join_sql(12, 'comma'), 2)::text, false),
       set_config('plans.ms12j', plan_ms(join_sql(12, 'join'))::text, false)
\g /dev/null
reset geqo;
select set_config('plans.ms12g', plan_ms(join_sql(12, 'comma'))::text, false) \g /dev/null

\echo Planning time on your machine (ms):
select format('  7 tables exhaustive %s, 11 exhaustive %s, 12 exhaustive %s, 12 with GEQO %s, 12 as JOINs (limit 8) %s',
  current_setting('plans.ms7'), current_setting('plans.ms11'), current_setting('plans.ms12'),
  current_setting('plans.ms12g'), current_setting('plans.ms12j'));

select lab.prove('exhaustive planning time grows steeply: 11 tables take over 10x as long as 7',
  current_setting('plans.ms11')::numeric > 10 * current_setting('plans.ms7')::numeric);

select lab.prove('at 12 tables GEQO takes over, planning at least 3x faster than exhaustive search',
  current_setting('plans.ms12')::numeric > 3 * current_setting('plans.ms12g')::numeric);

select lab.prove('explicit JOINs past join_collapse_limit (8) are planned in pieces, far faster',
  current_setting('plans.ms12')::numeric > 5 * current_setting('plans.ms12j')::numeric);

select lab.prove('the defaults: join_collapse_limit = from_collapse_limit = 8, geqo_threshold = 12',
  current_setting('join_collapse_limit') = '8'
  and current_setting('from_collapse_limit') = '8'
  and current_setting('geqo_threshold') = '12');

\echo
\echo == Join methods: why each one wins

create index events_project_id_idx on events (project_id);
analyze projects;

select lab.prove('one account''s projects: a nested loop with a parameterized index probe',
  join_node($$ select count(e.payload) from projects p
              join events e on e.project_id = p.id where p.account_id = 42 $$) = 'Nested Loop'
  and lab.plan_text($$ select count(e.payload) from projects p
                   join events e on e.project_id = p.id where p.account_id = 42 $$)
      ~ 'Cond: \((p\.id = project_id|project_id = p\.id)\)');

create function nl_flip() returns int language plpgsql as $$
declare k int := 1;
begin
  while join_node(format('select count(e.payload) from projects p
         join events e on e.project_id = p.id where p.account_id <= %s', k)) = 'Nested Loop'
        and k < 1000 loop
    k := k + 1;
  end loop;
  return k;
end $$;
select set_config('plans.nl_flip', nl_flip()::text, false) \g /dev/null
select format('  nested loop up to account_id <= %s, hash join from %s (%s estimated events)',
  current_setting('plans.nl_flip')::int - 1, current_setting('plans.nl_flip'),
  lab.est_rows(format('select e.* from projects p join events e on e.project_id = p.id
                   where p.account_id <= %s', current_setting('plans.nl_flip'))));

select lab.prove('more outer rows flip it to a hash join, somewhere between 2 and 30 accounts',
  current_setting('plans.nl_flip')::int between 2 and 30
  and join_node($$ select count(e.payload) from projects p
                   join events e on e.project_id = p.id where p.account_id <= 50 $$) = 'Hash Join');

-- The hash join itself costs the same at 4 MB and 8 MB: the 100,000-user hash
-- fits in one batch either way (hash_mem_multiplier = 2 gives it 8 MB). What
-- moves is the Sort on top: two million wide joined rows, sorted after the join.
create function hj_cost(q text) returns numeric language sql as $$
  select (x ->> 'Total Cost')::numeric
  from jsonb_path_query(est(q), 'strict $.**') x
  where jsonb_typeof(x) = 'object' and x ->> 'Node Type' = 'Hash Join' limit 1 $$;

set work_mem = '4MB';
select lab.prove('at work_mem 4MB, events x users ORDER BY user_id is a merge join',
  join_node($$ select e.kind, u.email from events e join users u on u.id = e.user_id
              order by e.user_id $$) = 'Merge Join');
select set_config('plans.merge_cost', est_cost($$ select e.kind, u.email from events e
       join users u on u.id = e.user_id order by e.user_id $$)::text, false) \g /dev/null
set enable_mergejoin = off;
select set_config('plans.hj4', hj_cost($$ select e.kind, u.email from events e
       join users u on u.id = e.user_id order by e.user_id $$)::text, false),
       set_config('plans.hashsort4', est_cost($$ select e.kind, u.email from events e
       join users u on u.id = e.user_id order by e.user_id $$)::text, false) \g /dev/null
select lab.prove('at 4MB the rejected hash join plus sort costs more than the merge join',
  join_node($$ select e.kind, u.email from events e join users u on u.id = e.user_id
              order by e.user_id $$) = 'Hash Join'
  and current_setting('plans.hashsort4')::numeric
      > current_setting('plans.merge_cost')::numeric);
reset enable_mergejoin;
set work_mem = '8MB';
select lab.prove('at work_mem 8MB the same query becomes a hash join plus a sort',
  join_node($$ select e.kind, u.email from events e join users u on u.id = e.user_id
              order by e.user_id $$) = 'Hash Join');
select lab.prove('the hash join costs the same at 4MB and 8MB; only the sort above it got cheaper',
  hj_cost($$ select e.kind, u.email from events e join users u on u.id = e.user_id
             order by e.user_id $$) = current_setting('plans.hj4')::numeric
  and est_cost($$ select e.kind, u.email from events e join users u on u.id = e.user_id
                  order by e.user_id $$) < current_setting('plans.hashsort4')::numeric);
reset work_mem;

set work_mem = '64kB';
select lab.prove('without ORDER BY it is a hash join even at work_mem 64kB',
  join_node($$ select e.kind, u.email from events e join users u on u.id = e.user_id $$)
    = 'Hash Join');
reset work_mem;

select lab.prove('a LATERAL lookup with repeated keys gets a Memoize cache with more hits than misses',
  (with recursive walk(node) as (
     select p -> 'Plan' from lab.plan($$ select p.id, x.n from projects p
       cross join lateral (select count(*) n from users u where u.account_id = p.account_id) x
       where p.archived_at is not null $$) p
     union all
     select c from walk, jsonb_array_elements(coalesce(walk.node -> 'Plans', '[]')) c)
   select (node ->> 'Cache Hits')::int > (node ->> 'Cache Misses')::int
   from walk where node ->> 'Node Type' = 'Memoize'));

select set_config('plans.memo_buf', lab.buffers($$ select p.id, x.n from projects p
       cross join lateral (select count(*) n from users u where u.account_id = p.account_id) x
       where p.archived_at is not null $$)::text, false) \g /dev/null
set enable_memoize = off;
select lab.prove('without Memoize the same query touches at least 2x the pages',
  lab.buffers($$ select p.id, x.n from projects p
       cross join lateral (select count(*) n from users u where u.account_id = p.account_id) x
       where p.archived_at is not null $$) > 2 * current_setting('plans.memo_buf')::numeric);
reset enable_memoize;

\echo
\echo == Parallel plans

create table ev_70k  as select * from events where id <= 70000;
create table ev_200k as select * from events where id <= 200000;
create table ev_600k as select * from events where id <= 600000;
analyze ev_70k, ev_200k, ev_600k;

reset max_parallel_workers_per_gather;
select lab.prove('by default a big scan plans 2 workers (the max_parallel_workers_per_gather cap)',
  workers($$ select count(*) from events where kind = 'alert' $$) = 2);
select lab.prove('by default a 10 MB table gets no parallel plan (parallel_setup_cost = 1000)',
  workers($$ select count(*) from ev_70k where kind = 'alert' $$) is null);

set max_parallel_workers_per_gather = 8;
set parallel_setup_cost = 0;
set parallel_tuple_cost = 0;
select lab.prove('workers grow with table size: one more each time the table triples past 8 MB',
  (select relpages from pg_class where relname = 'ev_70k') between 1024 and 3071
  and (select relpages from pg_class where relname = 'ev_200k') between 3072 and 9215
  and (select relpages from pg_class where relname = 'ev_600k') between 9216 and 27647
  and (select relpages from pg_class where relname = 'events') between 27648 and 82943
  and workers($$ select count(*) from ev_70k  where kind = 'alert' $$) = 1
  and workers($$ select count(*) from ev_200k where kind = 'alert' $$) = 2
  and workers($$ select count(*) from ev_600k where kind = 'alert' $$) = 3
  and workers($$ select count(*) from events  where kind = 'alert' $$) = 4);
select lab.prove('under 8 MB (projects, 191 pages) no parallel plan at all',
  workers($$ select count(*) from projects where name like 'P%' $$) is null);
alter table events set (parallel_workers = 6);
select lab.prove('the parallel_workers storage parameter overrides the size rule',
  workers($$ select count(*) from events where kind = 'alert' $$) = 6);
alter table events reset (parallel_workers);
reset parallel_setup_cost;
reset parallel_tuple_cost;
set max_parallel_workers_per_gather = 2;

create function is_slow(p jsonb) returns boolean language plpgsql immutable
  as $$ begin return (p ->> 'duration_ms')::int > 4000; end $$;

select lab.prove('user functions are PARALLEL UNSAFE by default',
  (select proparallel from pg_proc where proname = 'is_slow') = 'u');
select lab.prove('one unsafe function in WHERE and the query gets no parallel plan',
  workers($$ select count(*) from events where is_slow(payload) $$) is null);
select lab.prove('at the default COST 100 per call, that scan is priced over 500,000 (full JIT territory)',
  (select procost from pg_proc where proname = 'is_slow') = 100
  and est_cost($$ select count(*) from events where is_slow(payload) $$) > 500000);
alter function is_slow(jsonb) parallel safe;
select lab.prove('marked PARALLEL SAFE, the same query plans 2 workers',
  workers($$ select count(*) from events where is_slow(payload) $$) = 2);

create function is_slow_sql(p jsonb) returns boolean language sql immutable
  as $$ select (p ->> 'duration_ms')::int > 4000 $$;
select lab.prove('even an inlined SQL function blocks parallelism while marked unsafe',
  workers($$ select count(*) from events where is_slow_sql(payload) $$) is null
  and workers($$ select count(*) from events
                 where (payload ->> 'duration_ms')::int > 4000 $$) = 2);

select lab.prove('SELECT ... FOR UPDATE never plans parallel',
  workers($$ select * from events where kind = 'alert' for update $$) is null);
select lab.prove('random() is parallel restricted: that scan stays in the leader',
  workers($$ select count(*) from events where kind = 'alert' and random() < 0.5 $$) is null);

\echo
\echo == JIT

set max_parallel_workers_per_gather = 0;
set jit = on;
select lab.prove('the kind report costs just over jit_above_cost (100,000) and gets JIT',
  est_cost($$ select kind, count(*), avg((payload ->> 'duration_ms')::int),
                     count(*) filter (where payload ->> 'status' = 'failed')
              from events group by kind $$) between 100000 and 105000
  and est($$ select kind, count(*), avg((payload ->> 'duration_ms')::int),
                    count(*) filter (where payload ->> 'status' = 'failed')
             from events group by kind $$) ? 'JIT');

select lab.prove('drop one aggregate, the cost falls under 100,000 and JIT is off',
  est_cost($$ select kind, count(*), avg((payload ->> 'duration_ms')::int)
              from events group by kind $$) < 100000
  and not est($$ select kind, count(*), avg((payload ->> 'duration_ms')::int)
                 from events group by kind $$) ? 'JIT');

select set_config('plans.jit_basic', (lab.plan($$ select kind, count(*), avg((payload ->> 'duration_ms')::int),
         count(*) filter (where payload ->> 'status' = 'failed') from events group by kind $$)
         -> 'JIT' -> 'Timing' ->> 'Total')::text, false) \g /dev/null
select lab.prove('below 500,000, JIT compiles without inlining or optimization',
  (est($$ select kind, count(*), avg((payload ->> 'duration_ms')::int),
                 count(*) filter (where payload ->> 'status' = 'failed')
          from events group by kind $$) -> 'JIT' -> 'Options' ->> 'Inlining') = 'false');

set jit_inline_above_cost = 0;
set jit_optimize_above_cost = 0;
select set_config('plans.jit_full', (lab.plan($$ select kind, count(*), avg((payload ->> 'duration_ms')::int),
         count(*) filter (where payload ->> 'status' = 'failed') from events group by kind $$)
         -> 'JIT' -> 'Timing' ->> 'Total')::text, false) \g /dev/null
select format('  JIT compile time on your machine: %s ms basic, %s ms with inlining and optimization',
  round(current_setting('plans.jit_basic')::numeric, 1), round(current_setting('plans.jit_full')::numeric, 1));
select lab.prove('with inlining and optimization on, compiling takes over 10x longer',
  current_setting('plans.jit_full')::numeric > 10 * current_setting('plans.jit_basic')::numeric);
reset jit_inline_above_cost;
reset jit_optimize_above_cost;
set jit = off;

\echo
\echo == When the plan is wrong

set enable_seqscan = off;
select lab.prove('PostgreSQL 18 marks a forced disabled node instead of adding a huge cost',
  lab.plan_text($$ select count(*) from ev_70k where kind = 'alert' $$) like '%Disabled: true%'
  and est_cost($$ select count(*) from ev_70k where kind = 'alert' $$) < 10000);
reset enable_seqscan;

load 'auto_explain';
set auto_explain.log_min_duration = '100ms';
select lab.prove('auto_explain can be loaded for one session and logs plans over a threshold',
  current_setting('auto_explain.log_min_duration') = '100ms');

drop table events_shuffled, ev_70k, ev_200k, ev_600k;
