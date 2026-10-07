-- Lab for "Fix the work, then the box"
-- https://www.flagon.io/books/eight-kilobytes/playbook
-- Run: ./lab 35-playbook
--
-- The whole book in one experiment. A small app's workload (an account
-- dashboard, an activity feed paged with OFFSET, a projects page with an N+1
-- loop, and an ingest endpoint that bumps a counter) runs under pgbench with
-- a fixed random seed, so every run sends the same requests. Then the
-- playbook's levers go in one at a time, in the playbook's order, and the
-- same workload runs again after each one. pg_stat_statements counts the
-- pages each endpoint touched; pgbench reports throughput.
--
-- Pages are what the checks prove. Throughput belongs to your machine, so
-- the checks prove only its direction, with wide margins, using the median
-- of three runs per step.
--
-- The workload scripts are in workload/playbook/. The lab's database runs
-- with synchronous_commit = off so that a laptop's slow fsync (tens of
-- milliseconds per commit inside Docker Desktop) doesn't drown every other
-- cost; it changes how long a commit waits, not how many pages anything
-- touches. Takes two and a half to four minutes.

\pset tuples_only on
\pset format unaligned
\setenv PGDATABASE :DBNAME

\echo
\echo '== Setup: the app''s schema and the measuring kit'

-- The ingest endpoint keeps a per-project counter. A constant default is a
-- catalog-only change: no rewrite.
alter table projects
  add column event_count   bigint not null default 0,
  add column last_event_at timestamptz;

alter database :"DBNAME" set synchronous_commit = off;

create schema pb;

-- pgbench's report, one line per row.
create table pb.out (n int generated always as identity, line text);

-- One row per step of the experiment.
create table pb.steps (
  step        int primary key,
  name        text not null,
  txns        int,         -- transactions pgbench completed, all runs
  failed      int,
  tps         numeric,     -- median throughput of the runs, on this machine
  dash        numeric,     -- pages per call, per endpoint
  feed        numeric,
  proj        numeric,
  ingest      numeric,
  proj_stmts  numeric,     -- statements per projects page
  proj_ms     numeric,     -- projects page latency, ms, mean of the runs
  conn_ms     numeric,     -- average connection time with -C, ms
  mix         numeric,     -- pages per transaction, 30/30/10/30 mix
  hot_pct     numeric,     -- HOT share of the counter updates
  cold        bigint       -- counter updates that weren't HOT
);

create table pb.before (upd bigint, hot bigint);

create view pb.stmts as
  select * from pg_stat_statements
  where dbid = (select oid from pg_database where datname = current_database());

-- Zero this database's statement statistics and remember the update counters.
create function pb.begin_step() returns void language plpgsql as $$
begin
  perform pg_stat_statements_reset(0, (select oid from pg_database where datname = current_database()), 0);
  perform pg_stat_clear_snapshot();
  delete from pb.before;
  insert into pb.before
    select n_tup_upd, n_tup_hot_upd from pg_stat_user_tables where relname = 'projects';
  truncate pb.out;
end $$;

-- Read pgbench's reports and pg_stat_statements into pb.steps.
create function pb.end_step(p_step int, p_name text) returns void language plpgsql as $$
declare
  s pb.steps;
  n_dash int; n_feed int; n_proj int; n_ingest int;
