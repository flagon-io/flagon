-- Lab for "Code in the database"
-- https://www.flagon.io/books/eight-kilobytes/functions
-- Run: ./lab 23-functions
--
-- Functions, triggers, and procedures, measured: SQL inlining versus PL/pgSQL,
-- plan caching inside functions, volatility and parallel labels, what a
-- trigger costs per row, the counter trigger that serializes writers, COPY and
-- session_replication_role, procedures that commit, exception blocks, and how
-- to see functions in the statistics views. Uses dblink for a second session.
-- Timings are taken as the best of several runs on an unlogged table, so the
-- disk stays out of it; they still vary by machine, so the checks only compare.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;
create extension if not exists dblink;

-- expected errors land here, then a check reads them
create temp table caught (k text, state text, msg text);

\echo
\echo == SQL functions are inlined; PL/pgSQL functions are black boxes

create index events_account_id_created_at_idx on events (account_id, created_at);
vacuum analyze events;

create function account_events(acct bigint) returns setof events
language sql stable
as $$ select * from events where account_id = acct $$;

create function account_events_pl(acct bigint) returns setof events
language plpgsql stable
as $$ begin return query select * from events where account_id = acct; end $$;

-- warm both once so the checks compare steady-state page counts
select count(*) from account_events(42) where created_at > '2026-10-05' \g /dev/null
select count(*) from account_events_pl(42) where created_at > '2026-10-05' \g /dev/null

select lab.prove(
  'the SQL function is inlined: an index scan on (account_id, created_at), under 20 pages',
  lab.nodes($$ select * from account_events(42) where created_at > '2026-10-05' $$)
    = array['Index Scan']
  and lab.buffers($$ select * from account_events(42)
                    where created_at > '2026-10-05' $$) < 20);

select lab.prove(
  'the PL/pgSQL twin is a Function Scan that reads the whole account, over 1,000 pages',
  lab.nodes($$ select * from account_events_pl(42) where created_at > '2026-10-05' $$)
    = array['Function Scan']
  and lab.buffers($$ select * from account_events_pl(42)
                    where created_at > '2026-10-05' $$) > 1000);

select lab.prove(
  'the PL/pgSQL function is estimated at 1,000 rows, a third of them passing the filter',
  (lab.estimate($$ select * from account_events_pl(42) $$) ->> 'Plan Rows')::int = 1000
  and (lab.estimate($$ select * from account_events_pl(42)
                       where created_at > '2026-10-05' $$) ->> 'Plan Rows')::int = 333);

create function ae_volatile(acct bigint) returns setof events
language sql as $$ select * from events where account_id = acct $$;
create function ae_strict(acct bigint) returns setof events
language sql stable strict as $$ select * from events where account_id = acct $$;
create function ae_definer(acct bigint) returns setof events
language sql stable security definer as $$ select * from events where account_id = acct $$;
create function ae_pinned(acct bigint) returns setof events
language sql stable set search_path = public, pg_temp
as $$ select * from events where account_id = acct $$;

select lab.prove(
  'VOLATILE, STRICT, SECURITY DEFINER, or a SET clause each stop a set-returning SQL function from inlining',
  (select bool_and(lab.nodes(format('select * from %s(42) where created_at > %L',
                                    f, '2026-10-05')) = array['Function Scan'])
   from unnest(array['ae_volatile', 'ae_strict', 'ae_definer', 'ae_pinned']) f));

create function is_failed(p jsonb) returns boolean
language sql immutable as $$ select p ->> 'status' = 'failed' $$;
create function is_failed_pl(p jsonb) returns boolean
language plpgsql immutable as $$ begin return p ->> 'status' = 'failed'; end $$;

select lab.prove(
  'a scalar SQL function disappears into the plan; the PL/pgSQL one stays a call',
  lab.plan_text($$ select count(*) from events where is_failed(payload) $$)
    like '%((payload ->> ''status''::text) = ''failed''::text)%'
  and lab.plan_text($$ select count(*) from events where is_failed_pl(payload) $$)
    like '%Filter: is_failed_pl(payload)%');

\echo
\echo == PL/pgSQL caches plans, and flips to a generic one

insert into events (account_id, project_id, user_id, kind, payload, created_at)
select p.account_id, p.id, p.owner_id, 'incident', '{"status": "failed"}',
       timestamptz '2026-10-06' - interval '300 days' - g * interval '1 day'
from generate_series(1, 20) g
join projects p on p.id = g * 100;

create index events_kind_idx on events (kind);
create index events_created_at_idx on events (created_at);
vacuum analyze events;

