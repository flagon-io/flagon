-- Lab for "Queries that age well"
-- https://www.flagon.io/books/eight-kilobytes/queries
-- Run: ./lab 21-queries
--
-- The seed spaces events evenly over the year ending at midnight on
-- 2026-10-06, so the time windows are the chapter's literal dates:
-- :'day0' is 2026-09-01, :'last_day' the last day, :'last_week' the last week.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;

\set day0 '2026-09-01'
\set last_day '2026-10-05'
\set last_week '2026-09-29'

create index events_created_at_id_idx on events (created_at, id);
create index events_project_id_created_at_idx on events (project_id, created_at);
vacuum analyze events;

-- every join type in a plan (Inner, Semi, Right Anti, ...), from EXPLAIN without running it
create or replace function lab.join_types(query text)
returns text[]
language sql
as $$
  with recursive walk(n) as (
    select lab.estimate(query)
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.n -> 'Plans', '[]')) as child
  )
  select array_agg(n ->> 'Join Type') filter (where n ? 'Join Type') from walk
$$;

\echo
\echo '== OFFSET reads every row it skips'

select lab.prove(
  'OFFSET 0 reads under 10 pages',
  lab.buffers($$ select id, kind, created_at from events
                 order by created_at desc, id desc limit 20 offset 0 $$) < 10);

select lab.prove(
  'OFFSET 1,000 reads about 26 pages',
  lab.buffers($$ select id, kind, created_at from events
                 order by created_at desc, id desc limit 20 offset 1000 $$) between 15 and 40);

select lab.prove(
  'OFFSET 100,000 reads about 2,146 pages',
  lab.buffers($$ select id, kind, created_at from events
                 order by created_at desc, id desc limit 20 offset 100000 $$) between 1800 and 2500);

select lab.prove(
  'OFFSET 1,000,000 reads about 21,422 pages, ten times OFFSET 100,000: linear in depth',
  lab.buffers($$ select id, kind, created_at from events
                 order by created_at desc, id desc limit 20 offset 1000000 $$) between 19000 and 24000);

select lab.prove(
  'OFFSET 1,000,000 walks 1,000,020 index entries to return 20',
  (select (lab.find_node(p -> 'Plan', 'Index Scan') ->> 'Actual Rows')::numeric = 1000020
   from lab.plan($$ select id, kind, created_at from events
                    order by created_at desc, id desc limit 20 offset 1000000 $$) p));

-- the last row of the page before OFFSET 1000000 is the cursor
select created_at as cur_ts, id as cur_id
from events order by created_at desc, id desc offset 999999 limit 1 \gset

select lab.prove(
  'keyset returns exactly the page OFFSET 1,000,000 returns',
  (select array_agg(id order by created_at desc, id desc) from (
     select id, created_at from events
     where (created_at, id) < (:'cur_ts'::timestamptz, :'cur_id'::bigint)
     order by created_at desc, id desc limit 20) k)
  = (select array_agg(id order by created_at desc, id desc) from (
     select id, created_at from events
     order by created_at desc, id desc limit 20 offset 1000000) o));

select lab.prove(
  'keyset reads under 10 pages at the same depth',
  lab.buffers(format($$ select id, kind, created_at from events
                        where (created_at, id) < (%L::timestamptz, %s)
                        order by created_at desc, id desc limit 20 $$,
                     :'cur_ts', :'cur_id')) < 10);

select lab.prove(
  'the row comparison becomes an Index Cond on the two-column index',
  (select n ->> 'Index Name' = 'events_created_at_id_idx'
      and n ->> 'Index Cond' like '(ROW(created_at, id) < ROW(%'
   from lab.estimate(format($$ select id, kind, created_at from events
                              where (created_at, id) < (%L::timestamptz, %s)
                              order by created_at desc, id desc limit 20 $$,
                           :'cur_ts', :'cur_id')) p,
        lab.find_node(p, 'Index Scan') n));

select lab.prove(
  'the first page can use ''infinity'' as its cursor, with the same plan',
  lab.buffers($$ select id, kind, created_at from events
                 where (created_at, id) < ('infinity'::timestamptz, 0)
                 order by created_at desc, id desc limit 20 $$) < 10);