begin
  perform pg_sleep(1);              -- let the pgbench backends flush their statistics
  perform pg_stat_clear_snapshot();

  s.step := p_step;
  s.name := p_name;
  select sum(substring(line from 'actually processed: (\d+)/')::int) into s.txns
    from pb.out where line like 'number of transactions actually processed:%';
  select sum(substring(line from 'failed transactions: (\d+)')::int) into s.failed
    from pb.out where line like 'number of failed transactions:%';
  select percentile_disc(0.5) within group (order by substring(line from '^tps = ([0-9.]+)')::numeric)
    into s.tps
    from pb.out where line like 'tps = %';

  -- Transactions per script: the line two below "SQL script N: <file>".
  with scripts as (
    select substring(line from '/([a-z]+)[a-z0-9-]*\.pgbench') as endpoint,
           (select substring(o2.line from '^ - (\d+) transactions')::int
              from pb.out o2 where o2.n = o.n + 2) as txns
    from pb.out o where line like 'SQL script %'
  )
  select sum(txns) filter (where endpoint = 'dashboard'),
         sum(txns) filter (where endpoint = 'feed'),
         sum(txns) filter (where endpoint = 'projects'),
         sum(txns) filter (where endpoint = 'ingest')
    into n_dash, n_feed, n_proj, n_ingest
  from scripts;

  select round(avg(substring(line from 'average connection time = ([0-9.]+) ms')::numeric), 2)
    into s.conn_ms
    from pb.out where line like 'average connection time%';

  -- Latency of the projects script: four lines below its header.
  select round(avg(substring(o2.line from 'latency average = ([0-9.]+) ms')::numeric), 2)
    into s.proj_ms
    from pb.out o join pb.out o2 on o2.n = o.n + 5
   where o.line like 'SQL script %projects-%';

  -- Pages (shared hit + read) per call, per endpoint, by statement text.
  with t as (
    select case
             when query like '%created_at::date%' or query like '%from account_daily%' then 'dashboard'
             when query like '%order by created_at desc, id desc%' then 'feed'
             when query like '%from projects where account_id%'
               or query like '%from events where project_id = $1 order by created_at desc limit%'
               or query like '%left join lateral%' then 'projects'
             when query like 'insert into events%' or query like 'update projects%'
               or query in ('begin', 'commit') then 'ingest'
           end as endpoint,
           calls, shared_blks_hit + shared_blks_read as pages
    from pb.stmts
  )
  select round(sum(pages) filter (where endpoint = 'dashboard') / n_dash, 1),
         round(sum(pages) filter (where endpoint = 'feed') / n_feed, 1),
         round(sum(pages) filter (where endpoint = 'projects') / n_proj, 1),
         round(sum(pages) filter (where endpoint = 'ingest') / n_ingest, 1),
         round(sum(calls) filter (where endpoint = 'projects') / n_proj, 1)
    into s.dash, s.feed, s.proj, s.ingest, s.proj_stmts
  from t;

  -- The mix is 30% dashboard, 30% feed, 10% projects, 30% ingest by weight.
  s.mix := round(0.3 * s.dash + 0.3 * s.feed + 0.1 * s.proj + 0.3 * s.ingest, 1);

  select round(100.0 * (t.n_tup_hot_upd - b.hot) / nullif(t.n_tup_upd - b.upd, 0), 1),
         (t.n_tup_upd - b.upd) - (t.n_tup_hot_upd - b.hot)
    into s.hot_pct, s.cold
  from pg_stat_user_tables t, pb.before b
  where t.relname = 'projects';

  if coalesce(s.txns, 0) = 0 or s.failed <> 0
     or exists (select 1 from pb.out where line like '%error%') then
    raise exception 'pgbench did not finish step %: %', p_step,
      (select string_agg(line, ' / ') from (select line from pb.out order by n limit 8) l);
  end if;
  insert into pb.steps values (s.*);
end $$;

-- One workload run per step. Each step changes one of these variables (or
-- the schema), then runs the same command: RUNS runs of 4 clients doing TXNS
-- transactions each, picking scripts by weight 3:3:1:3 with seed 42.
\setenv W /lab/workload/playbook
\setenv DASH dashboard-cast
\setenv FEED feed-offset
\setenv PROJ projects-n-plus-1
\setenv CONNECT -C
\setenv TXNS 30
\setenv RUNS 1

\echo
\echo '== Step 0: the baseline'
\echo '   4 clients x 30 transactions, a new connection per transaction (-C)'

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(0, 'Baseline');

\echo
\echo '== Tuning first: the same baseline with configuration changed'

