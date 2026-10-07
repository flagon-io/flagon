-- Lab for "You don't need another database (yet)"
-- https://www.flagon.io/books/eight-kilobytes/models
-- Run: ./lab 14-models
--
-- Key-value with unlogged tables, documents in jsonb, trees three ways, BRIN
-- for time series, a SKIP LOCKED job queue with two real worker sessions
-- (via dblink), and full-text search. Every number the chapter quotes is a
-- check below.

\pset tuples_only on
\pset format unaligned

\echo
\echo '## Key-value is a primary key lookup'

create unlogged table kv_unlogged (
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null
);
create table kv_logged (
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null
);

select lab.wal_bytes($$
  insert into kv_logged
  select 'session:' || g, jsonb_build_object('user_id', g), now() + interval '1 hour'
  from generate_series(1, 200000) g $$) as logged_wal \gset

select lab.wal_bytes($$
  insert into kv_unlogged
  select 'session:' || g, jsonb_build_object('user_id', g), now() + interval '1 hour'
  from generate_series(1, 200000) g $$) as unlogged_wal \gset

vacuum analyze kv_unlogged;

select lab.prove(
  'a primary key lookup in a 200,000-row table touches 4 pages',
  lab.nodes($$ select value from kv_unlogged where key = 'session:4242' $$) = '{Index Scan}'
  and lab.buffers($$ select value from kv_unlogged where key = 'session:4242' $$) = 4);

\echo
\echo '## Unlogged tables'

select lab.prove(
  'inserting 200,000 sessions into a logged table writes about 41 MB of WAL',
  :logged_wal between 35e6 and 48e6);

select lab.prove(
  'the same insert into an unlogged table writes no WAL for the rows (under 64 kB, against 41 MB)',
  :unlogged_wal < 65536);

select lab.prove(
  'indexes on an unlogged table are unlogged too',
  (select relpersistence from pg_class where relname = 'kv_unlogged_pkey') = 'u');

select lab.prove(
  'an unlogged table has an init fork: the empty copy that replaces it after a crash',
  (pg_stat_file(pg_relation_filepath('kv_unlogged') || '_init')).size = 0
  and not exists (select 1 from pg_ls_dir(
        regexp_replace(pg_relation_filepath('kv_logged'), '/[^/]+$', '')) as f
      where f = regexp_replace(pg_relation_filepath('kv_logged'), '^.*/', '') || '_init'));

\echo
\echo '## Documents with jsonb'

select lab.prove(
  'events split about evenly over 5 regions, about 2,500 ms average duration',
  (select count(*) = 5 and min(n) > 395000 and max(n) < 405000
          and min(avg_ms) between 2490 and 2510 and max(avg_ms) between 2490 and 2510
   from (select payload->>'region' as region, count(*) as n,
                round(avg((payload->>'duration_ms')::int)) as avg_ms
         from events group by 1) r));

select lab.prove(
  'syd has 400,923 events',
  (select count(*) from events where payload->>'region' = 'syd') = 400923);

select lab.prove(
  'jsonb_path_query returns durations over 3000 for project 42: 4520, 4390, 3134',
  (select array_agg(v::int) from (select jsonb_path_query(payload, '$.duration_ms ? (@ > 3000)') as v
                                  from events where project_id = 42 limit 3) s)
    = '{4520,4390,3134}');

select lab.prove(
  '199,979 failed events took over 3000 ms (SQL/JSON path @?)',
  (select count(*) from events
   where payload @? '$ ? (@.status == "failed" && @.duration_ms > 3000)') = 199979);

\echo
\echo '## Indexing documents'

select lab.prove(
  'without an index, the containment query reads every page (35,173)',
  lab.buffers($$ select count(*) from events
                 where payload @> '{"status": "failed", "region": "iad"}' $$) between 35000 and 35400);

create index events_payload_gin on events using gin (payload jsonb_path_ops);

select lab.prove(
  'the jsonb_path_ops GIN index is about 14 MB for 2,000,000 documents',
  pg_relation_size('events_payload_gin') between 12.5e6 and 16e6);

select lab.prove(
  'a selective containment query matches 403 rows on 400 heap pages',
  lab.node_sum($$ select count(*) from events where payload @> '{"duration_ms": 1234}' $$,
           'Bitmap Heap Scan', 'Actual Rows') = 403
  and lab.node_sum($$ select count(*) from events where payload @> '{"duration_ms": 1234}' $$,
               'Bitmap Heap Scan', 'Exact Heap Blocks') = 400);