\echo
\echo '== N+1 is a loop, not a slow query'

select lab.prove(
  'account 42 has 20 projects',
  (select count(*) from projects where account_id = 42) = 20);

select lab.prove(
  'twenty users by = any(array): one index scan, a handful of pages',
  (select p -> 'Plan' ->> 'Node Type' = 'Index Scan'
      and (p -> 'Plan' ->> 'Actual Rows')::numeric = 20
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 10
   from lab.plan($$ select * from users
                    where id = any('{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20}'::bigint[]) $$) p));

prepare users_by_ids(bigint[]) as
  select id, email from users where id = any($1);

select lab.prove(
  'one prepared statement serves any list length',
  (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 4
   from lab.plan($$ execute users_by_ids('{17,4,256,1024}') $$) p)
  and (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 7
       from lab.plan($$ execute users_by_ids('{1,2,3,4,5,6,7}') $$) p));

deallocate users_by_ids;

\echo
\echo '== EXISTS, IN, and JOIN'

select lab.prove(
  'EXISTS and IN produce identical plans, a semi-join',
  lab.estimate(format($$ select count(*) from accounts a
                         where exists (select 1 from events e
                                       where e.account_id = a.id and e.kind = 'alert'
                                         and e.created_at >= %L) $$, :'last_day'))
  = lab.estimate(format($$ select count(*) from accounts a
                           where a.id in (select e.account_id from events e
                                          where e.kind = 'alert' and e.created_at >= %L) $$, :'last_day'))
  and (lab.join_types(format($$ select count(*) from accounts a
                                where exists (select 1 from events e
                                              where e.account_id = a.id and e.kind = 'alert'
                                                and e.created_at >= %L) $$, :'last_day')))[1] like '%Semi');

select lab.prove(
  'the JOIN returns one row per alert, more than the number of accounts with an alert',
  (select count(*) from accounts a join events e on e.account_id = a.id
   where e.kind = 'alert' and e.created_at >= :'last_day')
  > (select count(*) from accounts a
     where exists (select 1 from events e where e.account_id = a.id
                   and e.kind = 'alert' and e.created_at >= :'last_day')));

\echo
\echo '== NOT IN is a trap; use NOT EXISTS'

select lab.prove(
  '3 not in (1, 2, null) and 3 in (1, 2, null) are both NULL',
  (select 3 not in (1, 2, null)) is null and (select 3 in (1, 2, null)) is null);

select lab.prove(
  '80,000 users own no project, by NOT IN and by NOT EXISTS',
  (select count(*) from users u where u.id not in (select owner_id from projects)) = 80000
  and (select count(*) from users u
       where not exists (select 1 from projects p where p.owner_id = u.id)) = 80000);

select lab.prove(
  'one NULL in the subquery and NOT IN returns nothing; NOT EXISTS is unaffected',
  (select count(*) from users u
   where u.id not in (select owner_id from projects union all select null)) = 0
  and (select count(*) from users u
       where not exists (select 1 from (select owner_id from projects union all select null) p(owner_id)
                         where p.owner_id = u.id)) = 80000);

select lab.prove(
  'a small NOT IN subquery is hashed',
  (select n ->> 'Filter' like '%hashed SubPlan%'
   from lab.estimate($$ select count(*) from users u
                        where u.id not in (select owner_id from projects) $$) p,
        lab.find_node(p, 'Seq Scan') n));

select lab.prove(
  'NOT IN over 2 million events is a plain subplan costed in the billions',
  (select (p ->> 'Total Cost')::numeric > 1e9
      and lab.find_node(p, 'Seq Scan') ->> 'Filter' not like '%hashed%'
   from lab.estimate($$ select count(*) from users u
                        where u.id not in (select user_id from events) $$) p));

select lab.prove(
  'NOT EXISTS over the same tables is an anti-join costed under 100,000',
  (select (p ->> 'Total Cost')::numeric < 100000
      and (lab.join_types($$ select count(*) from users u
                    where not exists (select 1 from events e where e.user_id = u.id) $$))[1] like '%Anti'
   from lab.estimate($$ select count(*) from users u
                        where not exists (select 1 from events e where e.user_id = u.id) $$) p));