alter database :"DBNAME" set work_mem = '64MB';
alter database :"DBNAME" set random_page_cost = 1.1;
alter database :"DBNAME" set effective_cache_size = '8GB';
alter database :"DBNAME" set jit = off;
alter database :"DBNAME" set max_parallel_workers_per_gather = 4;

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(-1, 'Baseline, configuration tuned first');

alter database :"DBNAME" reset work_mem;
alter database :"DBNAME" reset random_page_cost;
alter database :"DBNAME" reset effective_cache_size;
alter database :"DBNAME" reset jit;
alter database :"DBNAME" reset max_parallel_workers_per_gather;

\echo
\echo '== Step 1: index the access paths'

create index events_account_created_idx on events (account_id, created_at, id);
create index events_project_created_idx on events (project_id, created_at);
create index projects_account_idx on projects (account_id);
\setenv TXNS 250

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(1, 'Indexes');

\echo
\echo '== Step 2: write the dashboard''s date range on the bare column'

\setenv DASH dashboard-range
\setenv TXNS 1000
\setenv RUNS 3

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(2, 'Sargable date range');

\echo
\echo '== Step 3: keyset pagination for the feed'

\setenv FEED feed-keyset

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(3, 'Keyset pagination');

\echo
\echo '== Step 4: leave room on the page so the counter update stays HOT'

alter table projects set (fillfactor = 90);
vacuum full projects;   -- rewrites the table at the new fillfactor; use pg_repack in production
analyze projects;

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(4, 'Fillfactor 90');

\echo
\echo '== Step 5: one query for the projects page instead of 21'

\setenv PROJ projects-lateral

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(5, 'N+1 to one query');

\echo
\echo '== Step 6: keep connections open (a pool) instead of one per transaction'

\setenv CONNECT

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(6, 'Pooled connections');

\echo
\echo '== Step 7: configuration (the same settings as "tuning first")'

alter database :"DBNAME" set work_mem = '64MB';
alter database :"DBNAME" set random_page_cost = 1.1;
alter database :"DBNAME" set effective_cache_size = '8GB';
alter database :"DBNAME" set jit = off;
alter database :"DBNAME" set max_parallel_workers_per_gather = 4;

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(7, 'Configuration');

\echo
\echo '== Step 8: read the dashboard from a daily rollup'

create table account_daily (
  account_id      bigint not null,
  day             date   not null,
  events          int    not null,
  failed_deploys  int    not null,
  primary key (account_id, day)
);
insert into account_daily
select account_id, created_at::date, count(*),
       count(*) filter (where kind = 'deploy' and payload->>'status' = 'failed')
from events
group by 1, 2
order by 2, 1;      -- day by day, the order an incremental refresh writes it
vacuum analyze account_daily;
\setenv DASH dashboard-rollup

checkpoint;
select pb.begin_step();
\! for r in $(seq $RUNS); do pgbench -n $CONNECT -c 4 -j 4 -t $TXNS --random-seed=42 -f $W/$DASH.pgbench@3 -f $W/$FEED.pgbench@3 -f $W/$PROJ.pgbench@1 -f $W/ingest.pgbench@3; done > /tmp/35-playbook.txt 2>&1
\copy pb.out (line) from '/tmp/35-playbook.txt'
select pb.end_step(8, 'Daily rollup');

\echo
\echo '== The results'
\pset tuples_only off
\pset format aligned
select step, name, txns, round(tps) as tps, mix as pages_per_txn, dash, feed, proj, ingest,
       proj_stmts, proj_ms, conn_ms, hot_pct, cold
from pb.steps order by step;
\pset tuples_only on
\pset format unaligned