create function latest_ids(k text) returns setof bigint
language plpgsql stable
as $$
begin
  return query
    select id from events where kind = k order by created_at desc limit 10;
end
$$;

select lab.buffers($$ select * from latest_ids('incident') $$) \g /dev/null
select lab.prove(
  'a rare kind, early in the session: a custom plan, under 50 pages',
  lab.buffers($$ select * from latest_ids('incident') $$) < 50);

select lab.buffers($$ select * from latest_ids('build') $$) from generate_series(1, 4) \g /dev/null

select lab.prove(
  'after five calls the function switched to a generic plan: the rare kind now reads over 30,000 pages',
  lab.buffers($$ select * from latest_ids('incident') $$) > 30000);

alter function latest_ids(text) set plan_cache_mode = force_custom_plan;
select lab.buffers($$ select * from latest_ids('build') $$) from generate_series(1, 6) \g /dev/null

select lab.prove(
  'with SET plan_cache_mode = force_custom_plan on the function, the rare kind is cheap on every call',
  lab.buffers($$ select * from latest_ids('incident') $$) < 50);

create function latest_ids_sql(k text) returns setof bigint
language sql stable strict
as $$ select id from events where kind = k order by created_at desc limit 10 $$;

select lab.buffers($$ select * from latest_ids_sql('incident') $$) \g /dev/null
select lab.buffers($$ select * from latest_ids_sql('build') $$) from generate_series(1, 6) \g /dev/null

select lab.prove(
  'PostgreSQL 18: a SQL function that is not inlined caches its plan too, and flips the same way',
  lab.buffers($$ select * from latest_ids_sql('incident') $$) > 30000);

\echo
\echo == Volatility tells the planner what it may assume

create index projects_created_at_idx on projects (created_at);
analyze projects;

create function days_ago_i(n int) returns timestamptz
language plpgsql immutable as $$ begin return timestamptz '2026-10-06' - n * interval '1 day'; end $$;
create function days_ago_s(n int) returns timestamptz
language plpgsql stable as $$ begin return timestamptz '2026-10-06' - n * interval '1 day'; end $$;
create function days_ago_v(n int) returns timestamptz
language plpgsql volatile as $$ begin return timestamptz '2026-10-06' - n * interval '1 day'; end $$;
create function days_ago_default(n int) returns timestamptz
language plpgsql as $$ begin return timestamptz '2026-10-06' - n * interval '1 day'; end $$;

select lab.prove(
  'a function created without a label is VOLATILE and PARALLEL UNSAFE',
  (select (provolatile, proparallel) = ('v'::"char", 'u'::"char")
   from pg_proc where proname = 'days_ago_default'));

select lab.prove(
  'IMMUTABLE is folded to a constant at plan time: the index condition holds a literal timestamp',
  lab.plan_text($$ select count(*) from projects where created_at > days_ago_i(7) $$)
    ~ 'Index Cond: \(created_at > ''\d{4}-\d\d-\d\d [^'']+''::timestamp with time zone\)');

select lab.prove(
  'STABLE is evaluated at run time but can still drive the index',
  lab.plan_text($$ select count(*) from projects where created_at > days_ago_s(7) $$)
    like '%Index Cond: (created_at > days_ago_s(7))%');

select lab.prove(
  'VOLATILE cannot be an index condition: a sequential scan with a filter',
  lab.plan_text($$ select count(*) from projects where created_at > days_ago_v(7) $$)
    like '%Seq Scan on projects%Filter: (created_at > days_ago_v(7))%');

set track_functions = 'pl';
begin;
select count(*) from projects where created_at > days_ago_i(7) \g /dev/null
select count(*) from projects where created_at > days_ago_s(7) \g /dev/null
select count(*) from projects where created_at > days_ago_v(7) \g /dev/null
select lab.prove(
  'calls per query: IMMUTABLE once, STABLE at most twice, VOLATILE once per row (20,000)',
  (select array_agg(calls order by funcname) from pg_stat_xact_user_functions
   where funcname in ('days_ago_i', 'days_ago_s', 'days_ago_v'))
  in (array[1, 1, 20000]::bigint[], array[1, 2, 20000]::bigint[]));
commit;

create table settings (key text primary key, value int not null);
insert into settings values ('retention_days', 30);

create function setting(k text) returns int
language sql immutable  -- a lie: it reads a table
as $$ select value from settings where key = k $$;

create function expired_projects() returns bigint
language plpgsql
as $$
begin
  return (select count(*) from projects
          where created_at < timestamptz '2026-10-06' - setting('retention_days') * interval '1 day');
