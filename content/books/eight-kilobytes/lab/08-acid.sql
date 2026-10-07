-- Lab for "ACID, honestly"
-- https://www.flagon.io/books/eight-kilobytes/acid
-- Run: ./lab 08-acid
--
-- The single-server checks: atomicity on the page, constraints and when they
-- fire, isolation levels with real concurrent sessions (dblink), commit and
-- WAL flushes, and the places ACID stops at your application's edge.
-- The crash tests (kill -9, restart, see what survived) need a server of
-- their own: run `bash 08-acid.sh` from this folder.

\pset tuples_only on
\pset format unaligned

create extension if not exists dblink;
create extension if not exists pg_walinspect;

-- WAL this backend has fsynced, from its own statistics (PostgreSQL 18+;
-- lab.my_wal() has its bytes). pg_stat_force_next_flush() makes them current.
create or replace function lab.my_wal_fsyncs()
returns bigint
language sql
as $$
  select sum(fsyncs)::bigint
  from pg_stat_get_backend_io(pg_backend_pid())
  where object = 'wal'
$$;

-- Two more sessions, s1 and s2, for the concurrency and crashed-app demos.
-- lab.on() runs a command in one; lab.try_on() returns its error message,
-- or 'ok'; lab.wait_result() waits for a command sent earlier with
-- dblink_send_query() and does the same.
create procedure lab.on(conn text, cmd text)
language plpgsql
as $$ begin perform dblink_exec(conn, cmd); end $$;

create function lab.try_on(conn text, cmd text)
returns text
language plpgsql
as $$
begin
  perform dblink_exec(conn, cmd);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create function lab.wait_result(conn text)
returns text
language plpgsql
as $$
declare
  msg text := 'ok';
begin
  begin
    perform * from dblink_get_result(conn) as r(x text);
  exception when others then
    msg := sqlerrm;
  end;
  perform * from dblink_get_result(conn, false) as r(x text);
  return msg;
end $$;

create procedure lab.connect(conn text)
language sql
as $$ select dblink_connect(conn, 'dbname=' || current_database()) $$;

call lab.connect('s1');
call lab.connect('s2');

\echo
\echo '== Atomicity: nothing is undone'

create table credits (
  account_id bigint primary key,
  balance    int not null check (balance >= 0)
);
insert into credits select id, 100 from accounts;
-- Account 1000 can't afford the next charge, and its row sits last in the table.
update credits set balance = 5 where account_id = 1000;
vacuum (freeze, analyze) credits;

begin;
insert into credits values (5001, 50), (5002, 50), (5003, 50);
select pg_current_xact_id() as aborted_xid \gset
rollback;

select lab.prove(
  'after rollback, all three row versions are still on the page',
  (select count(*) = 3
   from heap_page_items(get_raw_page('credits', (pg_relation_size('credits') / 8192 - 1)::int))
   where t_xmin::text = :'aborted_xid'));

select lab.prove(
  'pg_xact says their transaction aborted',
  pg_xact_status(:'aborted_xid') = 'aborted');

select lab.prove(
  'no query sees them',
  (select count(*) = 0 from credits where account_id > 5000));

select lab.prove(
  'the first reader stamped them HEAP_XMIN_INVALID (a hint bit: "inserter aborted")',
  (select bool_and('HEAP_XMIN_INVALID' = any(raw_flags))
   from heap_page_items(get_raw_page('credits', (pg_relation_size('credits') / 8192 - 1)::int)),
        heap_tuple_infomask_flags(t_infomask, t_infomask2)
   where t_xmin::text = :'aborted_xid'));

vacuum credits;
select pg_relation_size('credits') / 8192 as pages_before \gset
select pg_stat_force_next_flush() as _ \gset
select lab.my_wal() as wal_before \gset

-- s1 holds a snapshot older than the failed UPDATE. Without one, the next
-- read of a full page may prune some of the aborted versions early (see
-- the HOT chapter), and the dead-tuple count comes out a little under 999.
call lab.on('s1', 'begin isolation level repeatable read');
select x as _ from dblink('s1', 'select 1') as t(x int) \gset

-- Charge every account 10 credits. The last row would go negative.
do $$
begin
  update credits set balance = balance - 10;
  raise exception 'no error';
exception when check_violation then
  raise notice 'check_violation, as expected';
end $$;

select pg_stat_force_next_flush() as _ \gset

select lab.prove(
  'the charge failed on its last row, and all 999 other rows are unchanged',
  (select count(*) filter (where balance = 100) = 999 from credits));

select lab.prove(
  'the failed UPDATE left 999 dead row versions behind',
  (select dead_tuple_count = 999 from pgstattuple('credits')));

select lab.prove(
  'the failed UPDATE grew the table from 6 to 11 pages',
  :pages_before = 6 and pg_relation_size('credits') / 8192 = 11);