-- Each step's numbers, as psql variables: :s0_mix, :s1_tps, :s8_dash, ...
\o /tmp/48-playbook-vars.sql
select format('\set s%s_%s %s', case when step < 0 then '_tuned' else step::text end, k, v)
from pb.steps, lateral (values ('mix', mix), ('tps', round(tps, 1)), ('dash', dash), ('feed', feed),
                               ('proj', proj), ('ingest', ingest), ('stmts', proj_stmts),
                               ('ms', proj_ms), ('cold', cold), ('hot', hot_pct)) as x(k, v);
\o
\i /tmp/48-playbook-vars.sql

\echo
\echo '== The baseline reads the table, over and over'

select lab.prove('every step ran all its transactions with none failed',
  (select bool_and(failed = 0) and min(txns) >= 120 from pb.steps));
select lab.prove('with no index, the dashboard and the feed each read the whole events table: over 35,000 pages a call',
  :s0_dash > 35000 and :s0_feed > 35000);
select lab.prove('the N+1 projects page sends 21 statements and reads over 700,000 pages',
  :s0_stmts = 21 and :s0_proj > 700000);
select lab.prove('the baseline mix averages over 80,000 pages per transaction',
  :s0_mix > 80000);

\echo
\echo '== Tuning first'

select lab.prove('tuning the configuration first leaves pages per transaction where they were (within 2%)',
  abs(:s_tuned_mix - :s0_mix) < 0.02 * :s0_mix);
select lab.prove('the indexes alone beat the tuned baseline''s throughput by more than 3x',
  :s1_tps > 3 * :s_tuned_tps);

\echo
\echo '== Step by step'

select lab.prove('step 1, indexes: pages per transaction fall more than 100x',
  :s1_mix * 100 < :s0_mix);
select lab.prove('step 1: throughput rises more than 5x',
  :s1_tps > 5 * :s0_tps);
select lab.prove('step 1: the dashboard still reads every event of the account (1,500 to 2,500 pages), because of the ::date cast',
  :s1_dash between 1500 and 2500);
select lab.prove('step 2, a bare-column range: the dashboard reads under 250 pages, 8x fewer',
  :s2_dash < 250 and :s2_dash * 8 < :s1_dash);
select lab.prove('step 2: throughput rises more than 2x',
  :s2_tps > 2 * :s1_tps);
select lab.prove('step 1 to 2: OFFSET pagination reads 200 to 300 pages for 20 rows',
  :s2_feed between 200 and 300);
select lab.prove('step 3, keyset: the feed reads under 30 pages, 8x fewer',
  :s3_feed < 30 and :s3_feed * 8 < :s2_feed);
select lab.prove('steps 0 to 3: over 100 counter updates went cold on packed pages',
  :s0_cold + :s1_cold + :s2_cold + :s3_cold > 100);
select lab.prove('step 4, fillfactor 90: over 99.5% of the counter updates are HOT',
  :s4_hot > 99.5);
select lab.prove('step 5, one lateral query: 1 statement instead of 21, the same pages within 10%',
  :s5_stmts = 1 and abs(:s5_proj - :s4_proj) < 0.1 * :s4_proj);
select lab.prove('step 5: the projects page got faster (mean latency below step 4''s)',
  :s5_ms < :s4_ms);
select lab.prove('step 6, pooled connections: throughput rises more than 3x',
  :s6_tps > 3 * :s5_tps);
select lab.prove('step 6: a warm session''s ingest touches under a third of the pages a fresh connection''s does',
  :s6_ingest * 3 < :s5_ingest);
select lab.prove('step 7, configuration: pages per transaction stay within 5%',
  abs(:s7_mix - :s6_mix) < 0.05 * :s6_mix);
select lab.prove('step 8, the rollup: the dashboard reads under 50 pages, over 3x fewer',
  :s8_dash < 50 and :s8_dash * 3 < :s7_dash);

\echo
\echo '== The same box, start to finish'

select lab.prove('pages per transaction fell more than 1,000x from the baseline',
  :s8_mix * 1000 < :s0_mix);
select lab.prove('throughput rose more than 100x on the same machine',
  :s8_tps > 100 * :s0_tps);