end
$$;

select expired_projects() as before_change \gset
update settings set value = 365 where key = 'retention_days';
select expired_projects() as same_session \gset
select n as other_session
from dblink('dbname=' || current_database(), 'select expired_projects()') as t(n bigint) \gset

select lab.prove(
  'a mislabeled IMMUTABLE function goes stale: the session keeps the old answer, a new session sees the new one',
  :same_session = :before_change and :other_session < :before_change);

alter function setting(text) stable;
select lab.prove(
  'relabeling it STABLE invalidates the cached plan and the answer is right again',
  expired_projects() = :other_session);

do $$
begin
  create index on projects (days_ago_s(1));
  raise exception 'no error';
exception when invalid_object_definition then
  insert into caught values ('index', sqlstate, sqlerrm);
end
$$;
select lab.prove(
  'an index expression rejects a function that is not IMMUTABLE',
  (select state = '42P17' and msg = 'functions in index expression must be marked IMMUTABLE'
   from caught where k = 'index'));

\echo
\echo == Parallel safety

set max_parallel_workers_per_gather = 2;

create function is_slow(p jsonb) returns boolean
language plpgsql immutable
as $$ begin return (p ->> 'duration_ms')::int > 4000; end $$;

select lab.prove(
  'one PARALLEL UNSAFE function in WHERE and the 2-million-row scan runs in one process',
  lab.plan_text($$ select count(*) from events where is_slow(payload) $$) not like '%Gather%');

alter function is_slow(jsonb) parallel restricted;
select lab.prove(
  'PARALLEL RESTRICTED keeps it out of the workers, so the filtered scan is still serial',
  lab.plan_text($$ select count(*) from events where is_slow(payload) $$) not like '%Gather%');

alter function is_slow(jsonb) parallel safe;
select lab.prove(
  'marked PARALLEL SAFE, the same query plans a Gather with two workers',
  lab.plan_text($$ select count(*) from events where is_slow(payload) $$)
    like '%Gather%Workers Planned: 2%Parallel Seq Scan on events%');

create table slow_log (event_id bigint);
create function log_slow(i bigint, p jsonb) returns boolean
language plpgsql parallel safe  -- a lie: it writes
as $$
begin
  if (p ->> 'duration_ms')::int > 4000 then
    insert into slow_log values (i);
    return true;
  end if;
  return false;
end
$$;

do $$
begin
  perform count(*) from events where log_slow(id, payload);
  raise exception 'no error';
exception when invalid_transaction_state then
  insert into caught values ('parallel', sqlstate, sqlerrm);
end
$$;
select lab.prove(
  'a function that writes but claims PARALLEL SAFE fails: cannot execute INSERT during a parallel operation',
  (select state = '25000' and msg = 'cannot execute INSERT during a parallel operation'
   from caught where k = 'parallel'));

set max_parallel_workers_per_gather = 0;

\echo
\echo == COST and ROWS

create function cheap_check(p jsonb) returns boolean
language plpgsql immutable cost 1
as $$ begin return p ? 'region'; end $$;
create function pricey_check(p jsonb) returns boolean
language plpgsql immutable cost 10000
as $$ begin return p ? 'status'; end $$;

select lab.prove(
  'conditions run cheapest first: written pricey-then-cheap, the filter evaluates cheap_check first',
  lab.plan_text($$ select count(*) from events
                   where id < 1000 and pricey_check(payload) and cheap_check(payload) $$)
    like '%Filter: (cheap_check(payload) AND pricey_check(payload))%');

alter function account_events_pl(bigint) rows 2000;
select lab.prove(
  'ROWS replaces the 1,000-row default for a set-returning function',
  (lab.estimate($$ select * from account_events_pl(42) $$) ->> 'Plan Rows')::int = 2000);

\echo
\echo == Triggers: what one costs per row

select lab.prove(
  'foreign keys are triggers: events carries six internal ones for its three foreign keys',
  (select count(*) from pg_trigger
   where tgrelid = 'events'::regclass and tgisinternal) = 6);

-- an unlogged copy keeps the disk out of the timings
create unlogged table ev (like events);
alter table ev add column updated_at timestamptz;
alter table ev add primary key (id);
create unlogged table ev_audit (
  event_id   bigint,
  old_kind   text,
  new_kind   text,
  changed_at timestamptz default now()
);

-- best of n: refill ev with 100,000 rows, then time one statement on it
create function bulk_ms(q text, n int default 5) returns numeric
language plpgsql
as $$
declare
  t0 timestamptz;
  best numeric;
  took numeric;