select lab.prove(
  'the failed UPDATE still wrote over 100,000 bytes of WAL',
  lab.my_wal() - :wal_before > 100000);

call lab.on('s1', 'commit');

select pg_current_wal_insert_lsn() as wal_start \gset
begin;
insert into credits values (6001, 1);
select pg_current_xact_id() as committed_xid \gset
commit;
begin;
insert into credits values (6002, 1);
select pg_current_xact_id() as rolled_back_xid \gset
rollback;
-- One more commit, so the WAL is flushed past the abort record too.
insert into credits values (6003, 1);

select lab.prove(
  'a committed transaction ends in one small COMMIT record',
  (select count(*) = 1 and max(record_length) < 100
   from pg_get_wal_records_info(:'wal_start', pg_current_wal_flush_lsn())
   where xid::text = :'committed_xid'
     and resource_manager = 'Transaction' and record_type = 'COMMIT'));

select lab.prove(
  'a rolled-back transaction ends in an ABORT record, and nothing is undone',
  (select array_agg(resource_manager || ':' || record_type order by start_lsn)
          = '{Heap:INSERT,Btree:INSERT_LEAF,Transaction:ABORT}'
   from pg_get_wal_records_info(:'wal_start', pg_current_wal_flush_lsn())
   where xid::text = :'rolled_back_xid'));

\echo
\echo '== Commit waits for the flush; rollback does not'

create table pings (id int);
select pg_stat_force_next_flush() as _ \gset
select lab.my_wal_fsyncs() as f0 \gset
insert into pings values (1);
insert into pings values (2);
insert into pings values (3);
insert into pings values (4);
insert into pings values (5);
insert into pings values (6);
insert into pings values (7);
insert into pings values (8);
insert into pings values (9);
insert into pings values (10);
select pg_stat_force_next_flush() as _ \gset
select lab.my_wal_fsyncs() as f1 \gset

begin; insert into pings values (11); rollback;
begin; insert into pings values (12); rollback;
begin; insert into pings values (13); rollback;
begin; insert into pings values (14); rollback;
begin; insert into pings values (15); rollback;
begin; insert into pings values (16); rollback;
begin; insert into pings values (17); rollback;
begin; insert into pings values (18); rollback;
begin; insert into pings values (19); rollback;
begin; insert into pings values (20); rollback;
select pg_stat_force_next_flush() as _ \gset
select lab.my_wal_fsyncs() as f2 \gset

set synchronous_commit = off;
insert into pings values (21);
insert into pings values (22);
insert into pings values (23);
insert into pings values (24);
insert into pings values (25);
insert into pings values (26);
insert into pings values (27);
insert into pings values (28);
insert into pings values (29);
insert into pings values (30);
reset synchronous_commit;
select pg_stat_force_next_flush() as _ \gset
select lab.my_wal_fsyncs() as f3 \gset

-- On the idle lab kit this is 10 of 10. It allows one miss, for the rare
-- time the WAL writer's background flush lands between an insert's COMMIT
-- record and its own flush. On a busy server, group commit lets other
-- sessions' flushes cover more of ours (run this alongside a workload and
-- it can fail; that's group commit working, not durability failing).
select lab.prove(
  '10 autocommit inserts: this session fsynced the WAL itself, once per commit',
  :f1 - :f0 >= 9);

select lab.prove(
  '10 rollbacks: no WAL fsync at all',
  :f2 - :f1 = 0);

select lab.prove(
  '10 commits with synchronous_commit = off: no WAL fsync at all',
  :f3 - :f2 = 0);

\echo
\echo '== Consistency: the rules you wrote down'

select lab.prove(
  'a CHECK constraint cannot look at other rows',
  lab.try_on('s1', 'create table c_test (id int check (id < (select 1)))')
    = 'cannot use subquery in check constraint');

create table invoices (id bigint primary key, account_id bigint not null);
create table invoice_lines (
  invoice_id bigint not null references invoices (id) deferrable initially deferred,
  amount     int not null
);

call lab.on('s1', 'begin');
select lab.prove(
  'with a deferred foreign key, a line for a missing invoice inserts without error',
  lab.try_on('s1', 'insert into invoice_lines values (777, 10)') = 'ok');
select lab.prove(
  'and the violation is raised by COMMIT',
  lab.try_on('s1', 'commit') like '%violates foreign key constraint%');
select lab.prove(
  'a failed COMMIT keeps nothing',
  (select count(*) = 0 from invoice_lines));

call lab.on('s1', 'begin');
call lab.on('s1', 'insert into invoice_lines values (778, 10)');
call lab.on('s1', 'insert into invoices values (778, 1)');
select lab.prove(
  'children first, then the parent: valid by COMMIT, so it commits',
  lab.try_on('s1', 'commit') = 'ok');