\echo
\echo '== Exact counts read everything'

select lab.prove(
  'count(*) reads the whole primary key, about 5,469 pages, instead of 35,173 heap pages',
  (select p -> 'Plan' -> 'Plans' -> 0 ->> 'Node Type' = 'Index Only Scan'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int
          between 5000 and 6000
   from lab.plan('select count(*) from events') p)
  and (select relpages from pg_class where relname = 'events') = 35173);

select lab.prove(
  'reltuples is within 1% of the 2,000,000 rows',
  (select reltuples from pg_class where oid = 'public.events'::regclass) between 1980000 and 2020000);

create function count_estimate(query text) returns bigint
language plpgsql as $$
declare
  plan jsonb;
begin
  execute 'explain (format json) ' || query into plan;
  return (plan -> 0 -> 'Plan' ->> 'Plan Rows')::bigint;
end
$$;

select lab.prove(
  'the planner estimates deploys within 3% of the exact 499,992',
  count_estimate($$ select 1 from events where kind = 'deploy' $$) between 485000 and 515000
  and (select count(*) from events where kind = 'deploy') = 499992);

select lab.prove(
  'a count capped at 1,001 reads a few hundred pages at most',
  lab.buffers($$ select count(*) from (
                   select 1 from events where kind = 'deploy' limit 1001) t $$) < 300);

\echo
\echo '== Sargable predicates'

select lab.prove(
  'created_at::date = a day reads every page of the table',
  lab.buffers(format($$ select count(*) from events where created_at::date = %L::date $$, :'day0'))
    >= 35173);

select lab.prove(
  'the half-open range on the bare column reads under 50 pages',
  lab.buffers(format($$ select count(*) from events
                        where created_at >= %L and created_at < %L::timestamptz + interval '1 day' $$,
                     :'day0', :'day0')) < 50);

select lab.prove(
  'both forms count the same day: about 5,479 rows',
  (select count(*) from events where created_at::date = :'day0'::date)
  = (select count(*) from events
     where created_at >= :'day0' and created_at < :'day0'::timestamptz + interval '1 day')
  and (select count(*) from events where created_at::date = :'day0'::date) between 5470 and 5490);

select lab.prove(
  'arithmetic on the column scans the table; on the constant side it is an index range',
  lab.buffers(format($$ select count(*) from events
                        where created_at + interval '1 day' > %L::timestamptz + interval '1 day' $$,
                     :'last_day')) >= 35173
  and lab.buffers(format($$ select count(*) from events where created_at > %L $$, :'last_day')) < 50);

insert into events (account_id, project_id, user_id, kind, created_at)
values (9, 1, 8, 'midnight', :'day0'::timestamptz + interval '1 day');

select lab.prove(
  'BETWEEN counts an event at exactly midnight in two days; half-open ranges count it once',
  (select count(*) from events where kind = 'midnight'
     and created_at between :'day0'::timestamptz and :'day0'::timestamptz + interval '1 day')
  + (select count(*) from events where kind = 'midnight'
     and created_at between :'day0'::timestamptz + interval '1 day' and :'day0'::timestamptz + interval '2 days')
  = 2
  and (select count(*) from events where kind = 'midnight'
     and created_at >= :'day0'::timestamptz and created_at < :'day0'::timestamptz + interval '1 day')
  + (select count(*) from events where kind = 'midnight'
     and created_at >= :'day0'::timestamptz + interval '1 day' and created_at < :'day0'::timestamptz + interval '2 days')
  = 1);

delete from events where kind = 'midnight';

select lab.prove(
  'id = 5.0 casts the column to numeric and scans the table',
  (select p ->> 'Node Type' = 'Seq Scan' and p ->> 'Filter' = '((id)::numeric = 5.0)'
   from lab.estimate('select * from events where id = 5.0') p));