select lab.prove(
  'that query reads 4 index pages and about 404 pages in all',
  lab.node_pages($$ select count(*) from events where payload @> '{"duration_ms": 1234}' $$,
             'Bitmap Index Scan') <= 6
  and lab.buffers($$ select count(*) from events where payload @> '{"duration_ms": 1234}' $$)
      between 400 and 420);

select lab.prove(
  'failed events in iad: 100,517 rows, on 33,317 of 35,173 heap pages',
  lab.node_sum($$ select count(*) from events where payload @> '{"status": "failed", "region": "iad"}' $$,
           'Bitmap Heap Scan', 'Actual Rows') = 100517
  and lab.node_sum($$ select count(*) from events where payload @> '{"status": "failed", "region": "iad"}' $$,
               'Bitmap Heap Scan', 'Exact Heap Blocks') = 33317);

drop index events_payload_gin;

\echo
\echo '## The planner cannot see inside jsonb'

select lab.prove(
  'with no statistics, the planner guesses 10,000 rows (0.5 percent) for payload->>''status'' = ''failed''',
  lab.est_rows($$ select * from events where payload->>'status' = 'failed' $$) = 10000);

select lab.prove(
  'the real count is 500,420',
  (select count(*) from events where payload->>'status' = 'failed') = 500420);

create index events_status_expr on events ((payload->>'status'));
analyze events;

select lab.prove(
  'after an expression index and analyze, the estimate is close to the truth (about 497,870)',
  lab.est_rows($$ select * from events where payload->>'status' = 'failed' $$) between 470000 and 530000);

drop index events_status_expr;
analyze events;
create statistics events_status_stats on ((payload->>'status')) from events;
analyze events;

select lab.prove(
  'create statistics on the expression (PostgreSQL 14+) fixes the estimate without an index',
  lab.est_rows($$ select * from events where payload->>'status' = 'failed' $$) between 470000 and 530000);

drop statistics events_status_stats;

\echo
\echo '## When to promote a field to a column'

select pg_relation_filenode('projects') as filenode_before \gset
alter table projects
  add column name_upper text generated always as (upper(name)) stored;

select lab.prove(
  'adding a stored generated column rewrites the table (new file on disk)',
  pg_relation_filenode('projects') <> :filenode_before);

select pg_relation_filenode('projects') as filenode_before \gset
alter table projects
  add column name_lower text generated always as (lower(name));

select lab.prove(
  'a virtual generated column (the PostgreSQL 18 default) does not',
  pg_relation_filenode('projects') = :filenode_before);

\echo
\echo '## Graphs: adjacency lists and recursive CTEs'

create table teams (
  id         bigint generated always as identity primary key,
  account_id bigint not null references accounts (id),
  parent_id  bigint references teams (id),
  name       text not null
);

insert into teams (account_id, parent_id, name) values
  (1, null, 'Engineering'), (1, 1, 'Platform'), (1, 1, 'Product'),
  (1, 2, 'Databases'), (1, 2, 'Networking'), (1, 3, 'Billing'),
  (1, 4, 'Postgres');

select lab.prove(
  'the recursive CTE walks all 7 teams, Postgres at depth 4',
  (with recursive subtree as (
     select id, name, parent_id, 1 as depth, name::text as path
     from teams where id = 1
     union all
     select t.id, t.name, t.parent_id, s.depth + 1, s.path || ' > ' || t.name
     from teams t join subtree s on t.parent_id = s.id
   )
   select count(*) = 7
          and max(depth) = 4
          and bool_or(path = 'Engineering > Platform > Databases > Postgres')
   from subtree));

-- Make a cycle: Engineering now reports to Postgres.
update teams set parent_id = 7 where id = 1;

select lab.prove(
  'with a cycle, the cycle clause (PostgreSQL 14+) stops at the revisited node and marks it',
  (with recursive subtree as (
     select id, parent_id, name from teams where id = 1
     union all
     select t.id, t.parent_id, t.name
     from teams t join subtree s on t.parent_id = s.id
   ) cycle id set is_cycle using visited
   select count(*) = 8 and count(*) filter (where is_cycle) = 1
   from subtree));

update teams set parent_id = null where id = 1;

\echo
\echo '## ltree'

create extension if not exists ltree;

