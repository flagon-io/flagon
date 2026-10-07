-- Lab for "The planner is guessing"
-- https://www.flagon.io/books/eight-kilobytes/planner
-- Run: ./lab 19-planner
--
-- Every row estimate below is read from EXPLAIN's 'Plan Rows' and compared
-- with 'Actual Rows' from EXPLAIN ANALYZE. ANALYZE samples randomly, so the
-- checks use ranges, not exact numbers.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;

-- The seed spaces 2,000,000 events evenly over the year before 2026-10-06,
-- so the date windows below are the same literal dates the chapter uses.

\echo
\echo '== The planner is a cost calculator'

select lab.prove(
  'a sequential scan costs relpages x seq_page_cost + reltuples x cpu_tuple_cost',
  abs((lab.estimate('select * from events') ->> 'Total Cost')::numeric
      - (select relpages * 1.0 + reltuples::numeric * 0.01
         from pg_class where relname = 'events')) < 0.1);

select lab.prove(
  'a filter adds one cpu_operator_cost (0.0025) per row',
  abs((lab.estimate($$ select * from events where kind = 'deploy' $$) ->> 'Total Cost')::numeric
      - (select relpages * 1.0 + reltuples::numeric * (0.01 + 0.0025)
         from pg_class where relname = 'events')) < 0.1);

select lab.prove(
  'the cost defaults are 1, 4, 0.01, 0.005, 0.0025',
  (select array_agg(setting order by name) from pg_settings
   where name in ('seq_page_cost', 'random_page_cost', 'cpu_tuple_cost',
                  'cpu_index_tuple_cost', 'cpu_operator_cost'))
  = array['0.005', '0.0025', '0.01', '4', '1']);

\echo
\echo '== What the planner knows: pg_stats'

select lab.prove(
  'archived_at is null on 80.445% of projects, and ANALYZE recorded exactly that',
  (select null_frac from pg_stats
   where tablename = 'projects' and attname = 'archived_at')::numeric = 0.80445
  and (select count(*) filter (where archived_at is null) from projects) = 16089);

select lab.prove(
  'kind has 5 distinct values',
  (select n_distinct from pg_stats where tablename = 'events' and attname = 'kind') = 5);

select lab.prove(
  'the kind = ''deploy'' estimate is its MCV frequency times the row count',
  abs((lab.estimate($$ select * from events where kind = 'deploy' $$) ->> 'Plan Rows')::numeric
      - (select most_common_freqs[array_position(most_common_vals::text::text[], 'deploy')]
                * (select reltuples from pg_class where relname = 'events')
         from pg_stats where tablename = 'events' and attname = 'kind')) < 2);

select lab.prove(
  'created_at has 101 histogram bounds (100 buckets)',
  (select array_length(histogram_bounds::text::text[], 1) from pg_stats
   where tablename = 'events' and attname = 'created_at') = 101);

select lab.prove(
  'created_at and id are perfectly correlated with physical order; account_id is not',
  (select correlation from pg_stats where tablename = 'events' and attname = 'created_at') = 1
  and (select correlation from pg_stats where tablename = 'events' and attname = 'id') = 1
  and (select abs(correlation) from pg_stats where tablename = 'events' and attname = 'account_id') < 0.05);

\echo
\echo '== Do the planner''s arithmetic by hand'

create temp table s as
select st.most_common_vals::text::bigint[] as mcv,
       st.most_common_freqs as freqs,
       st.null_frac, st.n_distinct,
       c.reltuples
from pg_stats st, pg_class c
where st.tablename = 'events' and st.attname = 'account_id' and c.relname = 'events';

select lab.prove('equality on an MCV value: rows = its frequency x reltuples',
  abs(lab.est_rows(format('select * from events where account_id = %s', mcv[1]))
      - round(freqs[1] * reltuples)) <= 1)
from s;

select lab.prove('equality on a non-MCV value: (1 - sum(freqs) - null_frac) / (n_distinct - #MCVs)',
  abs(lab.est_rows(format('select * from events where account_id = %s',
        (select min(g) from generate_series(1, 1000) g where g <> all (mcv))))
      - round((1 - (select sum(f) from unnest(freqs) f) - null_frac)
              / (n_distinct - cardinality(mcv)) * reltuples)) <= 1)
from s;