select lab.prove(
  'id = 5 and id = ''5'' both use the primary key',
  lab.estimate('select * from events where id = 5') ->> 'Index Name' = 'events_pkey'
  and lab.estimate($$ select * from events where id = '5' $$) ->> 'Index Name' = 'events_pkey');

select lab.prove(
  'where id = 42 is an index scan that reads under 10 pages',
  'Index Scan' = any(lab.nodes('select * from events where id = 42'))
  and lab.buffers('select * from events where id = 42') < 10);
select lab.prove(
  'where id = 42.0 casts the column to numeric and reads the whole table (over 35,000 pages)',
  lab.estimate('select * from events where id = 42.0') ->> 'Filter' = '((id)::numeric = 42.0)'
  and lab.buffers('select * from events where id = 42.0') > 35000);

\echo
\echo '== OR across a join defeats both indexes'

create index projects_name_idx on projects (name);
create index projects_owner_id_idx on projects (owner_id);
create index users_email_idx on users (email);
analyze projects;
analyze users;

select lab.prove(
  'an OR on one table becomes a BitmapOr of both indexes',
  'BitmapOr' = any(lab.nodes($$ select id, name from projects
                                where name = 'Project 4242' or owner_id = 123 $$)));

select lab.prove(
  'user 29695 owns project 4242',
  (select owner_id from projects where name = 'Project 4242')
  = (select id from users where email = 'user29695@example.com'));

select lab.prove(
  'an OR across the join scans both tables: over 1,000 pages for one row',
  (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 1
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int > 1000
   from lab.plan($$ select p.id, p.name from projects p
                    join users u on u.id = p.owner_id
                    where p.name = 'Project 4242' or u.email = 'user29695@example.com' $$) p));

select lab.prove(
  'the UNION of two indexed queries reads under 30 pages for the same row',
  (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 1
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 30
   from lab.plan($$ select p.id, p.name from projects p where p.name = 'Project 4242'
                    union
                    select p.id, p.name from projects p
                    join users u on u.id = p.owner_id
                    where u.email = 'user29695@example.com' $$) p));

\echo
\echo '== CTEs: inlined or materialized'

select lab.prove(
  'a CTE referenced once is inlined: one index scan, under 20 pages',
  (select p -> 'Plan' ->> 'Node Type' = 'Index Scan'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 20
   from lab.plan(format($$ with recent as (
                             select * from events where created_at > %L)
                           select id, kind from recent where project_id = 4242 $$, :'last_week')) p));

select lab.prove(
  'MATERIALIZED fetches the whole week first: a CTE Scan, hundreds of pages, and a temp file',
  (select p -> 'Plan' ->> 'Node Type' = 'CTE Scan'
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int > 500
      and (p -> 'Plan' ->> 'Temp Written Blocks')::int > 0
   from lab.plan(format($$ with recent as materialized (
                             select * from events where created_at > %L)
                           select id, kind from recent where project_id = 4242 $$, :'last_week')) p));

\echo
\echo '== Upserts'

create table project_daily_counts (
  project_id  bigint not null references projects (id),
  day         date   not null,
  kind        text   not null,
  n           bigint not null,
  primary key (project_id, day, kind)
);

create temp table returned (old_n bigint, new_n bigint);

with r as (
  insert into project_daily_counts (project_id, day, kind, n)
  values (4242, '2026-09-01', 'deploy', 3)
  on conflict (project_id, day, kind)
  do update set n = project_daily_counts.n + excluded.n
  returning old.n as old_n, new.n as new_n)
insert into returned select * from r;

select lab.prove(
  'the first upsert inserts: old.n is null, new.n is 3',
  (select old_n is null and new_n = 3 from returned));

truncate returned;

with r as (
  insert into project_daily_counts (project_id, day, kind, n)
  values (4242, '2026-09-01', 'deploy', 2)
  on conflict (project_id, day, kind)
  do update set n = project_daily_counts.n + excluded.n
  returning old.n as old_n, new.n as new_n)
insert into returned select * from r;

select lab.prove(
  'the second upsert updates: old.n is 3, new.n is 5',
  (select old_n = 3 and new_n = 5 from returned));