select lab.prove(
  'and the line is there',
  (select count(*) = 1 from invoice_lines));

-- A rule across rows, enforced by a trigger: at most 3 seats per account.
create table seats (
  account_id bigint not null references accounts (id),
  user_id    bigint not null references users (id),
  primary key (account_id, user_id)
);

create function seats_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from seats where account_id = new.account_id) >= 3 then
    raise exception 'account % already has 3 seats', new.account_id;
  end if;
  return new;
end $$;

create trigger seats_limit before insert on seats
for each row execute function seats_limit();

insert into seats values (1, 1), (1, 2);

call lab.on('s1', 'begin');
call lab.on('s1', 'insert into seats values (1, 3)');
call lab.on('s2', 'begin');
call lab.on('s2', 'insert into seats values (1, 4)');
call lab.on('s1', 'commit');
call lab.on('s2', 'commit');

select lab.prove(
  'two concurrent inserts each counted 2 seats, so the trigger let both in: 4 seats',
  (select count(*) = 4 from seats where account_id = 1));

-- The fix: lock the parent row before counting, so the checks take turns.
delete from seats where account_id = 1 and user_id in (3, 4);
create or replace function seats_limit() returns trigger language plpgsql as $$
begin
  perform 1 from accounts where id = new.account_id for update;
  if (select count(*) from seats where account_id = new.account_id) >= 3 then
    raise exception 'account % already has 3 seats', new.account_id;
  end if;
  return new;
end $$;

call lab.on('s1', 'begin');
call lab.on('s1', 'insert into seats values (1, 3)');
call lab.on('s2', 'begin');
select dblink_send_query('s2', 'insert into seats values (1, 4)') = 1 as sent \gset
select pg_sleep(0.3) is not null as slept \gset
select lab.prove(
  'with the account row locked in the trigger, the second insert waits',
  dblink_is_busy('s2') = 1);
call lab.on('s1', 'commit');
select lab.prove(
  'once the first commits, the second counts 3 seats and refuses',
  lab.wait_result('s2') = 'account 1 already has 3 seats');
call lab.on('s2', 'rollback');
select lab.prove(
  'the account ends with exactly 3 seats',
  (select count(*) = 3 from seats where account_id = 1));

\echo
\echo '== Isolation: which effects you see, and when'

create table signups (id int);

call lab.on('s1', 'begin');
call lab.on('s1', 'insert into signups values (1)');

begin isolation level read uncommitted;
select lab.prove(
  'read uncommitted is accepted',
  current_setting('transaction_isolation') = 'read uncommitted');
select lab.prove(
  'and still never sees another session''s uncommitted row',
  (select count(*) = 0 from signups));
commit;
call lab.on('s1', 'rollback');

begin isolation level read committed;
select count(*) as rc_first from signups \gset
call lab.on('s1', 'insert into signups values (2)');
select lab.prove(
  'read committed: the second SELECT sees a row committed after the first',
  (select count(*) = :rc_first + 1 from signups));
commit;

begin isolation level repeatable read;
select count(*) as rr_first from signups \gset
call lab.on('s1', 'insert into signups values (3)');
select lab.prove(
  'repeatable read: the second SELECT does not',
  (select count(*) = :rr_first from signups));
commit;

-- The read-only anomaly: a billing period is closed (T2) while a charge
-- for it is still in flight (T1); a report (T3) reads in between.
create table billing_period (current_period int not null);
create table charges (
  id         bigint generated always as identity primary key,
  period     int not null,
  account_id bigint not null,
  amount     int not null
);