begin
  for i in 1..n loop
    truncate ev, ev_audit;
    insert into ev select *, created_at from events where id <= 100000;
    t0 := clock_timestamp();
    execute q;
    took := extract(epoch from clock_timestamp() - t0) * 1000;
    if best is null or took < best then best := took; end if;
  end loop;
  return round(best, 1);
end
$$;

create function touch() returns trigger
language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;

create function audit_row() returns trigger
language plpgsql
as $$
begin
  insert into ev_audit (event_id, old_kind, new_kind) values (old.id, old.kind, new.kind);
  return null;
end
$$;

create function audit_statement() returns trigger
language plpgsql
as $$
begin
  insert into ev_audit (event_id, old_kind, new_kind)
  select o.id, o.kind, n.kind
  from old_rows o join new_rows n using (id);
  return null;
end
$$;

select bulk_ms('update ev set kind = kind, updated_at = now()') as t_none \gset

create trigger ev_touch before update on ev
  for each row execute function touch();
select bulk_ms('update ev set kind = kind') as t_before \gset
drop trigger ev_touch on ev;

create trigger ev_audit_row after update on ev
  for each row execute function audit_row();
select bulk_ms('update ev set kind = kind') as t_row \gset
select count(*) as audit_rows_row from ev_audit \gset
drop trigger ev_audit_row on ev;

create trigger ev_audit_stmt after update on ev
  referencing old table as old_rows new table as new_rows
  for each statement execute function audit_statement();
select bulk_ms('update ev set kind = kind') as t_stmt \gset
select count(*) as audit_rows_stmt from ev_audit \gset
drop trigger ev_audit_stmt on ev;

select format('  on your machine, 100,000-row update: %s ms bare, %s ms with a BEFORE row trigger, '
              '%s ms with a row-level audit trigger, %s ms with a statement-level one',
              :t_none, :t_before, :t_row, :t_stmt);

select lab.prove(
  'a one-line BEFORE row trigger makes a 100,000-row update measurably slower (over 15%)',
  :t_before > :t_none * 1.15);

select lab.prove(
  'a row-level audit trigger makes the same update at least 1.4x slower',
  :t_row > :t_none * 1.4);

select lab.prove(
  'both audit triggers write the same 100,000 audit rows',
  :audit_rows_row = 100000 and :audit_rows_stmt = 100000);

-- WAL records on a logged copy: deterministic, unlike bytes and milliseconds.
-- Backend statistics are flushed lazily, so force a flush before each reading.
-- Each run starts from the same fresh, vacuumed 20,000 rows.
create table evl (like ev);
alter table evl add primary key (id);
create table evl_audit (like ev_audit including defaults);

create function refill_evl() returns void
language plpgsql
as $$
begin
  truncate evl, evl_audit;
  insert into evl select *, created_at from events where id <= 20000;
end
$$;

create function audit_row_l() returns trigger
language plpgsql
as $$
begin
  insert into evl_audit (event_id, old_kind, new_kind) values (old.id, old.kind, new.kind);
  return null;
end
$$;
create function audit_statement_l() returns trigger
language plpgsql
as $$
begin
  insert into evl_audit (event_id, old_kind, new_kind)
  select o.id, o.kind, n.kind from old_rows o join new_rows n using (id);
  return null;
end
$$;

select refill_evl() \g /dev/null
vacuum evl;
select pg_stat_force_next_flush() \g /dev/null
select wal_records as r0 from pg_stat_get_backend_wal(pg_backend_pid()) \gset
update evl set kind = kind, updated_at = now();
select pg_stat_force_next_flush() \g /dev/null
select wal_records - :r0 as recs_none from pg_stat_get_backend_wal(pg_backend_pid()) \gset

create trigger evl_touch before update on evl for each row execute function touch();
select refill_evl() \g /dev/null
vacuum evl;
select pg_stat_force_next_flush() \g /dev/null
select wal_records as r0 from pg_stat_get_backend_wal(pg_backend_pid()) \gset
update evl set kind = kind;
select pg_stat_force_next_flush() \g /dev/null
select wal_records - :r0 as recs_before from pg_stat_get_backend_wal(pg_backend_pid()) \gset
drop trigger evl_touch on evl;

create trigger evl_audit_row after update on evl for each row execute function audit_row_l();
select refill_evl() \g /dev/null
vacuum evl;
select pg_stat_force_next_flush() \g /dev/null
select wal_records as r0 from pg_stat_get_backend_wal(pg_backend_pid()) \gset
update evl set kind = kind;
select pg_stat_force_next_flush() \g /dev/null
select wal_records - :r0 as recs_row from pg_stat_get_backend_wal(pg_backend_pid()) \gset

