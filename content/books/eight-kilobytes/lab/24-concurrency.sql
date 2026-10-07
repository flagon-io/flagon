-- Lab for "Everyone waits in line"
-- https://www.flagon.io/books/eight-kilobytes/concurrency
-- Run: ./lab 24-concurrency
--
-- Every multi-session claim runs for real: the lab opens extra sessions with
-- dblink, sends them statements that block, and reads pg_locks,
-- pg_stat_activity and pg_blocking_pids() from here while they wait.

\pset tuples_only on
\pset format unaligned

create extension if not exists dblink;

-- pg_stat_activity for this lab's database only, so sessions from anything
-- else running on the server never get mixed in
create view lab.activity as
select * from pg_stat_activity where datname = current_database();

-- Open a named session with its own application_name.
create or replace function lab.open(name text)
returns void
language sql
as $$
  select dblink_connect(name, format('dbname=%s application_name=%s', current_database(), name))
$$;

-- The backend pid behind a named session.
create or replace function lab.pid(name text)
returns int
language sql
as $$
  select pid from dblink(name, 'select pg_backend_pid()') as t(pid int)
$$;

-- Wait for a statement sent with dblink_send_query and return 'ok', or the
-- SQLSTATE and message it failed with.
create or replace function lab.finish(name text)
returns text
language plpgsql
as $$
declare
  state text;
  msg text;
begin
  begin
    perform * from dblink_get_result(name) as r(t text);
    state := 'ok';
  exception when others then
    state := sqlstate || ': ' || sqlerrm;
  end;
  -- read the empty result that ends every async query
  perform * from dblink_get_result(name, false) as r(t text);
  return state;
end
$$;

-- Run a statement in a session synchronously; 'ok' or 'SQLSTATE: message'.
create or replace function lab.run(name text, stmt text)
returns text
language plpgsql
as $$
begin
  perform dblink_exec(name, stmt);
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end
$$;

-- Is a session waiting on a lock right now?
create or replace function lab.waiting(name text)
returns boolean
language sql
as $$
  select coalesce((select wait_event_type = 'Lock' from lab.activity
                   where application_name = name), false)
$$;

select lab.open('tx1'), lab.open('tx2') \g /dev/null

\echo
\echo '== Pick an isolation level on purpose'

create table credits (account_id bigint primary key, balance int not null);
insert into credits values (42, 100);

