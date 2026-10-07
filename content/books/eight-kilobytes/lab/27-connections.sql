-- Lab for "Connections aren't free"
-- https://www.flagon.io/books/eight-kilobytes/connections
-- Run: ./lab 27-connections
--
-- Extra connections come from dblink. Memory is read from the backends'
-- own memory contexts and from /proc/<pid>/status, which works because the
-- lab's server runs in the same container as these files. The three timeouts
-- that close the connection are observed by running psql from the server
-- (COPY ... FROM PROGRAM) and reading what it printed.

\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;

-- One line of a backend's /proc/<pid>/status, in kB.
create function proc_kb(pid int, field text) returns bigint
language sql as $$
  select (regexp_match(pg_read_file('/proc/' || pid || '/status'),
                       field || ':\s+(\d+) kB'))[1]::bigint
$$;

\echo
\echo == Every connection is a process

select dblink_connect('c1', 'dbname=' || current_database()) \g /dev/null
select p as c1_pid from dblink('c1', 'select pg_backend_pid()') t(p int) \gset

select lab.prove('a new connection gets its own backend process, with its own pid',
  :c1_pid <> pg_backend_pid()
  and (select backend_type from pg_stat_activity where pid = :c1_pid) = 'client backend');
select lab.prove('that backend is an operating system process named postgres',
  pg_read_file('/proc/' || :c1_pid || '/status') like 'Name:%postgres%');
select lab.prove('the io worker processes (PostgreSQL 18) number io_workers',
  (select count(*) from pg_stat_activity where backend_type = 'io worker')
  = current_setting('io_workers')::int);
select lab.prove('the housekeeping processes are there too',
  (select count(distinct backend_type) from pg_stat_activity
    where backend_type in ('checkpointer', 'background writer', 'walwriter',
                           'autovacuum launcher', 'logical replication launcher')) = 5);

\echo
\echo == Memory

-- An idle backend.
select b as idle_ctx from dblink('c1', 'select sum(total_bytes) from pg_backend_memory_contexts') t(b bigint) \gset
select proc_kb(:c1_pid, 'RssAnon') as idle_anon \gset
\echo idle backend: :idle_ctx bytes in memory contexts, RssAnon :idle_anon kB (your numbers will differ)
select lab.prove('an idle backend holds a few MB of private memory',
  :idle_ctx < 4 * 1024 * 1024 and :idle_anon < 10 * 1024);

-- A large sort in that backend with work_mem = 256MB.
select dblink_exec('c1', 'set work_mem = ''256MB''') \g /dev/null
select dblink_exec('c1', 'set max_parallel_workers_per_gather = 0') \g /dev/null
select kb as sort_kb from dblink('c1', $q$
  select (p -> 'Plan' ->> 'Sort Space Used')::bigint
    from lab.plan('select account_id, created_at from events order by account_id, created_at') p
$q$) t(kb bigint) \gset
select proc_kb(:c1_pid, 'RssAnon') as after_anon \gset
\echo sort used :sort_kb kB in memory; RssAnon afterwards :after_anon kB
select lab.prove('mid-sort, one backend used over 100 MB of private memory',
  :sort_kb > 100 * 1024);
select lab.prove('afterwards it keeps more private memory than when idle',
  :after_anon > :idle_anon);
select dblink_disconnect('c1') \g /dev/null

-- Backends grow with the schema: every table and index they touch is cached.
create schema many;
do $$
begin
  for i in 1..1000 loop
    execute format('create table many.t%s (id bigint primary key, a text, b timestamptz)', i);
  end loop;
end $$;
select dblink_connect('c2', 'dbname=' || current_database()) \g /dev/null
select b as before_ctx from dblink('c2', 'select sum(total_bytes) from pg_backend_memory_contexts') t(b bigint) \gset
select * from dblink('c2', $q$
  do $d$ begin
    for i in 1..1000 loop
      execute format('select * from many.t%s where id = 1', i);
    end loop;
  end $d$
$q$) t(r text) \g /dev/null
select b as after_ctx from dblink('c2', 'select sum(total_bytes) from pg_backend_memory_contexts') t(b bigint) \gset
\echo memory contexts before: :before_ctx bytes, after touching 1,000 tables: :after_ctx bytes
select lab.prove('touching 1,000 tables grows a backend''s caches by more than 10 MB',
  :after_ctx - :before_ctx > 10 * 1024 * 1024);
select dblink_disconnect('c2') \g /dev/null
drop schema many cascade;

\echo
\echo == Setup

-- 50 lookups on one persistent connection versus 50 connect-query-disconnect cycles.
create temp table setup_cost (how text, ms_per_query numeric);
do $$
declare
  t0 timestamptz;
  n  bigint;