select refill_evl() \g /dev/null
vacuum evl;
select lab.prove(
  'EXPLAIN ANALYZE reports the row-level trigger called once per row: 20,000 calls',
  (select (t ->> 'Calls')::int = 20000
   from jsonb_array_elements(lab.plan($$ update evl set kind = kind $$) -> 'Triggers') t
   where t ->> 'Trigger Name' = 'evl_audit_row'));
drop trigger evl_audit_row on evl;

create trigger evl_audit_stmt after update on evl
  referencing old table as old_rows new table as new_rows
  for each statement execute function audit_statement_l();
select refill_evl() \g /dev/null
vacuum evl;
select pg_stat_force_next_flush() \g /dev/null
select wal_records as r0 from pg_stat_get_backend_wal(pg_backend_pid()) \gset
update evl set kind = kind;
select pg_stat_force_next_flush() \g /dev/null
select wal_records - :r0 as recs_stmt from pg_stat_get_backend_wal(pg_backend_pid()) \gset

select refill_evl() \g /dev/null
vacuum evl;
select lab.prove(
  'and the statement-level trigger once per statement: 1 call',
  (select (t ->> 'Calls')::int = 1
   from jsonb_array_elements(lab.plan($$ update evl set kind = kind $$) -> 'Triggers') t
   where t ->> 'Trigger Name' = 'evl_audit_stmt'));
drop trigger evl_audit_stmt on evl;

select format('  WAL records for 20,000 updated rows: %s bare, %s BEFORE trigger, %s row audit, %s statement audit',
              :recs_none, :recs_before, :recs_row, :recs_stmt);

select lab.prove(
  'a BEFORE UPDATE row trigger adds one WAL record per row: it locks each row before updating it',
  :recs_before - :recs_none between 19000 and 21000);

select lab.prove(
  'an audit trigger adds one insert per row to the WAL, row-level or statement-level alike',
  :recs_row - :recs_none between 19000 and 21500
  and abs(:recs_row - :recs_stmt) < :recs_row * 0.02);


\echo
\echo == The counter trigger serializes writers and piles up row versions

alter table projects add column event_count bigint not null default 0;
vacuum analyze projects;

create function bump_event_count() returns trigger
language plpgsql
as $$
begin
  update projects set event_count = event_count + 1 where id = new.project_id;
  return null;
end
$$;

-- without the trigger, two sessions insert events for the same project freely
select dblink_connect('a', 'dbname=' || current_database()) \g /dev/null
select dblink_connect('b', 'dbname=' || current_database()) \g /dev/null
select pid as b_pid from dblink('b', 'select pg_backend_pid()') as t(pid int) \gset

select dblink_exec('a', 'begin') \g /dev/null
select dblink_exec('a', $q$insert into events (account_id, project_id, user_id, kind)
                           select account_id, id, owner_id, 'build' from projects where id = 7$q$) \g /dev/null
select dblink_send_query('b', $q$insert into events (account_id, project_id, user_id, kind)
                                select account_id, id, owner_id, 'build' from projects where id = 7$q$) \g /dev/null
select pg_sleep(0.5) \g /dev/null
select lab.prove(
  'without a counter trigger, a second insert for the same project does not wait',
  dblink_is_busy('b') = 0);
select * from dblink_get_result('b') as t(r text) \g /dev/null
select * from dblink_get_result('b') as t(r text) \g /dev/null
select dblink_exec('a', 'commit') \g /dev/null

create trigger events_count after insert on events
  for each row execute function bump_event_count();

select dblink_exec('a', 'begin') \g /dev/null
select dblink_exec('a', $q$insert into events (account_id, project_id, user_id, kind)
                           select account_id, id, owner_id, 'build' from projects where id = 7$q$) \g /dev/null
select dblink_send_query('b', $q$insert into events (account_id, project_id, user_id, kind)
                                select account_id, id, owner_id, 'build' from projects where id = 7$q$) \g /dev/null
select pg_sleep(0.5) \g /dev/null
select lab.prove(
  'with the counter trigger, the second insert waits on the first transaction (a transactionid lock)',
  dblink_is_busy('b') = 1
  and (select wait_event_type = 'Lock' and wait_event = 'transactionid'
       from pg_stat_activity where pid = :b_pid)
  and cardinality(pg_blocking_pids(:b_pid)) = 1);