create table team_paths (
  team_id bigint primary key references teams (id),
  path    ltree not null
);
create index on team_paths using gist (path);
insert into team_paths values
  (1, 'eng'), (2, 'eng.platform'), (3, 'eng.product'),
  (4, 'eng.platform.databases'), (5, 'eng.platform.networking'),
  (6, 'eng.product.billing'), (7, 'eng.platform.databases.postgres');

select lab.prove(
  '<@ returns the subtree under eng.platform: teams 2, 4, 5, 7',
  (select array_agg(team_id order by path) from team_paths where path <@ 'eng.platform')
    = '{2,4,7,5}');

select lab.prove(
  '@> returns the ancestors of eng.platform.databases (and itself)',
  (select array_agg(team_id order by path) from team_paths where path @> 'eng.platform.databases')
    = '{1,2,4}');

\echo
\echo '## Closure tables'

create table team_closure (
  ancestor_id   bigint not null references teams (id),
  descendant_id bigint not null references teams (id),
  depth         int    not null,
  primary key (ancestor_id, descendant_id)
);

insert into team_closure
with recursive c as (
  select id as a, id as d, 0 as depth from teams
  union all
  select c.a, t.id, c.depth + 1 from c join teams t on t.parent_id = c.d
)
select a, d, depth from c;

select lab.prove(
  'seven teams make 18 closure rows',
  (select count(*) from team_closure) = 18);

select lab.prove(
  'everything under Platform: Databases, Networking, Postgres',
  (select array_agg(t.name order by t.name)
   from team_closure c join teams t on t.id = c.descendant_id
   where c.ancestor_id = 2 and c.depth > 0) = '{Databases,Networking,Postgres}');

\echo
\echo '## Time series: BRIN'

select lab.prove(
  'events.created_at has a correlation of 1',
  (select correlation from pg_stats where tablename = 'events' and attname = 'created_at') > 0.999);

create index events_created_brin  on events using brin (created_at);
create index events_created_btree on events (created_at);

select lab.prove('the BRIN index on created_at is 24 kB', pg_relation_size('events_created_brin') <= 32768);
select lab.prove(
  'the B-tree on created_at is about 43 MB',
  pg_relation_size('events_created_btree') between 40e6 and 48e6);
select lab.prove(
  'BRIN is over 1,000 times smaller (about 1,800)',
  pg_relation_size('events_created_btree')::numeric / pg_relation_size('events_created_brin') > 1000);

drop index events_created_btree;

-- The chapter asks for "the last day" of a freshly loaded kit; the seed's
-- newest event is from load time, so measure from the newest event.
select max(created_at) - interval '1 day' as since from events \gset

select lab.prove(
  'the last day of events is about 5,455 rows',
  (select count(*) from events where created_at >= :'since') between 5300 and 5600);

select lab.prove(
  'BRIN answers the one-day query in about 106 pages, with lossy heap blocks',
  lab.buffers(format($$ select count(*) from events where created_at >= %L $$, :'since'))
    between 90 and 130
  and lab.node_sum(format($$ select count(*) from events where created_at >= %L $$, :'since'),
               'Bitmap Heap Scan', 'Lossy Heap Blocks') > 0);

drop index events_created_brin;

\echo
\echo '## Queues with SKIP LOCKED'

create extension if not exists dblink;

create table jobs (
  id         bigint generated always as identity primary key,
  kind       text not null,
  payload    jsonb not null default '{}',
  run_at     timestamptz not null default now(),
  locked_at  timestamptz
);
create index jobs_ready_idx on jobs (run_at) where locked_at is null;

insert into jobs (kind, run_at)
select 'email', now() - (6 - g) * interval '1 minute' from generate_series(1, 5) g;

\o /dev/null
select dblink_connect('worker_a', 'dbname=' || current_database()) = 'OK' as a_connected;
select dblink_connect('worker_b', 'dbname=' || current_database()) = 'OK' as b_connected;

select dblink_exec('worker_a', 'begin') = 'BEGIN' as a_began;
select dblink_exec('worker_b', 'begin') = 'BEGIN' as b_began;
\o

select lab.prove(
  'worker A claims job 1',
  (select id from dblink('worker_a', $q$
     select id from jobs
     where locked_at is null and run_at <= now()
     order by run_at limit 1
     for update skip locked $q$) as t(id bigint)) = 1);