begin
  t0 := clock_timestamp();
  for i in 1..50 loop
    perform dblink_connect('c', 'dbname=' || current_database());
    select x into n from dblink('c', 'select id from users where id = 42') t(x bigint);
    perform dblink_disconnect('c');
  end loop;
  insert into setup_cost values ('reconnect', extract(epoch from clock_timestamp() - t0) * 1000 / 50);

  perform dblink_connect('c', 'dbname=' || current_database());
  t0 := clock_timestamp();
  for i in 1..50 loop
    select x into n from dblink('c', 'select id from users where id = 42') t(x bigint);
  end loop;
  insert into setup_cost values ('persistent', extract(epoch from clock_timestamp() - t0) * 1000 / 50);
  perform dblink_disconnect('c');
end $$;
select how || ': ' || round(ms_per_query, 3) || ' ms per lookup' from setup_cost;
select lab.prove('a new connection per query is several times slower than reusing one',
  (select ms_per_query from setup_cost where how = 'reconnect')
  > 5 * (select ms_per_query from setup_cost where how = 'persistent'));

\echo
\echo == max_connections in the thousands hurts

select lab.prove('max_connections defaults to 100 and needs a restart',
  (select boot_val = '100' and context = 'postmaster' from pg_settings where name = 'max_connections'));
select lab.prove('superuser_reserved_connections defaults to 3',
  (select boot_val from pg_settings where name = 'superuser_reserved_connections') = '3');
select lab.prove('reserved_connections (16+) exists, default 0, with the pg_use_reserved_connections role',
  (select boot_val from pg_settings where name = 'reserved_connections') = '0'
  and exists (select 1 from pg_roles where rolname = 'pg_use_reserved_connections'));
select lab.prove('the lock table is sized from max_locks_per_transaction (default 64, restart)',
  (select boot_val = '64' and context = 'postmaster' from pg_settings
    where name = 'max_locks_per_transaction'));

\echo
\echo == Transaction pooling breaks session state

-- One server connection, reused by two "clients", the way a transaction pooler does.
select dblink_connect('server', 'dbname=' || current_database()) \g /dev/null

-- client A
select dblink_exec('server', 'set statement_timeout = ''7s''') \g /dev/null
-- client B, next transaction on the same backend
select lab.prove('a plain SET by one client stays on the backend for the next client',
  (select v from dblink('server', 'show statement_timeout') t(v text)) = '7s');
select dblink_exec('server', 'reset statement_timeout') \g /dev/null

select dblink_exec('server', 'begin') \g /dev/null
select dblink_exec('server', 'set local statement_timeout = ''7s''') \g /dev/null
select * from dblink('server', $$select set_config('app.tenant_id', '42', true)$$) t(v text) \g /dev/null
select dblink_exec('server', 'commit') \g /dev/null
select lab.prove('SET LOCAL and set_config(..., true) reset at commit',
  (select v from dblink('server', 'show statement_timeout') t(v text)) = '0'
  and (select coalesce(v, '') from dblink('server',
         $$select current_setting('app.tenant_id', true)$$) t(v text)) = '');

select * from dblink('server', 'select pg_advisory_lock(1)') t(v text) \g /dev/null
select dblink_exec('server', 'begin; select pg_advisory_xact_lock(2); commit') \g /dev/null
select lab.prove('a session advisory lock outlives the transaction; an xact lock does not',
  (select count(*) from pg_locks where locktype = 'advisory'
     and pid = (select p from dblink('server', 'select pg_backend_pid()') t(p int))
     and objid = 1) = 1
  and (select count(*) from pg_locks where locktype = 'advisory' and objid = 2
          and pid = (select p from dblink('server', 'select pg_backend_pid()') t(p int))) = 0);
select dblink_disconnect('server') \g /dev/null

\echo
\echo == Timeouts

select lab.prove('statement_timeout, lock_timeout, idle_in_transaction_session_timeout, idle_session_timeout and transaction_timeout all default to 0',
  (select bool_and(boot_val = '0') from pg_settings
    where name in ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout',
                   'idle_session_timeout', 'transaction_timeout')));
select lab.prove('and all can be set per role, database, or session (context user)',
  (select bool_and(context = 'user') from pg_settings
    where name in ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout',
                   'idle_session_timeout', 'transaction_timeout')));

-- statement_timeout: the statement is canceled, the connection survives.
select dblink_connect('t', 'dbname=' || current_database()) \g /dev/null
select dblink_exec('t', 'set statement_timeout = ''1s''') \g /dev/null
do $$
begin
  perform * from dblink('t', 'select pg_sleep(2)') t(x text);
  raise exception 'no error';
exception when query_canceled then
  if sqlerrm <> 'canceling statement due to statement timeout' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('statement_timeout cancels the statement: canceling statement due to statement timeout (57014)', true);