select dblink_exec('a', 'commit') \g /dev/null
select * from dblink_get_result('b') as t(r text) \g /dev/null
select * from dblink_get_result('b') as t(r text) \g /dev/null
select dblink_disconnect('a') \g /dev/null
select dblink_disconnect('b') \g /dev/null

select lab.prove(
  'the counter counted both inserts',
  (select event_count from projects where id = 7) = 2);

-- one statement, many rows for one project: one transaction updates the same row again and again
vacuum projects;
select pg_relation_size('projects') / 8192 as pages_before \gset
select pg_stat_force_next_flush() \g /dev/null
begin;
insert into events (account_id, project_id, user_id, kind)
select p.account_id, p.id, p.owner_id, 'build'
from projects p, generate_series(1, 1000)
where p.id = 8;
select n_tup_upd as upd, n_tup_hot_upd as hot
from pg_stat_xact_user_tables where relname = 'projects' \gset
commit;
select pg_relation_size('projects') / 8192 as pages_after \gset

select format('  1,000 inserts for one project: %s counter updates, %s HOT, projects grew from %s to %s pages',
              :upd, :hot, :pages_before, :pages_after);

select lab.prove(
  'a 1,000-row insert for one project makes 1,000 updates of one counter row, and projects grows',
  :upd = 1000 and :pages_after > :pages_before);

-- eight times the rows for one project, far more than eight times the time: each update walks past the earlier versions
create function counter_insert_ms(project bigint, n int) returns numeric
language plpgsql
as $$
declare t0 timestamptz;
begin
  t0 := clock_timestamp();
  insert into events (account_id, project_id, user_id, kind)
  select p.account_id, p.id, p.owner_id, 'build'
  from projects p, generate_series(1, n)
  where p.id = project;
  return round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
end
$$;
-- best of three, each on a fresh project, vacuuming in between
vacuum projects;
select counter_insert_ms(21, 500) as a1 \gset
vacuum projects;
select counter_insert_ms(22, 500) as a2 \gset
vacuum projects;
select counter_insert_ms(23, 500) as a3 \gset
vacuum projects;
select counter_insert_ms(24, 4000) as b1 \gset
vacuum projects;
select counter_insert_ms(25, 4000) as b2 \gset
vacuum projects;
select counter_insert_ms(26, 4000) as b3 \gset
select least(:a1, :a2, :a3) as t_500, least(:b1, :b2, :b3) as t_4000 \gset
select format('  counter trigger, one project, one statement: %s ms for 500 rows, %s ms for 4,000', :t_500, :t_4000);
select lab.prove(
  'with a row-level counter trigger, eight times the rows for one project takes over 12 times as long',
  :t_4000 > :t_500 * 12);

drop trigger events_count on events;

create function bump_event_counts() returns trigger
language plpgsql
as $$
begin
  update projects p
  set event_count = p.event_count + n.added
  from (select project_id, count(*) as added from new_rows group by project_id) n
  where p.id = n.project_id;
  return null;
end
$$;

create trigger events_count after insert on events
  referencing new table as new_rows
  for each statement execute function bump_event_counts();

vacuum projects;
select pg_stat_force_next_flush() \g /dev/null
begin;
insert into events (account_id, project_id, user_id, kind)
select p.account_id, p.id, p.owner_id, 'build'
from projects p, generate_series(1, 1000)
where p.id = 9;
select n_tup_upd as upd2, n_tup_hot_upd as hot2
from pg_stat_xact_user_tables where relname = 'projects' \gset
commit;

select lab.prove(
  'a statement-level trigger over the transition table updates the counter once, HOT',
  :upd2 = 1 and :hot2 = 1 and (select event_count from projects where id = 9) = 1000);

\echo
\echo == COPY fires triggers; session_replication_role turns them off

copy events (account_id, project_id, user_id, kind) from stdin;
9	10	8	build
9	10	8	deploy
\.

select lab.prove(
  'COPY fires the trigger like INSERT does',
  (select event_count from projects where id = 10) = 2);

set session_replication_role = replica;
insert into events (account_id, project_id, user_id, kind) values (9, 10, 8, 'build');
insert into events (account_id, project_id, user_id, kind) values (9, 999999, 8, 'orphan');
reset session_replication_role;

select lab.prove(
  'with session_replication_role = replica, ordinary triggers do not fire',
  (select event_count from projects where id = 10) = 2);

select lab.prove(
  'and neither do foreign keys: an event for a project that does not exist got in',
  exists (select 1 from events where project_id = 999999));
delete from events where project_id = 999999;