-- Histogram interpolation: the fraction of rows below x is
-- (whole buckets below + the fraction of x's bucket) / number of buckets.
create function hist_frac(x timestamptz) returns float8 language sql as $$
  with h as (select histogram_bounds::text::timestamptz[] b from pg_stats
             where tablename = 'events' and attname = 'created_at'),
       k as (select b, (select max(i) from generate_subscripts(b, 1) i where b[i] <= x) i
             from h)
  select ((i - 1) + extract(epoch from x - b[i]) / extract(epoch from b[i + 1] - b[i]))
         / (cardinality(b) - 1)
  from k $$;

select set_config('plans.week_a', ((select min(created_at) from events) + interval '177 days')::text, false),
       set_config('plans.week_b', ((select min(created_at) from events) + interval '184 days')::text, false)
\g /dev/null

select lab.prove('a one-week range: rows = (frac(b) - frac(a)) x reltuples, from the histogram',
  abs(lab.est_rows(format('select * from events where created_at >= %L and created_at < %L',
                      current_setting('plans.week_a'), current_setting('plans.week_b')))
      - (hist_frac(current_setting('plans.week_b')::timestamptz)
         - hist_frac(current_setting('plans.week_a')::timestamptz))
        * (select reltuples from pg_class where relname = 'events'))
  < 2);

select lab.prove('the histogram estimate for the week is within 15% of the real count',
  abs(lab.est_rows(format('select * from events where created_at >= %L and created_at < %L',
                      current_setting('plans.week_a'), current_setting('plans.week_b')))
      / (select count(*) from events
         where created_at >= current_setting('plans.week_a')::timestamptz
           and created_at <  current_setting('plans.week_b')::timestamptz) - 1)
  < 0.15);

select lab.prove('join rows = outer rows x inner rows / max(n_distinct): events x enterprise accounts',
  abs(lab.est_rows($$ select * from events e join accounts a on a.id = e.account_id
                  where a.plan = 'enterprise' $$)
      / ((select reltuples from pg_class where relname = 'events')
         * lab.est_rows($$ select * from accounts where plan = 'enterprise' $$) / 1000) - 1)
  < 0.01);

create index events_created_at_idx on events (created_at);
create index events_account_id_idx on events (account_id);
create index events_project_id_idx on events (project_id);
vacuum analyze events;

select lab.prove(
  'a one-week range estimate from the histogram is within 10% of the actual 38,356 rows',
  (select (p -> 'Plan' -> 'Plans' -> 0 ->> 'Plan Rows')::numeric
          / (p -> 'Plan' -> 'Plans' -> 0 ->> 'Actual Rows')::numeric
   from lab.plan($$ select count(*) from events
                    where created_at >= '2026-09-01' and created_at < '2026-09-08' $$) p)
  between 0.9 and 1.1
  and (select count(*) from events
       where created_at >= '2026-09-01' and created_at < '2026-09-08') = 38356);

select lab.prove(
  'about 20,000 rows by created_at: a plain Index Scan',
  lab.estimate($$ select * from events
                  where created_at >= '2026-09-01' and created_at < '2026-09-04 12:00' $$)
    ->> 'Node Type' = 'Index Scan');

select lab.prove(
  'about 20,000 rows by account_id: a Bitmap Heap Scan',
  lab.estimate($$ select * from events where account_id between 100 and 109 $$)
    ->> 'Node Type' = 'Bitmap Heap Scan');

select lab.prove(
  'same row count, roughly a 35x difference in cost, from correlation alone',
  ((lab.estimate($$ select * from events where account_id between 100 and 109 $$) ->> 'Total Cost')::numeric
   / (lab.estimate($$ select * from events
                      where created_at >= '2026-09-01' and created_at < '2026-09-04 12:00' $$)
      ->> 'Total Cost')::numeric) between 25 and 40);

\echo
\echo '== ANALYZE reads a sample, not the table'

alter table events alter column account_id set statistics 1000;
analyze events;

select lab.prove(
  'with a statistics target of 1000, all 1,000 accounts get their own MCV entry',
  (select array_length(most_common_vals::text::text[], 1) from pg_stats
   where tablename = 'events' and attname = 'account_id') = 1000);

alter table events alter column account_id set statistics -1;
analyze events;

select lab.prove(
  'back at the default target of 100, the MCV list holds at most 100 values',
  (select coalesce(array_length(most_common_vals::text::text[], 1), 0) from pg_stats
   where tablename = 'events' and attname = 'account_id') <= 100);

\echo
\echo '== The planner assumes your columns are independent'

select lab.prove(
  'project 4242 belongs to account 696 and has 85 events',
  (select array_agg(distinct account_id) from events where project_id = 4242) = '{696}'
  and (select count(*) from events where project_id = 4242) = 85);

select lab.prove(
  'before extended statistics: estimated 1 row, actual 85',
  (select (p -> 'Plan' ->> 'Plan Rows')::numeric = 1
      and (p -> 'Plan' ->> 'Actual Rows')::numeric = 85
   from lab.plan($$ select * from events where account_id = 696 and project_id = 4242 $$) p));

select lab.prove(
  'each leaf estimate is close: about 100 for the project (85 actual), about 2,000 for the account (1,961 actual)',
  (select (lab.find_node(p -> 'Plan', 'BitmapAnd') -> 'Plans' -> 0 ->> 'Plan Rows')::numeric between 70 and 130
      and (lab.find_node(p -> 'Plan', 'BitmapAnd') -> 'Plans' -> 1 ->> 'Plan Rows')::numeric between 1700 and 2300
      and (lab.find_node(p -> 'Plan', 'BitmapAnd') -> 'Plans' -> 1 ->> 'Actual Rows')::numeric = 1961
   from lab.plan($$ select * from events where account_id = 696 and project_id = 4242 $$) p));

select lab.prove(
  'before extended statistics: GROUP BY over both columns is estimated at about 200,000 groups, actual 20,000',
  (select (p -> 'Plan' ->> 'Plan Rows')::numeric between 150000 and 250000
      and (p -> 'Plan' ->> 'Actual Rows')::numeric = 20000
   from lab.plan($$ select account_id, project_id, count(*) from events group by 1, 2 $$) p));

create statistics events_account_project (dependencies, ndistinct)
  on account_id, project_id from events;
analyze events;

select lab.prove(
  'pg_stats_ext records that project_id determines account_id with degree 1.0',
  (select dependencies::text from pg_stats_ext
   where statistics_name = 'events_account_project') = '{"3 => 2": 1.000000}');

select lab.prove(
  'after extended statistics: estimated about 100 rows, actual 85',
  (select (p -> 'Plan' ->> 'Plan Rows')::numeric between 60 and 140
      and (p -> 'Plan' ->> 'Actual Rows')::numeric = 85
   from lab.plan($$ select * from events where account_id = 696 and project_id = 4242 $$) p));

select lab.prove(
  'after extended statistics: the GROUP BY estimate is within 10% of the 20,000 actual groups',
  (select (p -> 'Plan' ->> 'Plan Rows')::numeric between 18000 and 22000
   from lab.plan($$ select account_id, project_id, count(*) from events group by 1, 2 $$) p));

\echo
\echo '== MCV lists for combinations'

select setseed(0.15) \g /dev/null
create table event_outcomes as
select id, kind,
       case when kind = 'alert'
            then (case when random() < 0.95 then 'failed' else 'ok' end)
            else (case when random() < 0.05 then 'failed' else 'ok' end)
       end as status
from events;
analyze event_outcomes;

select lab.prove(
  'about 16% of rows are failed overall',
  (select avg((status = 'failed')::int) from event_outcomes) between 0.15 and 0.17);

select lab.prove(
  'before MCV statistics: failed alerts are underestimated more than 4x',
  (select (n ->> 'Actual Rows')::numeric / (n ->> 'Plan Rows')::numeric > 4
   from lab.plan($$ select count(*) from event_outcomes
                    where kind = 'alert' and status = 'failed' $$) p,
        lab.find_node(p -> 'Plan', 'Seq Scan') n));

select lab.prove(
  'before MCV statistics: failed builds are overestimated more than 2.5x',
  (select (n ->> 'Plan Rows')::numeric / (n ->> 'Actual Rows')::numeric > 2.5
   from lab.plan($$ select count(*) from event_outcomes
                    where kind = 'build' and status = 'failed' $$) p,
        lab.find_node(p -> 'Plan', 'Seq Scan') n));

create statistics event_outcomes_kind_status (mcv) on kind, status from event_outcomes;
analyze event_outcomes;

select lab.prove(
  'after MCV statistics: both estimates land close to the actual counts',
  (select bool_and((n ->> 'Plan Rows')::numeric / (n ->> 'Actual Rows')::numeric between 0.8 and 1.25)
   from (values ('alert'), ('build')) k(kind),
        lab.plan(format($$ select count(*) from event_outcomes
                           where kind = %L and status = 'failed' $$, k.kind)) p,
        lab.find_node(p -> 'Plan', 'Seq Scan') n));

select lab.prove(
  'the stored MCV list shows {alert,failed} about 6x more frequent than independence predicts',
  (select m.frequency / m.base_frequency between 4 and 8
   from pg_statistic_ext s
   join pg_statistic_ext_data d on d.stxoid = s.oid,
        pg_mcv_list_items(d.stxdmcv) m
   where s.stxname = 'event_outcomes_kind_status' and m.values = '{alert,failed}'));

\echo
\echo '== Functions hide your statistics'

select lab.prove(
  'an expression compared with = is estimated at 0.5% of the table',
  (select bool_and(abs((lab.estimate(q) ->> 'Plan Rows')::numeric
                       - 0.005 * (select reltuples from pg_class where relname = 'events')) < 10)
   from (values ($$ select * from events where payload ->> 'status' = 'failed' $$),
                ($$ select * from events where lower(kind) = 'deploy' $$)) v(q)));

select lab.prove(
  'an expression compared with > is estimated at one third of the table',
  abs((lab.estimate($$ select * from events where (payload ->> 'duration_ms')::int > 4000 $$)
       ->> 'Plan Rows')::numeric
      - (select reltuples / 3 from pg_class where relname = 'events')) < 10);

select lab.prove(
  'the real counts: 500,420 failed, 499,992 deploys, 400,064 over 4000 ms',
  (select count(*) from events where payload ->> 'status' = 'failed') = 500420
  and (select count(*) from events where lower(kind) = 'deploy') = 499992
  and (select count(*) from events where (payload ->> 'duration_ms')::int > 4000) = 400064);

create statistics events_status_stats on (payload ->> 'status') from events;
analyze events;

select lab.prove(
  'with expression statistics the estimate is within 5% of the 500,420 actual',
  (lab.estimate($$ select * from events where payload ->> 'status' = 'failed' $$)
     ->> 'Plan Rows')::numeric between 475000 and 525000);

\echo
\echo '== Set-returning functions'

create function recent_projects_plpgsql(acct bigint) returns setof projects
language plpgsql stable as $$
begin
  return query
    select * from projects
    where account_id = acct and created_at > now() - interval '30 days';
end
$$;

create function recent_projects(acct bigint) returns setof projects
language sql stable as $$
  select * from projects
  where account_id = acct and created_at > now() - interval '30 days'
$$;

select lab.prove(
  'a PL/pgSQL set-returning function is estimated at 1,000 rows',
  (select n ->> 'Node Type' = 'Function Scan' and (n ->> 'Plan Rows')::int = 1000
   from lab.estimate('select * from recent_projects_plpgsql(42)') n));

select lab.prove(
  'a single-statement SQL function is inlined: a Seq Scan on projects, not a Function Scan',
  (select n ->> 'Node Type' = 'Seq Scan' and n ->> 'Relation Name' = 'projects'
   from lab.estimate('select * from recent_projects(42)') n));

select lab.prove(
  'generate_series(1, 50) is estimated at exactly 50 rows',
  (lab.estimate('select * from generate_series(1, 50)') ->> 'Plan Rows')::int = 50);

alter function recent_projects_plpgsql(bigint) rows 5;

select lab.prove(
  'ALTER FUNCTION ... ROWS 5 changes the estimate to 5',
  (lab.estimate('select * from recent_projects_plpgsql(42)') ->> 'Plan Rows')::int = 5);

\echo
\echo '== Prepared statements switch plans after five runs'

insert into events (account_id, project_id, user_id, kind, payload, created_at)
select p.account_id, p.id, p.owner_id, 'incident', '{"status": "failed"}',
       timestamptz '2026-10-06' - interval '300 days' - g * interval '1 day'
from generate_series(1, 20) g
join projects p on p.id = g * 100;

create index events_kind_idx on events (kind);
vacuum analyze events;

prepare latest(text) as
  select id, created_at from events
  where kind = $1
  order by created_at desc
  limit 10;

select lab.prove(
  'custom plan for incident: the kind index plus a sort, under 50 pages',
  (select lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Index Name' = 'events_kind_idx'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 50
   from lab.plan($$ execute latest('incident') $$) p));

select lab.prove(
  'custom plan for build: walk created_at backward, under 20 pages',
  (select lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Index Name' = 'events_created_at_idx'
      and (lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Scan Direction') = 'Backward'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 20
   from lab.plan($$ execute latest('build') $$) p));

-- three more custom-planned runs: five in all
select lab.buffers($$ execute latest('build') $$) >= 0 from generate_series(1, 3) \g /dev/null

select lab.prove(
  'after five executions: five custom plans, no generic plan yet',
  (select (generic_plans, custom_plans) = (0::bigint, 5::bigint)
   from pg_prepared_statements where name = 'latest'));

select lab.buffers($$ execute latest('build') $$) \g /dev/null

select lab.prove(
  'the sixth execution switches to the generic plan',
  (select (generic_plans, custom_plans) = (1::bigint, 5::bigint)
   from pg_prepared_statements where name = 'latest'));

select lab.prove(
  'the generic plan for incident filters on $1 and reads over 30,000 pages',
  (select lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Filter' = '(kind = $1)'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int > 30000
   from lab.plan($$ execute latest('incident') $$) p));

select lab.prove(
  'the generic plan expects a fifth or a sixth of the table to match kind = $1',
  (select (lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Plan Rows')::numeric between 300000 and 420000
   from lab.plan($$ execute latest('incident') $$) p));

set plan_cache_mode = force_custom_plan;

select lab.prove(
  'force_custom_plan brings incident back to the kind index and a few dozen pages',
  (select lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Index Name' = 'events_kind_idx'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 50
   from lab.plan($$ execute latest('incident') $$) p));

reset plan_cache_mode;
deallocate latest;

\echo
\echo '== Join order'

select lab.prove(
  'the collapse and GEQO defaults are 8, 8, and 12',
  (select array_agg(setting order by name) from pg_settings
   where name in ('from_collapse_limit', 'geqo_threshold', 'join_collapse_limit'))
  = array['8', '12', '8']);

select lab.prove(
  '3,460 projects belong to enterprise accounts',
  (select count(*) from projects p join accounts a on a.id = p.account_id
   where a.plan = 'enterprise') = 3460);

select lab.prove(
  'by default the planner joins projects to accounts first, then to events',
  (select lab.find_node(p, 'Hash Join') ->> 'Hash Cond' = '(e.project_id = p.id)'
   from lab.estimate($$ select a.name, count(*)
                        from events e
                        join projects p on p.id = e.project_id
                        join accounts a on a.id = p.account_id
                        where a.plan = 'enterprise'
                          and e.created_at >= '2026-10-05'
                        group by a.name $$) p));

set join_collapse_limit = 1;

select lab.prove(
  'with join_collapse_limit = 1 it follows the written order: events to projects first',
  (select lab.find_node(p, 'Hash Join') ->> 'Hash Cond' = '(p.account_id = a.id)'
   from lab.estimate($$ select a.name, count(*)
                        from events e
                        join projects p on p.id = e.project_id
                        join accounts a on a.id = p.account_id
                        where a.plan = 'enterprise'
                          and e.created_at >= '2026-10-05'
                        group by a.name $$) p));

reset join_collapse_limit;

\echo
\echo '== No hints, and what to do instead'

select lab.prove(
  'a hint comment is ignored: the query runs and the plan is unchanged',
  lab.estimate($$ /*+ IndexScan(events events_kind_idx) */ select * from events where account_id = 696 $$)
    = lab.estimate($$ select * from events where account_id = 696 $$));

drop statistics events_account_project;
analyze events;
set enable_bitmapscan = off;

select lab.prove(
  'with enable_bitmapscan off, EXPLAIN shows the rejected plan: an Index Scan on project_id with account_id as a filter',
  (select n ->> 'Node Type' = 'Index Scan'
      and n ->> 'Index Name' = 'events_project_id_idx'
      and n ->> 'Filter' = '(account_id = 696)'
   from lab.estimate($$ select * from events where account_id = 696 and project_id = 4242 $$) n));

reset enable_bitmapscan;
set enable_seqscan = off;

select lab.prove(
  'with enable_seqscan off and no usable index, the planner still scans the table at its normal cost and marks the node Disabled',
  (select n ->> 'Node Type' = 'Seq Scan'
      and (n ->> 'Disabled')::boolean
      and (n ->> 'Total Cost')::numeric < 100
   from lab.estimate($$ select * from accounts where name like '%x%' $$) n));

reset enable_seqscan;