select lab.prove(
  'worker B, at the same time, skips the locked row and gets job 2 without waiting',
  (select id from dblink('worker_b', $q$
     select id from jobs
     where locked_at is null and run_at <= now()
     order by run_at limit 1
     for update skip locked $q$) as t(id bigint)) = 2);

-- Without skip locked, B queues behind A.
\o /dev/null
select dblink_exec('worker_b', 'rollback') = 'ROLLBACK' as b_rolled_back;
select dblink_exec('worker_b', 'begin') = 'BEGIN' as b_began;
select dblink_send_query('worker_b', $q$
  select id from jobs
  where locked_at is null and run_at <= now()
  order by run_at limit 1
  for update $q$) = 1 as b_sent;
select pg_sleep(0.5) is not null as waited;
\o

select lab.prove(
  'without skip locked, worker B waits on A''s row lock',
  exists (select 1 from pg_stat_activity
          where datname = current_database()
            and wait_event_type = 'Lock'
            and query like '%for update%'
            and cardinality(pg_blocking_pids(pid)) > 0));

-- Worker A crashes mid-job: its connection drops, its transaction rolls back.
\o /dev/null
select dblink_disconnect('worker_a') = 'OK' as a_crashed;
select pg_sleep(0.5) is not null as waited;
\o

select lab.prove(
  'when worker A dies, its lock disappears and job 1 goes to the next worker',
  (select id from dblink_get_result('worker_b') as t(id bigint)) = 1);
\o /dev/null
select * from dblink_get_result('worker_b') as t(id bigint);  -- drain the connection

select dblink_exec('worker_b', 'rollback') = 'ROLLBACK' as b_rolled_back;
select dblink_disconnect('worker_b') = 'OK' as b_disconnected;
\o

select lab.prove(
  'all 5 jobs are still queued after both workers rolled back',
  (select count(*) from jobs where locked_at is null) = 5);

\echo
\echo '## Full-text search'

select lab.prove(
  'to_tsvector stems and drops stop words',
  to_tsvector('english', 'When a deploy fails health checks, roll back')::text
    = $$'back':8 'check':6 'deploy':3 'fail':4 'health':5 'roll':7$$);

create table docs (
  id     bigint generated always as identity primary key,
  title  text not null,
  body   text not null,
  search tsvector generated always as (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', body),  'B')
  ) stored
);
create index docs_search_idx on docs using gin (search);

insert into docs (title, body) values
  ('Rolling back a failed deploy',
   'If a deploy fails its health checks, roll back to the previous release.'),
  ('Deploy regions',
   'Choose the regions a deploy runs in. Each region gets its own release.'),
  ('Billing FAQ',
   'Invoices are sent monthly. Failed payments are retried for seven days.');

select lab.prove(
  '"deploy failing" matches only "Rolling back a failed deploy", rank 0.999',
  (select array_agg(title || ' ' || round(ts_rank(search, q)::numeric, 3))
   from docs, websearch_to_tsquery('english', 'deploy failing') q
   where search @@ q) = '{"Rolling back a failed deploy 0.999"}');

select lab.prove(
  'failing and failed both stem to fail',
  websearch_to_tsquery('english', 'deploy failing')::text = $$'deploy' & 'fail'$$
  and to_tsvector('english', 'failed')::text = $$'fail':1$$);

set enable_seqscan = off;
select lab.prove(
  'the GIN index serves @@',
  'Bitmap Index Scan' = any (lab.nodes($$ select id from docs
                                          where search @@ websearch_to_tsquery('english', 'deploy failing') $$)));
reset enable_seqscan;

-- The checks below were added with the EAV and wide-table sections.

\echo
\echo '## Entity-attribute-value is a trap'
create table settings_eav (
  project_id  bigint not null references projects (id),
  attribute   text   not null,
  value       text,
  primary key (project_id, attribute)
);
create table settings_cols (
  project_id          bigint  primary key references projects (id),
  region              text    not null check (region in ('iad', 'sfo', 'ams', 'fra', 'syd')),
  retention_days      int     not null check (retention_days > 0),
  auto_deploy         boolean not null default false,
  deploy_branch       text    not null default 'main',
  max_parallel_builds int     not null check (max_parallel_builds between 1 and 64),
  notify_email        text
);
create index on settings_cols (region, auto_deploy);
insert into settings_cols
select id,
       (array['iad', 'sfo', 'ams', 'fra', 'syd'])[1 + id % 5],
       (array[7, 30, 90, 365])[1 + id % 4],
       id % 3 = 0,
       case when id % 10 = 0 then 'release' else 'main' end,
       1 + id % 8,
       'alerts+' || id || '@example.com'