create procedure lab.run_billing(level text)
language plpgsql
as $$
begin
  truncate billing_period, charges;
  insert into billing_period values (1);
  insert into charges (period, account_id, amount) values (1, 1, 100), (1, 2, 200), (1, 3, 300);
  -- Commit the setup, so s1 and s2 can see it (and truncate's lock is gone).
  commit;
  -- T1 (s1): add a charge to the current period, and don't commit yet.
  perform dblink_exec('s1', 'begin isolation level ' || level);
  perform dblink_exec('s1', 'insert into charges (period, account_id, amount)
                             select current_period, 4, 100 from billing_period');
  -- T2 (s2): close period 1, and commit.
  perform dblink_exec('s2', 'begin isolation level ' || level);
  perform dblink_exec('s2', 'update billing_period set current_period = 2');
  perform dblink_exec('s2', 'commit');
end $$;

call lab.run_billing('repeatable read');
-- T3: the report, read-only.
begin isolation level repeatable read read only;
select lab.prove(
  'repeatable read: the report sees period 1 closed',
  (select current_period = 2 from billing_period));
select lab.prove(
  'and reports period 1 final at 3 charges, 600',
  (select count(*) = 3 and sum(amount) = 600 from charges where period = 1));
commit;
select lab.prove(
  'then T1 commits fine',
  lab.try_on('s1', 'commit') = 'ok');
select lab.prove(
  'and the closed period 1 now has 4 charges, 700',
  (select count(*) = 4 and sum(amount) = 700 from charges where period = 1));

call lab.run_billing('serializable');
begin isolation level serializable read only;
select lab.prove(
  'serializable: the same report sees period 1 closed, with 3 charges',
  (select current_period = 2 from billing_period)
  and (select count(*) = 3 from charges where period = 1));
commit;
select lab.prove(
  'but now T1''s commit fails with a serialization error',
  lab.try_on('s1', 'commit') like 'could not serialize access%');
select lab.prove(
  'so the closed period keeps the 3 charges the report saw',
  (select count(*) = 3 from charges where period = 1));

\echo
\echo '== Where ACID ends: one business operation, two transactions'

-- Move 30 credits from account 1 to account 2. The "app" is session s1.
select sum(balance) as total_before from credits \gset

call lab.on('s1', 'update credits set balance = balance - 30 where account_id = 1');
-- The app crashes here, before its second statement runs.
select dblink_disconnect('s1') = 'OK' as gone \gset
select lab.prove(
  'two autocommit statements, a crash between them: 30 credits vanished',
  (select sum(balance) = :total_before - 30 from credits));
update credits set balance = balance + 30 where account_id = 1;

call lab.connect('s1');
call lab.on('s1', 'begin');
call lab.on('s1', 'update credits set balance = balance - 30 where account_id = 1');
select dblink_disconnect('s1') = 'OK' as gone \gset
select pg_sleep(0.2) is not null as slept \gset
select lab.prove(
  'one explicit transaction, the same crash: nothing changed',
  (select sum(balance) = :total_before from credits)
  and (select balance = 100 from credits where account_id = 1));

call lab.connect('s1');

\echo
\echo '== Two-phase commit is off by default'

select lab.prove(
  'max_prepared_transactions defaults to 0',
  current_setting('max_prepared_transactions') = '0');

call lab.on('s1', 'begin');
call lab.on('s1', 'insert into pings values (99)');
select lab.prove(
  'so PREPARE TRANSACTION fails: prepared transactions are disabled',
  lab.try_on('s1', 'prepare transaction ''transfer-42''') = 'prepared transactions are disabled');
select lab.try_on('s1', 'rollback') is not null as cleaned \gset

\echo
\echo '== The transactional outbox'

create table orders (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id),
  total_cents int not null,
  created_at  timestamptz not null default now()
);

create table outbox (
  id         bigint generated always as identity primary key,
  topic      text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

-- The order and its message, in one statement, so one transaction.
create procedure place_order(acct bigint, cents int)
language sql
as $$
  with o as (
    insert into orders (account_id, total_cents) values (acct, cents)
    returning id, account_id, total_cents
  )
  insert into outbox (topic, payload)
  select 'order.placed',
         jsonb_build_object('order_id', id, 'account_id', account_id,
                            'total_cents', total_cents)
  from o;
$$;

call place_order(42, 1999);
call place_order(43, 4999);

begin;
call place_order(44, 999);
rollback;

select lab.prove(
  'every order has its message, and a rolled-back order has neither',
  (select count(*) = 2 from orders) and (select count(*) = 2 from outbox)
  and not exists (select 1 from orders o
                  where not exists (select 1 from outbox m
                                    where (m.payload ->> 'order_id')::bigint = o.id)));

do $$ begin for i in 1..8 loop call place_order(100 + i, 100 * i); end loop; end $$;

-- Two relays claim batches at the same time.
call lab.on('s1', 'begin');
call lab.on('s2', 'begin');
create temp table claimed (relay text, id bigint);
insert into claimed
select 's1', id from dblink('s1', $q$
  select id from outbox order by id limit 5 for update skip locked $q$) as t(id bigint);
insert into claimed
select 's2', id from dblink('s2', $q$
  select id from outbox order by id limit 5 for update skip locked $q$) as t(id bigint);

select lab.prove(
  'two relays with FOR UPDATE SKIP LOCKED claim disjoint batches of 5',
  (select count(*) = 10 and count(distinct id) = 10 from claimed));

-- Relay s1 publishes its batch, deletes it, and commits.
call lab.on('s1', 'delete from outbox where id in (select id from outbox order by id limit 5)');
call lab.on('s1', 'commit');
-- Relay s2 publishes its batch, then crashes before its delete commits.
select dblink_disconnect('s2') = 'OK' as gone \gset
select pg_sleep(0.2) is not null as slept \gset

select lab.prove(
  'the relay that died after publishing left its batch in the outbox: it gets sent again',
  (select count(*) = 5 from outbox where id in (select id from claimed where relay = 's2')));

select dblink_disconnect('s1') = 'OK' as gone \gset