select lab.prove(
  'read uncommitted reads no uncommitted data: it behaves as read committed',
  lab.run('tx1', 'begin') = 'ok'
  and lab.run('tx1', 'update credits set balance = 1 where account_id = 42') = 'ok'
  and (select balance from dblink('tx2', 'begin isolation level read uncommitted;
                                            select balance from credits where account_id = 42')
       as t(balance int)) = 100
  and lab.run('tx1', 'rollback') = 'ok'
  and lab.run('tx2', 'rollback') = 'ok');

\echo
\echo '== Read committed: the lost update'

-- tx1 spends 30, tx2 spends 20; each reads 100 and writes back its own result
select lab.run('tx1', 'begin'), lab.run('tx2', 'begin') \g /dev/null

select lab.prove(
  'both transactions read a balance of 100',
  (select balance from dblink('tx1', 'select balance from credits where account_id = 42') as t(balance int)) = 100
  and (select balance from dblink('tx2', 'select balance from credits where account_id = 42') as t(balance int)) = 100);

select lab.run('tx1', 'update credits set balance = 70 where account_id = 42') \g /dev/null
select dblink_send_query('tx2', 'update credits set balance = 80 where account_id = 42') \g /dev/null
select pg_sleep(0.3) \g /dev/null

select lab.prove(
  'tx2''s update waits for tx1''s row lock',
  (select wait_event_type = 'Lock' and wait_event = 'transactionid'
          and pg_blocking_pids(pid) = (select array_agg(pid) from lab.activity
                                       where application_name = 'tx1')
   from lab.activity where application_name = 'tx2'));

select lab.run('tx1', 'commit') \g /dev/null
select lab.finish('tx2') as tx2_result \gset
select lab.run('tx2', 'commit') \g /dev/null

select lab.prove(
  'under read committed tx2 proceeds without error and overwrites: balance 80, a lost update',
  :'tx2_result' = 'ok'
  and (select balance from credits where account_id = 42) = 80);

update credits set balance = 100 where account_id = 42;

select lab.run('tx1', 'begin'), lab.run('tx2', 'begin') \g /dev/null

select lab.prove(
  'done in one statement, tx1''s spend of 30 returns 70',
  (select balance from dblink('tx1', 'update credits set balance = balance - 30
                                       where account_id = 42 and balance >= 30
                                       returning balance') as t(balance int)) = 70);

select dblink_send_query('tx2', 'update credits set balance = balance - 20
                                 where account_id = 42 and balance >= 20
                                 returning balance') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select lab.run('tx1', 'commit') \g /dev/null

select lab.prove(
  'tx2 re-reads the committed row and its spend of 20 returns 50',
  (select balance from dblink_get_result('tx2') as t(balance int)) = 50);

select dblink_get_result('tx2') \g /dev/null
select lab.run('tx2', 'commit') \g /dev/null

\echo
\echo '== Repeatable read'

update credits set balance = 100 where account_id = 42;

select lab.run('tx1', 'begin'),
       lab.run('tx2', 'begin isolation level repeatable read') \g /dev/null

select lab.prove(
  'both read 100 again',
  (select balance from dblink('tx1', 'select balance from credits where account_id = 42') as t(balance int)) = 100
  and (select balance from dblink('tx2', 'select balance from credits where account_id = 42') as t(balance int)) = 100);

select lab.run('tx1', 'update credits set balance = 70 where account_id = 42') \g /dev/null
select dblink_send_query('tx2', 'update credits set balance = 80 where account_id = 42') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select lab.run('tx1', 'commit') \g /dev/null
select lab.finish('tx2') as tx2_result \gset
select lab.run('tx2', 'rollback') \g /dev/null

select lab.prove(
  'under repeatable read tx2 fails with 40001 could not serialize access due to concurrent update, and tx1''s 70 stands',
  :'tx2_result' = '40001: could not serialize access due to concurrent update'
  and (select balance from credits where account_id = 42) = 70);

\echo
\echo '== Serializable: write skew'

create table on_call (
  account_id  bigint  not null,
  user_id     bigint  not null,
  active      boolean not null,
  primary key (account_id, user_id)
);
insert into on_call values (42, 1, true), (42, 2, true);

select lab.run('tx1', 'begin isolation level repeatable read'),
       lab.run('tx2', 'begin isolation level repeatable read') \g /dev/null

select lab.prove(
  'under repeatable read both transactions count 2 people on call',
  (select n from dblink('tx1', 'select count(*) from on_call where account_id = 42 and active') as t(n int)) = 2
  and (select n from dblink('tx2', 'select count(*) from on_call where account_id = 42 and active') as t(n int)) = 2);

select lab.run('tx1', 'update on_call set active = false where account_id = 42 and user_id = 1')
         || ' / ' || lab.run('tx2', 'update on_call set active = false where account_id = 42 and user_id = 2')
         || ' / ' || lab.run('tx1', 'commit')
         || ' / ' || lab.run('tx2', 'commit') as outcome \gset

select lab.prove(
  'both go off call, both commit, and nobody is on call',
  :'outcome' = 'ok / ok / ok / ok'
  and (select count(*) from on_call where active) = 0);

update on_call set active = true;

select lab.run('tx1', 'begin isolation level serializable'),
       lab.run('tx2', 'begin isolation level serializable') \g /dev/null

select lab.prove(
  'under serializable both count 2 as well',
  (select n from dblink('tx1', 'select count(*) from on_call where account_id = 42 and active') as t(n int)) = 2
  and (select n from dblink('tx2', 'select count(*) from on_call where account_id = 42 and active') as t(n int)) = 2);

select lab.prove(
  'serializable records what each transaction read as SIReadLock entries in pg_locks',
  exists (select from pg_locks l join lab.activity a using (pid)
          where a.application_name = 'tx1' and l.mode = 'SIReadLock'));

select lab.run('tx1', 'update on_call set active = false where account_id = 42 and user_id = 1')
         || ' / ' || lab.run('tx2', 'update on_call set active = false where account_id = 42 and user_id = 2')
         || ' / ' || lab.run('tx1', 'commit')
         || ' / ' || lab.run('tx2', 'commit') as outcome \gset
select lab.run('tx1', 'rollback'), lab.run('tx2', 'rollback') \g /dev/null

select lab.prove(
  'one transaction fails with 40001 could not serialize access due to read/write dependencies, and someone stays on call',
  :'outcome' like '%40001: could not serialize access due to read/write dependencies among transactions%'
  and (select count(*) from on_call where active) = 1);

\echo
\echo '== One error aborts the whole transaction'

select lab.prove(
  'after a duplicate key error, the next statement fails with 25P02 and COMMIT reports ROLLBACK',
  lab.run('tx1', 'begin') = 'ok'
  and lab.run('tx1', $$insert into users (account_id, email, name) values (1, 'new@example.com', 'New')$$) = 'ok'
  and lab.run('tx1', $$insert into users (account_id, email, name) values (2, 'user1@example.com', 'Dup')$$)
      = '23505: duplicate key value violates unique constraint "users_account_id_email_key"'
  and lab.run('tx1', 'update accounts set name = name where id = 1')
      = '25P02: current transaction is aborted, commands ignored until end of transaction block'
  and dblink_exec('tx1', 'commit') = 'ROLLBACK');

select lab.prove(
  'the first insert is gone too',
  not exists (select from users where email = 'new@example.com'));

\echo
\echo '== Savepoints contain the damage'

select lab.prove(
  'rolling back to a savepoint undoes the failed statement and keeps the insert before it',
  lab.run('tx1', 'begin') = 'ok'
  and lab.run('tx1', $$insert into accounts (name) values ('Acme')$$) = 'ok'
  and lab.run('tx1', 'savepoint before_risky') = 'ok'
  and lab.run('tx1', 'select * from nope') = '42P01: relation "nope" does not exist'
  and lab.run('tx1', 'rollback to savepoint before_risky') = 'ok'
  and (select n from dblink('tx1', $$select count(*) from accounts where name = 'Acme'$$) as t(n int)) = 1
  and dblink_exec('tx1', 'commit') = 'COMMIT');

select lab.prove(
  'and the transaction committed: Acme is there',
  (select count(*) from accounts where name = 'Acme') = 1);

\echo
\echo '== Subtransactions are not free'

create table subxact_demo (n int);

-- this session's own subtransaction cache, read fresh each time
create or replace function lab.my_subxact()
returns table (subxact_count int, subxact_overflowed boolean)
language sql
as $$
  select s.subxact_count, s.subxact_overflowed
  from (select pg_stat_clear_snapshot()) c,
       pg_stat_get_backend_idset() as id,
       pg_stat_get_backend_subxact(id) as s
  where pg_stat_get_backend_pid(id) = pg_backend_pid()
$$;

create temp table caught (n int, overflowed boolean);

do $$
begin
  begin
    insert into subxact_demo values (0);
    insert into caught select * from lab.my_subxact();
  exception when others then
    raise;
  end;
end
$$;

select lab.prove(
  'a PL/pgSQL block with an EXCEPTION handler runs as a subtransaction',
  (select n from caught) = 1);

begin;
select format('savepoint s%s', g), format('insert into subxact_demo values (%s)', g)
from generate_series(1, 64) g \gexec

select lab.prove(
  'after 64 savepoints, each followed by an insert: 64 cached, not overflowed',
  (select (subxact_count, subxact_overflowed) = (64, false) from lab.my_subxact()));

savepoint s65;
insert into subxact_demo values (65);

select lab.prove(
  'one more: the count stops at 64 and the overflow flag flips',
  (select (subxact_count, subxact_overflowed) = (64, true) from lab.my_subxact()));
rollback;

\echo
\echo '== Every statement locks the table'

-- The table locks a statement takes, read from pg_locks, then rolled back.
create or replace function lab.locks_taken(stmt text, tables text[])
returns text[]
language plpgsql
as $$
declare
  result text[];
begin
  begin
    execute stmt;
    select array_agg(relation::regclass::text || ' ' || mode order by relation::regclass::text, mode)
    into result
    from pg_locks
    where pid = pg_backend_pid() and locktype = 'relation'
      and relation::regclass::text = any(tables);
    raise exception 'undo';
  exception when raise_exception then
    null;
  end;
  return result;
end
$$;

alter table projects add constraint name_not_empty check (name <> '') not valid;
create table scratch (id int);

select lab.prove('select takes AccessShareLock',
  lab.locks_taken('select count(*) from projects', '{projects}') = '{"projects AccessShareLock"}');
select lab.prove('select ... for update takes RowShareLock',
  lab.locks_taken('select * from projects where id = 1 for update', '{projects}') = '{"projects RowShareLock"}');
select lab.prove('update takes RowExclusiveLock',
  lab.locks_taken($$update projects set name = name where id = 1$$, '{projects}') = '{"projects RowExclusiveLock"}');
select lab.prove('create index takes ShareLock',
  lab.locks_taken('create index on projects (created_at)', '{projects}') = '{"projects ShareLock"}');
select lab.prove('add column takes AccessExclusiveLock',
  lab.locks_taken('alter table projects add column note text', '{projects}') = '{"projects AccessExclusiveLock"}');
select lab.prove('add constraint ... check ... not valid takes AccessExclusiveLock',
  lab.locks_taken($$alter table projects add constraint c check (id > 0) not valid$$, '{projects}')
    = '{"projects AccessExclusiveLock"}');
select lab.prove('validate constraint takes ShareUpdateExclusiveLock',
  lab.locks_taken('alter table projects validate constraint name_not_empty', '{projects}')
    = '{"projects ShareUpdateExclusiveLock"}');
select lab.prove('add foreign key ... not valid takes ShareRowExclusiveLock on both tables',
  lab.locks_taken('alter table projects add constraint p_acct foreign key (account_id) references accounts (id) not valid',
                  '{projects,accounts}')
    @> '{"accounts ShareRowExclusiveLock","projects ShareRowExclusiveLock"}');
select lab.prove('set statistics takes ShareUpdateExclusiveLock',
  lab.locks_taken('alter table projects alter column name set statistics 500', '{projects}')
    = '{"projects ShareUpdateExclusiveLock"}');
select lab.prove('set (fillfactor = 90) takes ShareUpdateExclusiveLock',
  lab.locks_taken('alter table projects set (fillfactor = 90)', '{projects}')
    = '{"projects ShareUpdateExclusiveLock"}');
select lab.prove('rename column takes AccessExclusiveLock',
  lab.locks_taken('alter table projects rename column name to title', '{projects}')
    = '{"projects AccessExclusiveLock"}');
select lab.prove('truncate takes AccessExclusiveLock',
  lab.locks_taken('truncate scratch', '{scratch}') @> '{"scratch AccessExclusiveLock"}');

\echo
\echo '== The lock queue problem'

select lab.open('reporting'), lab.open('migration'), lab.open('web') \g /dev/null

select lab.run('reporting', 'begin'),
       (select n from dblink('reporting', 'select count(*) from accounts') as t(n int)) \g /dev/null
select dblink_send_query('migration', 'alter table accounts add column note text') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select dblink_send_query('web', 'select name from accounts where id = 42') \g /dev/null
select pg_sleep(0.3) \g /dev/null

select pid as reporting_pid from lab.activity where application_name = 'reporting' \gset
select pid as migration_pid from lab.activity where application_name = 'migration' \gset
select pid as web_pid from lab.activity where application_name = 'web' \gset

select lab.prove(
  'reporting sits idle in transaction holding AccessShareLock on accounts',
  (select state = 'idle in transaction' from lab.activity where pid = :reporting_pid)
  and exists (select from pg_locks where pid = :reporting_pid and relation = 'accounts'::regclass
              and mode = 'AccessShareLock' and granted));

select lab.prove(
  'the migration waits for AccessExclusiveLock, blocked by reporting',
  exists (select from pg_locks where pid = :migration_pid and relation = 'accounts'::regclass
          and mode = 'AccessExclusiveLock' and not granted)
  and pg_blocking_pids(:migration_pid) = array[:reporting_pid]);

select lab.prove(
  'the web SELECT waits too: its AccessShareLock is not granted, and it is blocked by the migration',
  exists (select from pg_locks where pid = :web_pid and relation = 'accounts'::regclass
          and mode = 'AccessShareLock' and not granted)
  and pg_blocking_pids(:web_pid) = array[:migration_pid]
  and (select (wait_event_type, wait_event) = ('Lock', 'relation') from lab.activity where pid = :web_pid));

select lab.prove(
  'the root of the chain has an empty blocked_by',
  pg_blocking_pids(:reporting_pid) = '{}');

select lab.prove(
  'pg_cancel_backend does nothing useful to an idle-in-transaction session',
  pg_cancel_backend(:reporting_pid)
  and (select pg_sleep(0.2)) is not null
  and (select state = 'idle in transaction' from lab.activity where pid = :reporting_pid)
  and lab.waiting('migration'));

select lab.run('reporting', 'commit') \g /dev/null
select lab.finish('migration') as migration_result, lab.finish('web') as web_result \gset

select lab.prove(
  'when reporting commits, the migration runs and the queue drains',
  :'migration_result' = 'ok' and :'web_result' = 'ok'
  and exists (select from pg_attribute where attrelid = 'accounts'::regclass and attname = 'note'));

alter table accounts drop column note;

select lab.run('reporting', 'begin'),
       (select n from dblink('reporting', 'select count(*) from accounts') as t(n int)) \g /dev/null

set lock_timeout = '2s';
select lab.prove(
  'with lock_timeout = 2s the migration gives up: canceling statement due to lock timeout',
  lab.try('alter table accounts add column note text')
    = '55P03: canceling statement due to lock timeout');
reset lock_timeout;

select lab.prove(
  'pg_terminate_backend ends the idle-in-transaction session and rolls it back',
  pg_terminate_backend(:reporting_pid, 5000)
  and not exists (select from lab.activity where pid = :reporting_pid));

select dblink_disconnect('reporting'), dblink_disconnect('migration'), dblink_disconnect('web') \g /dev/null

\echo
\echo '== Row locks'

select lab.run('tx1', 'begin'),
       lab.run('tx1', $$update projects set name = 'Renamed' where id = 1$$) \g /dev/null

select lab.prove(
  'a held row lock is not listed in pg_locks: no tuple entries for the locker',
  not exists (select from pg_locks l join lab.activity a using (pid)
              where a.application_name = 'tx1' and l.locktype = 'tuple'));

set lock_timeout = '1s';
select lab.prove(
  'an ordinary update of the project (FOR NO KEY UPDATE) does not block inserting its child event',
  lab.try($$insert into events (account_id, project_id, user_id, kind) values (9, 1, 8, 'comment')$$)
    = 'ok');
reset lock_timeout;

select lab.run('tx1', 'rollback') \g /dev/null

select lab.run('tx1', 'begin'),
       (select n from dblink('tx1', 'select id from projects where id = 1 for no key update') as t(n int)) \g /dev/null
set lock_timeout = '1s';
select lab.prove(
  'an explicit FOR NO KEY UPDATE does not block it either',
  lab.try($$insert into events (account_id, project_id, user_id, kind) values (9, 1, 8, 'comment')$$)
    = 'ok');
reset lock_timeout;
select lab.run('tx1', 'rollback') \g /dev/null

select lab.run('tx1', 'begin'),
       (select n from dblink('tx1', 'select id from projects where id = 1 for update') as t(n int)) \g /dev/null
select dblink_send_query('tx2', $$insert into events (account_id, project_id, user_id, kind)
                                  values (9, 1, 8, 'comment')$$) \g /dev/null
select pg_sleep(0.3) \g /dev/null

select lab.prove(
  'FOR UPDATE on the project blocks the insert: an ungranted ShareLock on the locker''s transactionid',
  exists (select from pg_locks l join lab.activity a using (pid)
          where a.application_name = 'tx2' and l.locktype = 'transactionid'
            and l.mode = 'ShareLock' and not l.granted)
  and (select pg_blocking_pids(pid) from lab.activity where application_name = 'tx2')
      = (select array_agg(pid) from lab.activity where application_name = 'tx1'));

select lab.run('tx1', 'rollback') \g /dev/null
select lab.prove(
  'the insert completes once the locker rolls back',
  lab.finish('tx2') = 'ok');

\echo
\echo '== A job queue with SKIP LOCKED'

create table jobs (
  id          bigint generated always as identity primary key,
  queue       text not null default 'default',
  payload     jsonb not null,
  status      text not null default 'queued'
              check (status in ('queued', 'running', 'done', 'failed')),
  attempts    int not null default 0,
  run_at      timestamptz not null default now(),
  locked_at   timestamptz,
  locked_by   text,
  last_error  text,
  created_at  timestamptz not null default now()
);

create index jobs_ready_idx on jobs (queue, run_at, id)
  where status = 'queued';

insert into jobs (payload, status, run_at)
select jsonb_build_object('project', g), 'done', now() - interval '1 day'
from generate_series(1, 200000) g;
insert into jobs (payload, run_at)
select jsonb_build_object('project', g), now() - interval '1 minute'
from generate_series(1, 5) g;
vacuum analyze jobs;

-- every index a plan touches
create or replace function lab.index_names(node jsonb)
returns text[]
language sql
as $$
  with recursive walk(n) as (
    select node
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.n -> 'Plans', '[]')) as child
  )
  select array_agg(n ->> 'Index Name') filter (where n ? 'Index Name') from walk
$$;

begin;
select lab.prove(
  'with 200,000 finished jobs and 5 queued, a claim reads about 20 pages through the partial index',
  (select 'jobs_ready_idx' = any(lab.index_names(p -> 'Plan'))
      and (p -> 'Plan' ->> 'Shared Hit Blocks')::int + (p -> 'Plan' ->> 'Shared Read Blocks')::int < 40
   from lab.plan($$
     update jobs
     set status    = 'running',
         attempts  = attempts + 1,
         locked_at = now(),
         locked_by = 'worker-a'
     where id = (
       select id from jobs
       where queue = 'default' and status = 'queued' and run_at <= now()
       order by run_at, id
       limit 1
       for update skip locked
     )
     returning id, payload, attempts $$) p));
rollback;

select lab.open('worker-a'), lab.open('worker-b'), lab.open('worker-c') \g /dev/null

-- worker-a claims inside a transaction and holds it
select lab.run('worker-a', 'begin') \g /dev/null
select id as a_job from dblink('worker-a', $$
  update jobs set status = 'running', attempts = attempts + 1,
                  locked_at = now(), locked_by = 'worker-a'
  where id = (select id from jobs
              where queue = 'default' and status = 'queued' and run_at <= now()
              order by run_at, id limit 1
              for update skip locked)
  returning id $$) as t(id bigint) \gset

select id as b_job from dblink('worker-b', $$
  update jobs set status = 'running', attempts = attempts + 1,
                  locked_at = now(), locked_by = 'worker-b'
  where id = (select id from jobs
              where queue = 'default' and status = 'queued' and run_at <= now()
              order by run_at, id limit 1
              for update skip locked)
  returning id $$) as t(id bigint) \gset

select lab.prove(
  'worker-b gets the next job immediately, not worker-a''s',
  :b_job = :a_job + 1);

select lab.prove(
  'without skip locked, worker-c queues behind worker-a''s lock until its lock_timeout fires',
  lab.run('worker-c', 'set lock_timeout = ''1s''') = 'ok'
  and lab.run('worker-c', $$select id from jobs
                            where queue = 'default' and status = 'queued' and run_at <= now()
                            order by run_at, id limit 1
                            for update$$)
      = '55P03: canceling statement due to lock timeout');

select lab.run('worker-a', 'commit') \g /dev/null

update jobs
set status     = case when attempts >= 5 then 'failed' else 'queued' end,
    run_at     = now() + interval '10 seconds' * power(2, attempts),
    last_error = 'boom',
    locked_at  = null
where id = :b_job;

select lab.prove(
  'a failed first attempt is requeued 20 seconds out',
  (select status = 'queued' and run_at - now() between interval '19 seconds' and interval '21 seconds'
   from jobs where id = :b_job));

update jobs set locked_at = now() - interval '1 hour' where id = :a_job;
update jobs
set status = 'queued', locked_at = null, locked_by = null
where status = 'running' and locked_at < now() - interval '15 minutes';

select lab.prove(
  'the reaper requeues a job stuck in running',
  (select status from jobs where id = :a_job) = 'queued');

select dblink_disconnect('worker-a'), dblink_disconnect('worker-b'), dblink_disconnect('worker-c') \g /dev/null

\echo
\echo '== Advisory locks'

select lab.open('cron-a'), lab.open('cron-b') \g /dev/null

select lab.prove(
  'the first cron instance gets the lock, the second does not',
  (select got from dblink('cron-a', $$select pg_try_advisory_lock(hashtext('nightly-rollup'))$$) as t(got boolean))
  and not (select got from dblink('cron-b', $$select pg_try_advisory_lock(hashtext('nightly-rollup'))$$) as t(got boolean)));

select lab.prove(
  'pg_locks shows it: advisory, classid 0, objid 107030647 = hashtext(''nightly-rollup''), ExclusiveLock, granted',
  hashtext('nightly-rollup') = 107030647
  and exists (select from pg_locks l join lab.activity a using (pid)
              where a.application_name = 'cron-a' and l.locktype = 'advisory'
                and l.classid = 0 and l.objid = 107030647
                and l.mode = 'ExclusiveLock' and l.granted));

select lab.prove(
  'a session-level advisory lock outlives the transaction',
  lab.run('cron-a', 'begin') = 'ok' and lab.run('cron-a', 'commit') = 'ok'
  and not (select got from dblink('cron-b', $$select pg_try_advisory_lock(hashtext('nightly-rollup'))$$) as t(got boolean)));

select lab.prove(
  'a transaction-scoped advisory lock is released at commit',
  lab.run('cron-a', 'begin') = 'ok'
  and (select true from dblink('cron-a', 'select pg_advisory_xact_lock(1, 42)') as t(v text))
  and not (select got from dblink('cron-b', 'select pg_try_advisory_xact_lock(1, 42)') as t(got boolean))
  and lab.run('cron-a', 'commit') = 'ok'
  and (select got from dblink('cron-b', 'select pg_try_advisory_xact_lock(1, 42)') as t(got boolean)));

select lab.prove(
  'shared advisory locks allow many holders and exclude an exclusive one',
  (select got from dblink('cron-a', 'select pg_try_advisory_lock_shared(7)') as t(got boolean))
  and (select got from dblink('cron-b', 'select pg_try_advisory_lock_shared(7)') as t(got boolean))
  and not pg_try_advisory_lock(7));

select dblink_disconnect('cron-a'), dblink_disconnect('cron-b') \g /dev/null

\echo
\echo '== Deadlocks are an ordering bug'

select lab.prove('deadlock_timeout defaults to 1 second',
  (select setting = '1000' and unit = 'ms' from pg_settings where name = 'deadlock_timeout'));

select deadlocks as deadlocks_before from pg_stat_database where datname = current_database() \gset

select lab.run('tx1', 'begin'), lab.run('tx2', 'begin') \g /dev/null
select lab.run('tx1', 'update accounts set name = name where id = 1'),
       lab.run('tx2', 'update accounts set name = name where id = 2') \g /dev/null
select dblink_send_query('tx1', 'update accounts set name = name where id = 2') \g /dev/null
select pg_sleep(0.2) \g /dev/null
select dblink_send_query('tx2', 'update accounts set name = name where id = 1') \g /dev/null

select lab.finish('tx1') || ' / ' || lab.finish('tx2') as outcome \gset
select lab.run('tx1', 'rollback'), lab.run('tx2', 'rollback') \g /dev/null

select lab.prove(
  'exactly one of the two fails with 40P01 deadlock detected; the other gets its lock',
  :'outcome' in ('40P01: deadlock detected / ok', 'ok / 40P01: deadlock detected'));

select pg_sleep(1.5) \g /dev/null
select pg_stat_clear_snapshot() \g /dev/null

select lab.prove(
  'pg_stat_database counts the deadlock',
  (select deadlocks from pg_stat_database where datname = current_database()) > :deadlocks_before);

select dblink_disconnect('tx1'), dblink_disconnect('tx2') \g /dev/null

\echo
\echo '== Locks you did not take'

select lab.prove(
  'pg_wait_events (PostgreSQL 17+) names the LWLocks the chapter describes',
  (select count(*) from pg_wait_events
   where type = 'LWLock'
     and name in ('LockManager', 'BufferMapping', 'WALWrite', 'BufferContent',
                  'XactSLRU', 'SubtransSLRU', 'MultiXactOffsetSLRU', 'MultiXactMemberSLRU')) = 8);

select lab.prove(
  'relation extension waits are Lock:extend, the write itself IO:DataFileExtend; SLRU reads are IO:SlruRead; long spins are Timeout:SpinDelay',
  (select count(*) from pg_wait_events
   where (type, name) in (('Lock', 'extend'), ('IO', 'DataFileExtend'),
                          ('IO', 'SlruRead'), ('Timeout', 'SpinDelay'))) = 4);

select lab.prove(
  'max_locks_per_transaction defaults to 64',
  current_setting('max_locks_per_transaction') = '64');

-- the fast path: one transaction locks 100 small tables in AccessShare mode
select format('create table fp_%s (id int)', g) from generate_series(1, 100) g \gexec

begin;
select format('lock table fp_%s in access share mode', g) from generate_series(1, 100) g \gexec
select count(*) filter (where fastpath)     as fp_fast,
       count(*) filter (where not fastpath) as fp_slow
from pg_locks
where pid = pg_backend_pid() and locktype = 'relation'
  and relation::regclass::text like 'fp\_%' \gset
commit;

select lab.prove(
  'PostgreSQL 18 has more than 16 fast-path slots, at most 64 at the default max_locks_per_transaction; the rest go to the shared lock table',
  :fp_fast > 16 and :fp_fast <= 64 and :fp_fast + :fp_slow = 100);

select format('drop table fp_%s', g) from generate_series(1, 100) g \gexec

select lab.prove(
  'pg_stat_slru (PostgreSQL 17 names) tracks the transaction, subtransaction, and multixact caches',
  (select count(*) from pg_stat_slru
   where name in ('transaction', 'subtransaction', 'multixact_offset', 'multixact_member')) = 4);

select lab.prove(
  'PostgreSQL 17+ SLRU sizes: multixact offset 16 and member 32 pages by default, transaction and subtransaction auto (0); all restart-only',
  (select bool_and(context = 'postmaster') from pg_settings
   where name in ('transaction_buffers', 'subtransaction_buffers',
                  'multixact_offset_buffers', 'multixact_member_buffers'))
  and (select boot_val from pg_settings where name = 'multixact_offset_buffers') = '16'
  and (select boot_val from pg_settings where name = 'multixact_member_buffers') = '32'
  and (select boot_val from pg_settings where name = 'transaction_buffers') = '0'
  and (select boot_val from pg_settings where name = 'subtransaction_buffers') = '0');

\echo
\echo '== Multixacts: many transactions, one row'

create extension if not exists pgrowlocks;
create table mx_parent (id int primary key, name text);
insert into mx_parent values (1, 'popular');
create table mx_child (
  id         int generated always as identity primary key,
  parent_id  int not null references mx_parent (id)
);

select lab.open('kid1'), lab.open('kid2'), lab.open('kid3') \g /dev/null

select lab.run('kid1', 'begin'),
       lab.run('kid1', 'insert into mx_child (parent_id) values (1)') \g /dev/null

select lab.prove(
  'one open child insert locks the parent FOR KEY SHARE with a plain transaction ID, no multixact',
  (select not multi and modes = '{"For Key Share"}'::text[] from pgrowlocks('mx_parent')));

select lab.run('kid2', 'begin'),
       lab.run('kid2', 'insert into mx_child (parent_id) values (1)') \g /dev/null

select multi as mx_multi, locker as mx_two from pgrowlocks('mx_parent') \gset

select lab.prove(
  'two open child inserts make the parent row''s xmax a multixact of two FOR KEY SHARE members',
  :'mx_multi' = 't'
  and (select count(*) = 2 and bool_and(mode = 'keysh')
       from pg_get_multixact_members(:'mx_two'::xid)));

select lab.run('kid3', 'begin'),
       lab.run('kid3', 'insert into mx_child (parent_id) values (1)') \g /dev/null

select locker as mx_three from pgrowlocks('mx_parent') \gset

select lab.prove(
  'a third locker creates a new multixact holding all three, rather than changing the old one',
  :'mx_three' <> :'mx_two'
  and (select count(*) = 3 and bool_and(mode = 'keysh')
       from pg_get_multixact_members(:'mx_three'::xid)));

select lab.prove(
  'the old two-member multixact still lists two members: multixacts never change',
  (select count(*) from pg_get_multixact_members(:'mx_two'::xid)) = 2);

\pset tuples_only off
\pset format aligned
select multi, modes from pgrowlocks('mx_parent');
select * from pg_get_multixact_members((select xmax from mx_parent where id = 1));
\pset tuples_only on
\pset format unaligned

select lab.run('kid1', 'commit'), lab.run('kid2', 'commit'), lab.run('kid3', 'commit') \g /dev/null
select dblink_disconnect('kid1'), dblink_disconnect('kid2'), dblink_disconnect('kid3') \g /dev/null

select lab.prove(
  'multixact age is tracked per database and per table (mxid_age of datminmxid and relminmxid)',
  (select mxid_age(datminmxid) >= 0 from pg_database where datname = current_database())
  and (select mxid_age(relminmxid) >= 0 from pg_class where relname = 'mx_parent'));

select lab.prove(
  'autovacuum_multixact_freeze_max_age defaults to 400 million and can be lowered per table',
  current_setting('autovacuum_multixact_freeze_max_age') = '400000000'
  and lab.try('alter table mx_parent set (autovacuum_multixact_freeze_max_age = 100000000)') = 'ok');

\pset tuples_only off
\pset format aligned
select name, blks_hit, blks_read, blks_zeroed
from pg_stat_slru
order by blks_read desc;
\pset tuples_only on
\pset format unaligned