from projects;

create index on settings_eav (attribute, value);
insert into settings_eav
select project_id, a, v
from settings_cols,
lateral (values ('region',              region),
                ('retention_days',      retention_days::text),
                ('auto_deploy',         auto_deploy::text),
                ('deploy_branch',       deploy_branch),
                ('max_parallel_builds', max_parallel_builds::text),
                ('notify_email',        notify_email)) as kv (a, v);

create table settings_doc (
  project_id  bigint primary key references projects (id),
  settings    jsonb  not null default '{}'
);
create index on settings_doc using gin (settings jsonb_path_ops);
insert into settings_doc
select project_id, to_jsonb(s) - 'project_id' from settings_cols s;

vacuum analyze settings_cols, settings_eav, settings_doc;

\echo
\echo '### Measure it'
\pset tuples_only off
\pset format aligned
select relname, reltuples::bigint as rows,
       pg_size_pretty(pg_total_relation_size(oid)) as total
from pg_class
where relname in ('settings_cols', 'settings_doc', 'settings_eav')
order by pg_total_relation_size(oid);
\pset tuples_only on
\pset format unaligned

select lab.buffers($$ select project_id from settings_cols where region = 'iad' and auto_deploy $$) as b_cols \gset
select lab.buffers($$ select project_id from settings_doc
                      where settings @> '{"region": "iad", "auto_deploy": true}' $$) as b_doc \gset
select lab.buffers($$ select r.project_id from settings_eav r join settings_eav a using (project_id)
                      where r.attribute = 'region' and r.value = 'iad'
                        and a.attribute = 'auto_deploy' and a.value = 'true' $$) as b_eav \gset
select lab.est_rows($$ select project_id from settings_cols where region = 'iad' and auto_deploy $$) as e_cols \gset
select lab.est_rows($$ select project_id from settings_doc
                   where settings @> '{"region": "iad", "auto_deploy": true}' $$) as e_doc \gset
select lab.est_rows($$ select r.project_id from settings_eav r join settings_eav a using (project_id)
                   where r.attribute = 'region' and r.value = 'iad'
                     and a.attribute = 'auto_deploy' and a.value = 'true' $$) as e_eav \gset
\echo pages read: columns :b_cols, jsonb :b_doc, EAV :b_eav
\echo estimated rows (actual 1333): columns :e_cols, jsonb :e_doc, EAV :e_eav

select lab.prove('sizes: columns 2376 kB, jsonb 8504 kB, EAV 14 MB',
  pg_size_pretty(pg_total_relation_size('settings_cols')) = '2376 kB'
  and pg_size_pretty(pg_total_relation_size('settings_doc')) = '8504 kB'
  and pg_size_pretty(pg_total_relation_size('settings_eav')) = '14 MB');
select lab.prove('EAV stores six rows per project: 120,000 rows',
  (select count(*) from settings_eav) = 120000);
select lab.prove('1,333 projects are in iad with auto-deploy on, in all three forms',
  (select count(*) from settings_cols where region = 'iad' and auto_deploy) = 1333
  and (select count(*) from settings_doc
       where settings @> '{"region": "iad", "auto_deploy": true}') = 1333
  and (select count(*) from settings_eav r join settings_eav a using (project_id)
       where r.attribute = 'region' and r.value = 'iad'
         and a.attribute = 'auto_deploy' and a.value = 'true') = 1333);
select lab.prove('EAV takes about six times the space of the columns; jsonb sits in between',
  pg_total_relation_size('settings_eav') > 5 * pg_total_relation_size('settings_cols')
  and pg_total_relation_size('settings_doc') between pg_total_relation_size('settings_cols')
                                                 and pg_total_relation_size('settings_eav'));
select lab.prove('EAV reads nearly nine times the pages; the planner expects about 35 rows',
  :b_eav > 8 * :b_cols and :e_eav between 20 and 60);
select lab.prove('pages read: columns 211, jsonb 548, EAV 1,833 (within 5 percent)',
  :b_cols between 200 and 222 and :b_doc between 520 and 576 and :b_eav between 1740 and 1925);