create extension if not exists dblink;
select dblink_connect('a', 'dbname=' || current_database() || ' application_name=upsert-a') \g /dev/null
select dblink_connect('b', 'dbname=' || current_database() || ' application_name=upsert-b') \g /dev/null

-- Collect an async command's outcome: the SQLSTATE it failed with, or 'ok'.
create or replace function lab.finish(conn text)
returns text
language plpgsql
as $$
declare
  msg text;
begin
  perform * from dblink_get_result(conn, false) as r(t text);
  msg := dblink_error_message(conn);
  perform * from dblink_get_result(conn, false) as r(t text);
  return case when msg = 'OK' then 'ok' else msg end;
end
$$;

select dblink_exec('a', 'begin') \g /dev/null
select dblink_exec('a', $$insert into project_daily_counts values (1, '2026-01-01', 'x', 1)
  on conflict (project_id, day, kind) do update set n = project_daily_counts.n + excluded.n$$) \g /dev/null
select dblink_send_query('b', $$insert into project_daily_counts values (1, '2026-01-01', 'x', 1)
  on conflict (project_id, day, kind) do update set n = project_daily_counts.n + excluded.n$$) \g /dev/null
select pg_sleep(0.3) \g /dev/null

select lab.prove(
  'a concurrent ON CONFLICT on the same key waits for the first transaction',
  (select wait_event_type = 'Lock' from pg_stat_activity where application_name = 'upsert-b'));

select dblink_exec('a', 'commit') \g /dev/null

select lab.finish('b') as b_result \gset

select lab.prove(
  'then it updates instead of failing: no error, n = 2',
  :'b_result' = 'ok'
  and (select n from project_daily_counts where project_id = 1 and kind = 'x') = 2);

select dblink_exec('a', 'begin') \g /dev/null
select dblink_exec('a', $$merge into project_daily_counts t
  using (values (2::bigint, date '2026-01-01', 'x', 1::bigint)) s(p, d, k, n)
  on t.project_id = s.p and t.day = s.d and t.kind = s.k
  when matched then update set n = t.n + s.n
  when not matched then insert values (s.p, s.d, s.k, s.n)$$) \g /dev/null
select dblink_send_query('b', $$merge into project_daily_counts t
  using (values (2::bigint, date '2026-01-01', 'x', 1::bigint)) s(p, d, k, n)
  on t.project_id = s.p and t.day = s.d and t.kind = s.k
  when matched then update set n = t.n + s.n
  when not matched then insert values (s.p, s.d, s.k, s.n)$$) \g /dev/null
select pg_sleep(0.3) \g /dev/null
select dblink_exec('a', 'commit') \g /dev/null
select lab.finish('b') as b_result \gset

select lab.prove(
  'two concurrent MERGEs both decide the key is missing, and the second fails with a unique violation',
  :'b_result' like '%duplicate key value violates unique constraint%');

select dblink_disconnect('a') \g /dev/null
select dblink_disconnect('b') \g /dev/null

\echo
\echo '== Idempotency keys'