alter table events enable always trigger events_count;
set session_replication_role = replica;
insert into events (account_id, project_id, user_id, kind) values (9, 10, 8, 'build');
reset session_replication_role;
select lab.prove(
  'ENABLE ALWAYS makes a trigger fire under replica too',
  (select event_count from projects where id = 10) = 3);
drop trigger events_count on events;

\echo
\echo == Constraint triggers

create function owner_in_account() returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from users u
                 where u.id = new.owner_id and u.account_id = new.account_id) then
    raise exception 'project % owner % is not in account %', new.id, new.owner_id, new.account_id;
  end if;
  return null;
end
$$;

create constraint trigger projects_owner_in_account
  after insert or update of owner_id, account_id on projects
  deferrable initially deferred
  for each row execute function owner_in_account();

do $$
begin
  insert into projects (account_id, owner_id, name) values (1, 50001, 'cross-account');
  insert into caught values ('deferred', 'inserted', null);
  set constraints projects_owner_in_account immediate;
  raise exception 'no error';
exception when raise_exception then
  insert into caught values ('due', sqlstate, sqlerrm);
end
$$;
select lab.prove(
  'a deferred constraint trigger lets the bad row in, and raises when the check comes due',
  (select msg from caught where k = 'due') like 'project % owner 50001 is not in account 1'
  and not exists (select 1 from projects where name = 'cross-account'));
drop trigger projects_owner_in_account on projects;

\echo
\echo == Procedures commit as they go

create table backfill_demo as
select id, kind, null::text as kind_upper from events where id <= 100000;
alter table backfill_demo add primary key (id);

create procedure backfill_kind_upper(batch int)
language plpgsql
as $$
declare
  last_id bigint := 0;
  max_id  bigint;
begin
  select max(id) into max_id from backfill_demo;
  while last_id < max_id loop
    update backfill_demo set kind_upper = upper(kind)
    where id > last_id and id <= last_id + batch;
    last_id := last_id + batch;
    commit;
  end loop;
end
$$;

call backfill_kind_upper(10000);

select lab.prove(
  'the procedure filled every row, in ten separately committed transactions',
  (select count(*) filter (where kind_upper is null) = 0
          and count(distinct xmin::text) = 10
   from backfill_demo));

select dblink_connect('p', 'dbname=' || current_database()) \g /dev/null
select dblink_exec('p', 'begin') \g /dev/null
do $$
begin
  perform dblink_exec('p', 'call backfill_kind_upper(10000)');
  raise exception 'no error';
exception when others then
  insert into caught values ('call', sqlstate, sqlerrm);
end
$$;
select dblink_disconnect('p') \g /dev/null
select lab.prove(
  'CALL inside an explicit transaction block cannot COMMIT: invalid transaction termination',
  (select state = '2D000' and msg = 'invalid transaction termination' from caught where k = 'call'));

\echo
\echo == Exception blocks are subtransactions

create function loop_plain(n int) returns int
language plpgsql
as $$
declare x int := 0;
begin
  for i in 1..n loop
    begin
      x := x + 1;
    end;
  end loop;
  return x;
end
$$;

create function loop_guarded(n int) returns int
language plpgsql
as $$
declare x int := 0;
begin
  for i in 1..n loop
    begin
      x := x + 1;
    exception when others then
      null;
    end;
  end loop;
  return x;
end
$$;

create function best_ms(q text, n int default 5) returns numeric
language plpgsql
as $$
declare
  t0 timestamptz;
  best numeric;
  took numeric;
begin
  for i in 1..n loop
    t0 := clock_timestamp();
    execute q;
    took := extract(epoch from clock_timestamp() - t0) * 1000;
    if best is null or took < best then best := took; end if;
  end loop;
  return round(best, 2);
end
$$;

select best_ms('select loop_plain(100000)') as t_plain \gset
select best_ms('select loop_guarded(100000)') as t_guarded \gset
select format('  100,000 loop iterations on your machine: %s ms plain, %s ms with an EXCEPTION block',
              :t_plain, :t_guarded);
select lab.prove(
  'entering a block with an EXCEPTION clause costs at least 3x a plain block',
  :t_guarded > :t_plain * 3);

create table guarded_insert (id int primary key);
create function insert_plain(n int) returns void
language plpgsql
as $$ begin for i in 1..n loop insert into guarded_insert values (i); end loop; end $$;
create function insert_guarded(n int) returns void
language plpgsql
as $$
begin
  for i in 1..n loop
    begin
      insert into guarded_insert values (i);
    exception when unique_violation then
      null;
    end;
  end loop;
end
$$;