select lab.prove('estimates: columns 1,333, jsonb about 1,414',
  :e_cols = 1333 and :e_doc between 1300 and 1530);
select lab.prove('EAV is the largest of the three, columns the smallest',
  pg_total_relation_size('settings_eav') > pg_total_relation_size('settings_doc')
  and pg_total_relation_size('settings_doc') > pg_total_relation_size('settings_cols'));
select lab.prove('EAV reads the most pages for the two-condition query',
  :b_eav > :b_doc and :b_eav > :b_cols);
select lab.prove('the columns get the estimate right (within 10 percent of 1,333)',
  :e_cols between 1200 and 1470);
select lab.prove('the EAV estimate is off by more than five times',
  :e_eav < 1333 / 5.0 or :e_eav > 1333 * 5);

\echo
\echo '### What EAV and jsonb give up'
select lab.prove('the column rejects retention_days = ninety',
  lab.try($$ update settings_cols set retention_days = 'ninety' where project_id = 1 $$)
    like '22P02:%');
select lab.prove('EAV accepts it',
  lab.try($$ update settings_eav set value = 'ninety'
             where project_id = 1 and attribute = 'retention_days' $$) = 'ok');
select lab.prove('EAV accepts a misspelled attribute as a new setting',
  lab.try($$ insert into settings_eav values (1, 'retension_days', '30') $$) = 'ok');
select lab.prove('EAV lets a project lose its region; the column says no',
  lab.try($$ delete from settings_eav where project_id = 2 and attribute = 'region' $$) = 'ok'
  and lab.try($$ update settings_cols set region = null where project_id = 2 $$) like '23502:%');
begin;
select lab.prove('jsonb accepts "ninety" until a check says otherwise',
  lab.try($$ update settings_doc set settings = settings || '{"retention_days": "ninety"}'
             where project_id = 3 $$) = 'ok');
rollback;
alter table settings_doc add constraint settings_retention_days check (
  settings ? 'retention_days'
  and jsonb_typeof(settings -> 'retention_days') = 'number'
);
select lab.prove('with the check, jsonb rejects a string retention_days',
  lab.try($$ update settings_doc set settings = settings || '{"retention_days": "ninety"}'
             where project_id = 3 $$) like '23514:%');
select lab.prove('and rejects a document that drops the key',
  lab.try($$ update settings_doc set settings = settings - 'retention_days'
             where project_id = 3 $$) like '23514:%');

\echo
\echo '### When jsonb is the right call'
select pg_relation_filenode('settings_cols') as fn_cols \gset
alter table settings_cols add column timezone text not null default 'UTC';
select lab.prove('adding a column with a constant default does not rewrite the table',
  pg_relation_filenode('settings_cols') = :fn_cols);

\echo
\echo '## Wide tables: split by how columns are read'
-- only the seed's columns: an earlier section added generated columns to projects
create table projects_narrow as
  select id, account_id, owner_id, name, archived_at, created_at from projects;
create table projects_wide as
  select id, account_id, owner_id, name, archived_at, created_at,
         repeat('x', 500) as description
  from projects;
vacuum analyze projects_narrow, projects_wide;
\pset tuples_only off
\pset format aligned
select relname, pg_relation_size(oid) / 8192 as pages
from pg_class where relname in ('projects_narrow', 'projects_wide');
\pset tuples_only on
\pset format unaligned
select lab.buffers($$ select name from projects_narrow where account_id = 9 $$) as b_narrow \gset
select lab.buffers($$ select name from projects_wide where account_id = 9 $$) as b_wide \gset
\echo listing scan pages: narrow :b_narrow, wide :b_wide
select lab.prove('a 500-byte description stays inline: no TOAST for it',
  (select max(pg_column_compression(description)) is null from projects_wide));
select lab.prove('a 500-byte inline description takes the table from 192 pages to 1,472',
  pg_relation_size('projects_narrow') / 8192 = 192
  and pg_relation_size('projects_wide') / 8192 = 1472);
select lab.prove('and the listing scan reads more than seven times the pages',
  lab.buffers($$ select name from projects_wide where account_id = 9 $$)
  > 7 * lab.buffers($$ select name from projects_narrow where account_id = 9 $$));
select lab.prove('a table can have at most 1,600 columns',
  lab.try('create table too_wide (' ||
          (select string_agg('c' || g || ' int', ', ') from generate_series(1, 1601) g) || ')')
    like '54011:%');