select lab.prove('and the connection is still usable',
  (select x from dblink('t', 'select 1') t(x int)) = 1);
select dblink_disconnect('t') \g /dev/null

-- lock_timeout
select dblink_connect('holder', 'dbname=' || current_database()) \g /dev/null
select dblink_exec('holder', 'begin') \g /dev/null
select dblink_exec('holder', 'lock table accounts in access exclusive mode') \g /dev/null
do $$
begin
  set local lock_timeout = '500ms';
  perform count(*) from accounts;
  raise exception 'no error';
exception when lock_not_available then
  if sqlerrm <> 'canceling statement due to lock timeout' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('lock_timeout bounds the wait for a lock (55P03)', true);
select dblink_exec('holder', 'rollback') \g /dev/null
select dblink_disconnect('holder') \g /dev/null

-- The other three are FATAL: they close the connection. A client only sees
-- that if it reads the error the server sent before hanging up, so we run
-- psql (with VERBOSITY=verbose, which prints the SQLSTATE) from the server.
create temp table fatal (timeout text, line text);
do $$
declare
  psql text := format('psql -X -q -At -v VERBOSITY=verbose -d %I 2>&1 | grep FATAL',
                      current_database());
begin
  execute format($c$copy fatal (line) from program %L with (delimiter '|')$c$,
    $s$(echo "set idle_in_transaction_session_timeout = '500ms';"; echo "begin;";
        echo "select 1;"; sleep 1.5; echo "select 2;") | $s$ || psql);
  update fatal set timeout = 'idle_in_transaction_session_timeout' where timeout is null;

  execute format($c$copy fatal (line) from program %L with (delimiter '|')$c$,
    $s$(echo "set transaction_timeout = '2s';"; echo "begin;";
        echo "select pg_sleep(1);"; echo "select pg_sleep(1.5);") | $s$ || psql);
  update fatal set timeout = 'transaction_timeout' where timeout is null;

  execute format($c$copy fatal (line) from program %L with (delimiter '|')$c$,
    $s$(echo "set idle_session_timeout = '500ms';"; sleep 1.5; echo "select 2;") | $s$ || psql);
  update fatal set timeout = 'idle_session_timeout' where timeout is null;
end $$;
select timeout || ': ' || line from fatal order by timeout;

select lab.prove('idle_in_transaction_session_timeout: FATAL 25P03, terminating connection due to idle-in-transaction timeout',
  (select line from fatal where timeout = 'idle_in_transaction_session_timeout')
  = 'FATAL:  25P03: terminating connection due to idle-in-transaction timeout');
select lab.prove('transaction_timeout (17+): FATAL 25P04, even though no statement was slow and the session was never idle',
  (select line from fatal where timeout = 'transaction_timeout')
  = 'FATAL:  25P04: terminating connection due to transaction timeout');
select lab.prove('idle_session_timeout (14+): FATAL 57P05',
  (select line from fatal where timeout = 'idle_session_timeout')
  = 'FATAL:  57P05: terminating connection due to idle-session timeout');

-- The same through a driver that does not read the error first (dblink here):
-- the backend is gone and the client sees a broken connection.
select dblink_connect('i', 'dbname=' || current_database()) \g /dev/null
select p as i_pid from dblink('i', 'select pg_backend_pid()') t(p int) \gset
select dblink_exec('i', 'set idle_in_transaction_session_timeout = ''500ms''') \g /dev/null
select dblink_exec('i', 'begin') \g /dev/null
select pg_sleep(1.5) \g /dev/null
select lab.prove('the idle-in-transaction backend has exited',
  not exists (select 1 from pg_stat_activity where pid = :i_pid));
do $$
begin
  perform dblink_exec('i', 'select 2');
  raise exception 'no error';
exception when connection_failure then
  null;
end $$;
select lab.prove('and the client finds a closed connection (08006)', true);
select dblink_disconnect('i') \g /dev/null

\echo
\echo == TCP keepalives and dead clients

select lab.prove('tcp_keepalives_idle, _interval and _count default to 0, meaning the OS settings',
  (select bool_and(boot_val = '0') from pg_settings
    where name in ('tcp_keepalives_idle', 'tcp_keepalives_interval', 'tcp_keepalives_count')));
select lab.prove('client_connection_check_interval (14+) exists and is off by default',
  (select boot_val from pg_settings where name = 'client_connection_check_interval') = '0');

\echo
\echo '== Count connections from the server''s side'

select lab.prove('the counting query runs and sees this session',
  (select sum(n) from (
     select usename, application_name, state, count(*) as n
       from pg_stat_activity
      where backend_type = 'client backend'
      group by 1, 2, 3) s) >= 1);