select insert_plain(1000);
select lab.prove(
  'without exception blocks, 1,000 inserts share one transaction ID',
  (select count(distinct xmin::text) from guarded_insert) = 1);
truncate guarded_insert;
select insert_guarded(1000);
select lab.prove(
  'with one per row, each insert gets its own subtransaction ID: 1,000 of them',
  (select count(distinct xmin::text) from guarded_insert) = 1000);

\echo
\echo == Observing functions

set track_functions = 'all';
begin;
select count(*) from account_events(42) \g /dev/null
select count(*) from account_events_pl(42) \g /dev/null
select count(*) from ae_strict(42) \g /dev/null
select lab.prove(
  'track_functions = all counts PL/pgSQL and non-inlined SQL calls, but never an inlined SQL function',
  (select array_agg(funcname::text order by funcname) from pg_stat_xact_user_functions
   where funcname in ('account_events', 'account_events_pl', 'ae_strict'))
    = array['account_events_pl', 'ae_strict']);
commit;

set pg_stat_statements.track = 'all';
select count(*) from account_events_pl(7) \g /dev/null
select lab.prove(
  'pg_stat_statements.track = all records the statement inside the function, marked toplevel = false',
  exists (select 1 from pg_stat_statements
          where dbid = (select oid from pg_database where datname = current_database())
            and not toplevel
            and query like '%from events where account_id = acct%'));
reset pg_stat_statements.track;

-- The checks below go with "The primary is your most expensive CPU" and
-- "Triggers: what they buy and what they hide". They run last.

\echo
\echo == The primary is your most expensive CPU

-- Server execution time, best of five, from EXPLAIN ANALYZE without per-node
-- timing. The raw query casts each field to text, the work the server does
-- anyway to send a row in the text protocol, so both sides pay for output.
create function exec_ms(q text, n int default 5) returns numeric
language plpgsql
as $$
declare
  p jsonb;
  took numeric;
  best numeric;
begin
  for i in 1..n loop
    execute 'explain (analyze, timing off, format json) ' || q into p;
    took := (p -> 0 ->> 'Execution Time')::numeric;
    if best is null or took < best then best := took; end if;
  end loop;
  return round(best, 1);
end
$$;

\set raw_rows 'select created_at::text, kind, user_id::text, project_id::text, payload ->> ''duration_ms'' as duration_ms, payload ->> ''status'' as status from events where id <= 200000'
\set formatted_rows 'select format(''%s: %s by user %s in project %s took %s ms (%s)'', to_char(created_at at time zone ''America/New_York'', ''FMDay, FMMonth FMDD YYYY at FMHH12:MI AM''), initcap(kind), coalesce(user_id::text, ''system''), project_id, to_char((payload ->> ''duration_ms'')::int, ''FM999,999''), upper(payload ->> ''status'')) as line from events where id <= 200000'

select exec_ms(:'raw_rows') as raw_ms \gset
select exec_ms(:'formatted_rows') as fmt_ms \gset
select sum(coalesce(octet_length(created_at), 0) + octet_length(kind)
           + coalesce(octet_length(user_id), 0) + octet_length(project_id)
           + coalesce(octet_length(duration_ms), 0) + coalesce(octet_length(status), 0))
  as raw_bytes from (:raw_rows) r \gset
select sum(octet_length(line)) as fmt_bytes from (:formatted_rows) f \gset
select format('  200,000 rows on your machine: %s ms of server time raw, %s ms formatted; %s vs %s of text',
              :raw_ms, :fmt_ms, pg_size_pretty(:raw_bytes::bigint), pg_size_pretty(:fmt_bytes::bigint));

select lab.prove(
  'formatting 200,000 rows into sentences in SQL costs the server over 2.5 times the time of returning the fields',
  :fmt_ms > 2.5 * :raw_ms);

select lab.prove(
  'and the formatted text is over 1.5 times the bytes of the raw fields',
  :fmt_bytes > 1.5 * :raw_bytes);

\echo
\echo == Triggers: what they buy and what they hide

create table trig_order (id int primary key, note text not null default '');
create function append_note() returns trigger
language plpgsql
as $$ begin new.note := new.note || tg_argv[0]; return new; end $$;
create trigger z_normalize before insert on trig_order
  for each row execute function append_note('z');
create trigger a_validate before insert on trig_order
  for each row execute function append_note('a');
create trigger m_stamp before insert on trig_order
  for each row execute function append_note('m');
insert into trig_order (id) values (1);

select lab.prove(
  'triggers on the same event fire in name order, not creation order',
  (select note from trig_order where id = 1) = 'amz');