create table payments (
  id               bigint generated always as identity primary key,
  account_id       bigint not null references accounts (id),
  idempotency_key  text   not null,
  amount_cents     bigint not null,
  created_at       timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create temp table ids (id bigint, inserted boolean);

with r as (
  insert into payments (account_id, idempotency_key, amount_cents)
  values (42, '7f3c9a10-retry-safe', 1999)
  on conflict (account_id, idempotency_key) do nothing
  returning id)
insert into ids (id) select id from r;

select lab.prove('the first request inserts and returns id 1', (select array_agg(id) from ids) = '{1}');

truncate ids;

with r as (
  insert into payments (account_id, idempotency_key, amount_cents)
  values (42, '7f3c9a10-retry-safe', 1999)
  on conflict (account_id, idempotency_key) do nothing
  returning id)
insert into ids (id) select id from r;

select lab.prove(
  'the retry with the same key inserts nothing and returns no rows',
  (select count(*) from ids) = 0 and (select count(*) from payments) = 1);

with r as (
  insert into payments (account_id, idempotency_key, amount_cents)
  values (42, '7f3c9a10-retry-safe', 1999)
  on conflict (account_id, idempotency_key)
  do update set idempotency_key = excluded.idempotency_key
  returning id, old.id is null as inserted)
insert into ids select * from r;

select lab.prove(
  'the no-op update returns the original id with inserted = false',
  (select (id, inserted) = (1::bigint, false) from ids));

truncate ids;

with r as (
  insert into payments (account_id, idempotency_key, amount_cents)
  values (42, 'another-key', 500)
  returning id)
insert into ids (id) select id from r;

select lab.prove(
  'the two conflicting inserts still used up identity values 2 and 3: the next new row gets 4',
  (select id from ids) = 4);

\echo
\echo '== MERGE'

truncate project_daily_counts;

create temp table merged (action text, n bigint);

with r as (
  merge into project_daily_counts t
  using (
    select project_id, (created_at at time zone 'UTC')::date as day, kind, count(*) as n
    from events
    where project_id = 4242
      and created_at >= :'day0' and created_at < :'day0'::timestamptz + interval '14 days'
    group by 1, 2, 3
  ) s
  on t.project_id = s.project_id and t.day = s.day and t.kind = s.kind
  when matched then update set n = s.n
  when not matched then insert (project_id, day, kind, n)
                        values (s.project_id, s.day, s.kind, s.n)
  returning merge_action(), t.n)
insert into merged select * from r;

select lab.prove(
  'MERGE ... RETURNING merge_action() reports INSERT for every new row',
  (select count(*) > 0 and bool_and(action = 'INSERT') from merged));

\echo
\echo '== Commit once, not once per row'

create table batch_target (id bigint generated always as identity primary key, v int);

select dblink_connect('w', 'dbname=' || current_database()) \g /dev/null
select pid as wpid from dblink('w', 'select pg_backend_pid()') as x(pid int) \gset

do $$
begin
  for i in 1..500 loop
    perform dblink_exec('w', 'insert into batch_target (v) values (1)');
  end loop;
end
$$;
-- the worker reports its I/O stats at most once a second; make it flush them now
select * from dblink('w', 'select pg_stat_force_next_flush()') as t(x text) \g /dev/null
select fsyncs as autocommit_fsyncs from pg_stat_get_backend_io(:wpid)
where object = 'wal' and context = 'normal' \gset

do $$
begin
  perform dblink_exec('w', 'begin');
  for i in 1..500 loop
    perform dblink_exec('w', 'insert into batch_target (v) values (1)');
  end loop;
  perform dblink_exec('w', 'commit');
end
$$;
-- the worker reports its I/O stats at most once a second; make it flush them now
select * from dblink('w', 'select pg_stat_force_next_flush()') as t(x text) \g /dev/null
select fsyncs - :autocommit_fsyncs as onetx_fsyncs from pg_stat_get_backend_io(:wpid)
where object = 'wal' and context = 'normal' \gset

\echo '  WAL fsyncs on your machine:' :autocommit_fsyncs 'autocommit,' :onetx_fsyncs 'in one transaction'

select lab.prove(
  '500 autocommit inserts flush the WAL hundreds of times; 500 inside one transaction, a handful',
  :autocommit_fsyncs > 250 and :onetx_fsyncs < :autocommit_fsyncs / 5);

select dblink_disconnect('w') \g /dev/null

prepare batch_insert(bigint[], bigint[], bigint[], text[]) as
  insert into events (account_id, project_id, user_id, kind)
  select * from unnest($1, $2, $3, $4);

execute batch_insert('{9,9,16}', '{1,1,2}', '{8,8,15}', '{build,deploy,build}');
execute batch_insert('{9}', '{1}', '{8}', '{unnest-test}');

select lab.prove(
  'one unnest statement with four array parameters inserts any number of rows',
  (select count(*) from events where kind in ('build', 'deploy') and id > 2000000) = 3
  and (select count(*) from events where kind = 'unnest-test') = 1);

select lab.prove(
  'UPDATE ... LIMIT is a syntax error at or near "limit"',
  lab.try($$ update events set kind = 'x' limit 10 $$)
    = '42601: syntax error at or near "limit"');

with batch as (
  select id from events where kind = 'build' order by id limit 10
)
update events e set kind = 'build2'
from batch where e.id = batch.id;

select lab.prove(
  'a CTE that picks the batch updates exactly 10 rows',
  (select count(*) from events where kind = 'build2') = 10);

\echo
\echo '== Window functions'

create temp table chart as
with days as (
  select generate_series(:'day0'::timestamptz, :'day0'::timestamptz + interval '6 days', interval '1 day') as day
),
daily as (
  select date_trunc('day', created_at) as day, count(*) as deploys
  from events
  where account_id = 42 and kind = 'deploy'
    and created_at >= :'day0' and created_at < :'day0'::timestamptz + interval '7 days'
  group by 1
)
select d.day::date,
       coalesce(x.deploys, 0)                                as deploys,
       sum(coalesce(x.deploys, 0)) over (order by d.day)     as running_total,
       coalesce(x.deploys, 0)
         - lag(coalesce(x.deploys, 0)) over (order by d.day) as change
from days d
left join daily x on x.day = d.day;

select lab.prove(
  'generating the buckets gives all 7 days, and the running total ends at the week''s sum',
  (select count(*) from chart) = 7
  and (select running_total from chart order by day desc limit 1) = (select sum(deploys) from chart));

select lab.prove(
  'percent of total with an empty window sums to 100',
  (select round(sum(pct)) from (
     select round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
     from events where account_id = 42 group by kind) t) = 100);

select lab.prove(
  'a.name must appear in the GROUP BY clause or be used in an aggregate function',
  lab.try($$ select u.account_id, a.name, count(*)
                  from accounts a join users u on u.account_id = a.id
                  group by u.account_id $$)
    = '42803: column "a.name" must appear in the GROUP BY clause or be used in an aggregate function');

select lab.prove(
  'grouping by the primary key a.id makes a.name legal, and so does any_value',
  (select count(*) from (select a.id, a.name, count(*) from accounts a
                         join users u on u.account_id = a.id group by a.id) t) = 1000
  and (select count(*) from (select u.account_id, any_value(a.name), count(*) from accounts a
                             join users u on u.account_id = a.id group by u.account_id) t) = 1000);

\echo
\echo '== Top-N per group with LATERAL'

select lab.prove(
  'row_number() fetches every event of every project: about 2,084 rows and over 1,500 pages for 60 results',
  (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 60
      and (lab.find_node(p -> 'Plan', 'Sort') ->> 'Actual Rows')::numeric between 2000 and 2200
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int > 1500
   from lab.plan($$ select * from (
                      select p.id as pid, p.name, e.id, e.kind, e.created_at,
                             row_number() over (partition by e.project_id order by e.created_at desc) as rn
                      from projects p
                      join events e on e.project_id = p.id
                      where p.account_id = 42) t
                    where rn <= 3 $$) p));

select lab.prove(
  'LATERAL with LIMIT 3 runs 20 short index scans: the same 60 rows in about 311 pages',
  (select (p -> 'Plan' ->> 'Actual Rows')::numeric = 60
      and (lab.find_node(p -> 'Plan', 'Limit') ->> 'Actual Loops')::int = 20
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 400
   from lab.plan($$ select p.id, p.name, e.id, e.kind, e.created_at
                    from projects p
                    cross join lateral (
                      select id, kind, created_at from events
                      where project_id = p.id
                      order by created_at desc
                      limit 3) e
                    where p.account_id = 42 $$) p));

select lab.prove(
  'of those, the events side is 6 pages per project: 120',
  (select (lab.find_node(p -> 'Plan', 'Limit') ->> 'Shared Hit Blocks')::int
        + (lab.find_node(p -> 'Plan', 'Limit') ->> 'Shared Read Blocks')::int between 100 and 140
   from lab.plan($$ select p.id, p.name, e.id, e.kind, e.created_at
                    from projects p
                    cross join lateral (
                      select id, kind, created_at from events
                      where project_id = p.id
                      order by created_at desc
                      limit 3) e
                    where p.account_id = 42 $$) p));
