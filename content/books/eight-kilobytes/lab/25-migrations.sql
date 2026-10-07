-- Lab for "Change the schema, keep the site"
-- https://www.flagon.io/books/eight-kilobytes/migrations
-- Run: ./lab 25-migrations
--
-- Every lock claim is checked by running the DDL inside a transaction and
-- reading pg_locks; every rewrite claim by comparing pg_relation_filenode
-- before and after; every scan claim by the table's seq_scan counter.
-- Extra sessions (the report, the migration, the page load) come from dblink.

\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;

-- The locks this session holds on public tables after running some DDL,
-- as 'relname:Mode' strings. The DDL runs in a subtransaction that is then
-- rolled back, so nothing changes.
create function ddl_locks(ddl text[]) returns text[]
language plpgsql as $$
declare
  s text;
  r text[];
begin
  begin
    foreach s in array ddl loop
      execute s;
    end loop;
    select array_agg(c.relname || ':' || l.mode order by c.relname, l.mode)
      into r
      from pg_locks l
      join pg_class c on c.oid = l.relation
     where l.pid = pg_backend_pid()
       and c.relnamespace = 'public'::regnamespace;
    raise exception using errcode = 'P0001', message = 'undo';
  exception when sqlstate 'P0001' then
    null;
  end;
  return r;
end $$;

create function ddl_locks(ddl text) returns text[]
language sql as $$ select ddl_locks(array[ddl]) $$;

-- The strongest lock mode on one table in such an array.
create function strongest(locks text[], rel text) returns text
language sql as $$
  select m from unnest(locks) as l,
       lateral (select split_part(l, ':', 2) as m) x
   where split_part(l, ':', 1) = rel
   order by array_position(array['AccessShareLock','RowShareLock','RowExclusiveLock',
             'ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock',
             'ExclusiveLock','AccessExclusiveLock'], m) desc
   limit 1
$$;

-- The strongest lock this session holds right now on a table.
create function my_strongest(rel text) returns text
language sql as $$
  select strongest(array(select c.relname || ':' || l.mode
                           from pg_locks l join pg_class c on c.oid = l.relation
                          where l.pid = pg_backend_pid() and c.relname = rel), rel)
$$;

-- The seq_scan count this transaction has accumulated on a table so far.
create function xact_seq_scans(rel text) returns bigint
language sql as $$
  select coalesce(seq_scan, 0) from pg_stat_xact_user_tables where relname = rel
$$;

\echo
\echo == The lock queue turns a fast ALTER into an outage

-- Three sessions: a report holding a transaction open, the migration, and a
-- primary key lookup that arrives a moment later.
select dblink_connect('report', 'dbname=' || current_database()) \g /dev/null
select dblink_connect('migration', 'dbname=' || current_database()) \g /dev/null
select dblink_connect('web', 'dbname=' || current_database()) \g /dev/null
select p as report_pid from dblink('report', 'select pg_backend_pid()') t(p int) \gset
select p as migration_pid from dblink('migration', 'select pg_backend_pid()') t(p int) \gset
select p as web_pid from dblink('web', 'select pg_backend_pid()') t(p int) \gset

select dblink_exec('report', 'begin') \g /dev/null
select * from dblink('report', 'select count(*) from events where id < 1000') t(n bigint) \g /dev/null
select dblink_send_query('migration', 'alter table events add column note text') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select dblink_send_query('web', 'select id from events where id = 42') \g /dev/null
select pg_sleep(0.3) \g /dev/null

select lab.prove('the ALTER waits for the report',
  pg_blocking_pids(:migration_pid) = array[:report_pid]);
select lab.prove('the primary key lookup waits for the ALTER, not the report',
  pg_blocking_pids(:web_pid) = array[:migration_pid]);
select lab.prove('both waiters are waiting on a relation lock',
  (select count(*) from pg_stat_activity
    where pid in (:migration_pid, :web_pid)
      and wait_event_type = 'Lock' and wait_event = 'relation') = 2);

select dblink_exec('report', 'rollback') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select lab.prove('once the report ends, the ALTER runs and the lookup gets its row',
  (select r from dblink_get_result('migration') t(r text)) = 'ALTER TABLE'
  and (select id from dblink_get_result('web') t(id bigint)) = 42);
-- drain the empty final results
select * from dblink_get_result('migration') t(r text) \g /dev/null
select * from dblink_get_result('web') t(id bigint) \g /dev/null
alter table events drop column note;

\echo
\echo == Rule one: lock_timeout and retry

select dblink_exec('report', 'begin') \g /dev/null
select * from dblink('report', 'select count(*) from events where id < 1000') t(n bigint) \g /dev/null

do $$
begin
  set local lock_timeout = '1s';
  alter table events add column note3 text;
  raise exception 'no error';
exception when lock_not_available then
  if sqlerrm <> 'canceling statement due to lock timeout' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('with lock_timeout set, the ALTER fails: canceling statement due to lock timeout (55P03)', true);

-- When the migration gives up, its place in the queue disappears and the
-- traffic behind it flows, even though the report is still running.
select dblink_exec('migration', 'set lock_timeout = ''1s''') \g /dev/null
select dblink_send_query('migration', 'alter table events add column note3 text') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select dblink_send_query('web', 'select id from events where id = 42') \g /dev/null
select pg_sleep(0.3) \g /dev/null
select lab.prove('while the ALTER waits, the lookup queues behind it',
  pg_blocking_pids(:web_pid) = array[:migration_pid]);
select pg_sleep(1.2) \g /dev/null
do $$
begin
  perform * from dblink_get_result('migration') t(r text);
  raise exception 'no error';
exception when lock_not_available then
  null;
end $$;
select * from dblink_get_result('migration') t(r text) \g /dev/null
select lab.prove('after the lock timeout, the lookup completes while the report is still open',
  (select id from dblink_get_result('web') t(id bigint)) = 42
  and (select state from pg_stat_activity where pid = :report_pid) = 'idle in transaction');
select * from dblink_get_result('web') t(id bigint) \g /dev/null
select dblink_exec('report', 'rollback') \g /dev/null
select dblink_exec('migration', 'reset lock_timeout') \g /dev/null
select lab.prove('nothing changed: there is no note3 column',
  not exists (select 1 from pg_attribute where attrelid = 'events'::regclass and attname = 'note3'));

\echo
\echo == Which lock each change takes

select lab.prove('add column takes AccessExclusive',
  strongest(ddl_locks('alter table events add column note text'), 'events') = 'AccessExclusiveLock');
select lab.prove('drop column takes AccessExclusive',
  strongest(ddl_locks('alter table events drop column kind'), 'events') = 'AccessExclusiveLock');
select lab.prove('rename column takes AccessExclusive',
  strongest(ddl_locks('alter table events rename column kind to event_type'), 'events') = 'AccessExclusiveLock');
select lab.prove('set default takes AccessExclusive',
  strongest(ddl_locks($$alter table events alter column kind set default 'deploy'$$), 'events') = 'AccessExclusiveLock');
select lab.prove('set not null takes AccessExclusive',
  strongest(ddl_locks('alter table events alter column user_id set not null'), 'events') = 'AccessExclusiveLock');
select lab.prove('add check ... not valid takes AccessExclusive',
  strongest(ddl_locks('alter table events add constraint c check (user_id is not null) not valid'), 'events') = 'AccessExclusiveLock');

select ddl_locks('alter table events add constraint events_project_fk2
                    foreign key (project_id) references projects (id) not valid') as fk_locks \gset
select lab.prove('add foreign key ... not valid takes ShareRowExclusive on events',
  strongest(:'fk_locks', 'events') = 'ShareRowExclusiveLock');
select lab.prove('add foreign key ... not valid takes ShareRowExclusive on projects too',
  strongest(:'fk_locks', 'projects') = 'ShareRowExclusiveLock');

select lab.prove('set statistics takes ShareUpdateExclusive',
  strongest(ddl_locks('alter table events alter column kind set statistics 500'), 'events') = 'ShareUpdateExclusiveLock');
select ddl_locks('create index projects_created_at_idx on projects (created_at)') as ci_locks \gset
select lab.prove('a plain create index takes Share on the table',
  strongest(:'ci_locks', 'projects') = 'ShareLock');
select lab.prove('and AccessExclusive on the new index',
  strongest(:'ci_locks', 'projects_created_at_idx') = 'AccessExclusiveLock');

\echo
\echo == Metadata, scan, or rewrite: constant defaults are free; volatile defaults rewrite

select lab.prove('events is about 275 MB with 2 million rows',
  pg_relation_size('events') between 270 * 1024 * 1024 and 290 * 1024 * 1024
  and (select count(*) from events) = 2000000);

select pg_relation_filenode('events') as fn0 \gset
alter table events add column source text not null default 'web';
select lab.prove('a constant default does not rewrite: same filenode',
  pg_relation_filenode('events') = :fn0);
select lab.prove('the default is stored as the column''s missing value',
  (select atthasmissing and attmissingval::text = '{web}'
     from pg_attribute where attrelid = 'events'::regclass and attname = 'source'));
select lab.prove('old rows read the missing value',
  (select source from events where id = 1) = 'web');

alter table events add column ts2 timestamptz default now();
select lab.prove('a stable default (now()) does not rewrite either',
  pg_relation_filenode('events') = :fn0);
select lab.prove('every existing row reports the moment of the migration',
  (select count(distinct ts2) from events) = 1);
alter table events drop column ts2, drop column source;

-- Rewriting all of events takes seconds and writes its full size to WAL, so
-- the volatile-default rewrite is shown on a 200,000 row copy. The mechanism
-- is the same at any size; only the time grows.
create table events_copy as select * from events where id <= 200000;
alter table events_copy add primary key (id);
select pg_relation_filenode('events_copy') as cfn \gset
alter table events_copy add column ingest_id uuid default gen_random_uuid();
select lab.prove('a volatile default (gen_random_uuid()) rewrites: new filenode',
  pg_relation_filenode('events_copy') <> :cfn);
select lab.prove('and every row got its own value',
  (select count(distinct ingest_id) from events_copy) = 200000);

-- The split version on the full table: add bare, then set the default.
alter table events add column ingest_id uuid;
alter table events alter column ingest_id set default gen_random_uuid();
select lab.prove('adding the column bare and then setting a volatile default does not rewrite',
  pg_relation_filenode('events') = :fn0);
alter table events drop column ingest_id;

create table g (a int);
insert into g select generate_series(1, 1000);
select pg_relation_filenode('g') as gfn \gset
alter table g add column v int generated always as (a * 2);
select lab.prove('a virtual generated column (the 18 default) is catalog only',
  pg_relation_filenode('g') = :gfn
  and (select attgenerated from pg_attribute where attrelid = 'g'::regclass and attname = 'v') = 'v');
alter table g add column s int generated always as (a * 2) stored;
select lab.prove('a stored generated column rewrites',
  pg_relation_filenode('g') <> :gfn);

\echo
\echo == NOT NULL goes through a CHECK first

begin;
select xact_seq_scans('events') as s0 \gset
alter table events alter column user_id set not null;
select lab.prove('set not null scans the table: seq_scan goes up by one',
  xact_seq_scans('events') = :s0 + 1);
rollback;

begin;
select xact_seq_scans('events') as s0 \gset
alter table events add constraint events_user_id_nn check (user_id is not null) not valid;
select lab.prove('step 1, add check ... not valid: no scan',
  xact_seq_scans('events') = :s0);
alter table events validate constraint events_user_id_nn;
select lab.prove('step 2, validate: one scan',
  xact_seq_scans('events') = :s0 + 1);
alter table events alter column user_id set not null;
select lab.prove('step 3, set not null with a valid CHECK in place: no scan',
  xact_seq_scans('events') = :s0 + 1);
alter table events drop constraint events_user_id_nn;
select lab.prove('step 4: with the CHECK dropped, the column is still NOT NULL',
  (select attnotnull from pg_attribute where attrelid = 'events'::regclass and attname = 'user_id'));
rollback;

alter table events add constraint events_user_id_nn check (user_id is not null) not valid;
select lab.prove('validate constraint (check) takes only ShareUpdateExclusive',
  strongest(ddl_locks('alter table events validate constraint events_user_id_nn'), 'events') = 'ShareUpdateExclusiveLock');
alter table events drop constraint events_user_id_nn;

-- PostgreSQL 18: NOT NULL ... NOT VALID
begin;
select xact_seq_scans('events') as s0 \gset
alter table events add constraint events_user_id_not_null not null user_id not valid;
select lab.prove('18: add not null ... not valid takes AccessExclusive',
  my_strongest('events') = 'AccessExclusiveLock');
select lab.prove('18: and does not scan',
  xact_seq_scans('events') = :s0);
commit;

select lab.prove('before validation, attnotnull is already true',
  (select attnotnull from pg_attribute where attrelid = 'events'::regclass and attname = 'user_id'));
select lab.prove('before validation, pg_constraint.convalidated is false',
  (select not convalidated from pg_constraint where conname = 'events_user_id_not_null'));
do $$
begin
  insert into events (account_id, project_id, user_id, kind) values (1, 1, null, 'deploy');
  raise exception 'no error';
exception when not_null_violation then
  if sqlerrm <> 'null value in column "user_id" of relation "events" violates not-null constraint' then
    raise exception 'NOT PROVED: wrong message %', sqlerrm;
  end if;
end $$;
select lab.prove('between the steps, inserting a null is already rejected (23502)', true);

begin;
select xact_seq_scans('events') as s0 \gset
alter table events validate constraint events_user_id_not_null;
select lab.prove('18: validate takes ShareUpdateExclusive',
  my_strongest('events') = 'ShareUpdateExclusiveLock');
select lab.prove('18: validate scans once',
  xact_seq_scans('events') = :s0 + 1);
commit;
select lab.prove('after validation, convalidated is true',
  (select convalidated from pg_constraint where conname = 'events_user_id_not_null'));
alter table events alter column user_id drop not null;

\echo
\echo == Check constraints

alter table events add constraint events_payload_chk check (payload <> 'null') not valid;
alter table events validate constraint events_payload_chk;
select lab.prove('the payload check validates',
  (select convalidated from pg_constraint where conname = 'events_payload_chk'));

alter table events add constraint events_no_login check (kind <> 'login') not valid;
do $$
begin
  alter table events validate constraint events_no_login;
  raise exception 'no error';
exception when check_violation then
  null;
end $$;
select lab.prove('if validation hits a violating row it fails, and the constraint stays, not valid',
  (select not convalidated from pg_constraint where conname = 'events_no_login'));
do $$
begin
  insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'login');
  raise exception 'no error';
exception when check_violation then
  null;
end $$;
select lab.prove('the unvalidated constraint still guards new writes', true);
alter table events drop constraint events_no_login;

\echo
\echo == Foreign keys

alter table events
  add constraint events_project_fk2
  foreign key (project_id) references projects (id) not valid;
select ddl_locks('alter table events validate constraint events_project_fk2') as v_locks \gset
select lab.prove('validating a foreign key takes ShareUpdateExclusive on events',
  strongest(:'v_locks', 'events') = 'ShareUpdateExclusiveLock');
select lab.prove('and only RowShare on projects',
  strongest(:'v_locks', 'projects') = 'RowShareLock');
select lab.prove('Postgres never indexes the referencing column: no index on events (project_id)',
  not exists (select 1 from pg_index
               where indrelid = 'events'::regclass
                 and indkey[0] = (select attnum from pg_attribute
                                   where attrelid = 'events'::regclass and attname = 'project_id')));
alter table events drop constraint events_project_fk2;

\echo
\echo == Build every index concurrently

-- A session with an old snapshot, reading a different table.
select dblink_connect('cic', 'dbname=' || current_database()) \g /dev/null
select p as cic_pid from dblink('cic', 'select pg_backend_pid()') t(p int) \gset
select dblink_exec('report', 'begin isolation level repeatable read') \g /dev/null
select * from dblink('report', 'select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('cic', 'create index concurrently events_created_at_idx on events (created_at)') \g /dev/null
-- wait (up to a minute) for the build to reach its wait for old snapshots
do $$
begin
  for i in 1..600 loop
    perform pg_stat_clear_snapshot();  -- pg_stat_activity is read once per transaction
    exit when exists (select 1 from pg_stat_activity
                       where query like 'create index concurrently events_created_at_idx%'
                         and wait_event = 'virtualxid');
    perform pg_sleep(0.1);
  end loop;
end $$;
select lab.prove('create index concurrently holds ShareUpdateExclusive on the table',
  exists (select 1 from pg_locks where pid = :cic_pid and relation = 'events'::regclass
             and mode = 'ShareUpdateExclusiveLock' and granted));
select lab.prove('and waits for an older transaction that touched a different table',
  pg_blocking_pids(:cic_pid) = array[:report_pid]
  and (select wait_event from pg_stat_activity where pid = :cic_pid) = 'virtualxid');
select lab.prove('meanwhile writes to events go through',
  (select count(*) from dblink('web',
     'insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, ''deploy'') returning id') t(id bigint)) = 1);
select dblink_exec('report', 'commit') \g /dev/null
select r from dblink_get_result('cic') t(r text) \g /dev/null
select r from dblink_get_result('cic') t(r text) \g /dev/null
select lab.prove('once that transaction ends, the concurrent build finishes, valid',
  (select indisvalid from pg_index where indexrelid = 'events_created_at_idx'::regclass));

do $$
begin
  execute 'create index concurrently events_kind_idx on events (kind)';
  raise exception 'no error';
exception when active_sql_transaction then
  if sqlerrm <> 'CREATE INDEX CONCURRENTLY cannot run inside a transaction block' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('create index concurrently cannot run inside a transaction block (25001)', true);

\echo
\echo == When a concurrent build fails

-- a duplicate that slipped in before the constraint existed
insert into projects (account_id, owner_id, name)
select account_id, owner_id, name from projects where id = 1;

do $$
begin
  perform dblink_exec('cic', 'create unique index concurrently projects_account_name_key
                                on projects (account_id, name)');
  raise exception 'no error';
exception when unique_violation then
  if sqlerrm <> 'could not create unique index "projects_account_name_key"' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('the unique build fails on the duplicate (23505)', true);
select lab.prove('and leaves an index behind, indisvalid = false (and here indisready = false)',
  (select not indisvalid and not indisready from pg_index
    where indexrelid = 'projects_account_name_key'::regclass));

create unique index concurrently if not exists projects_account_name_key
  on projects (account_id, name);
select lab.prove('"if not exists" after a failure does nothing and reports success: still invalid',
  (select not indisvalid from pg_index where indexrelid = 'projects_account_name_key'::regclass));

drop index concurrently projects_account_name_key;
select lab.prove('drop index concurrently removes it',
  to_regclass('projects_account_name_key') is null);
delete from projects where id = (select max(id) from projects);

\echo
\echo == Unique constraints and primary keys

select lab.prove('adding a unique constraint directly takes AccessExclusive',
  strongest(ddl_locks('alter table users add constraint users_email_key unique (email)'), 'users') = 'AccessExclusiveLock');
create unique index concurrently users_email_key on users (email);
select pg_relation_filenode('users_email_key') as ufn \gset
alter table users add constraint users_email_key unique using index users_email_key;
select lab.prove('attaching a concurrently built index as the constraint reuses it (same filenode)',
  pg_relation_filenode('users_email_key') = :ufn
  and (select contype from pg_constraint where conname = 'users_email_key') = 'u');

\echo
\echo == REINDEX CONCURRENTLY

select pg_relation_filenode('events_created_at_idx') as ifn \gset
select pg_relation_filenode('events') as tfn \gset
reindex index concurrently events_created_at_idx;
select lab.prove('reindex concurrently swaps in a new index file, leaving the table alone',
  pg_relation_filenode('events_created_at_idx') <> :ifn
  and pg_relation_filenode('events') = :tfn
  and (select indisvalid from pg_index where indexrelid = 'events_created_at_idx'::regclass));

\echo
\echo == Widening a type is free; most other type changes rewrite

create table tc (
  v20 varchar(20), vn varchar(40), t1 text, t2 text, i int,
  n1 numeric(10,2), n2 numeric(12,2), n3 numeric(12,4), ts1 timestamp, ts2 timestamp
);
insert into tc
select 'x' || g, 'y' || g, 'z' || g, 'w' || g, g,
       g / 100.0, g / 100.0, g / 100.0, now(), now()
from generate_series(1, 100000) g;

create function rewrites(change text, tz text default 'UTC') returns boolean
language plpgsql as $$
declare before oid := pg_relation_filenode('tc');
begin
  perform set_config('timezone', tz, true);
  execute 'alter table tc ' || change;
  return pg_relation_filenode('tc') <> before;
end $$;

select lab.prove('varchar(20) to varchar(50): no rewrite',      not rewrites('alter column v20 type varchar(50)'));
select lab.prove('varchar(n) to text: no rewrite',              not rewrites('alter column vn type text'));
select lab.prove('text to varchar(30): rewrite',                rewrites('alter column t1 type varchar(30)'));
select lab.prove('text to varchar(100): rewrite, even though every value fits', rewrites('alter column t2 type varchar(100)'));
select lab.prove('int to bigint: rewrite',                      rewrites('alter column i type bigint'));
select lab.prove('numeric(10,2) to numeric(12,2): no rewrite',  not rewrites('alter column n1 type numeric(12,2)'));
select lab.prove('numeric(12,2) to numeric(12,4): rewrite',     rewrites('alter column n2 type numeric(12,4)'));
select lab.prove('numeric(12,4) to unconstrained numeric: no rewrite', not rewrites('alter column n3 type numeric'));
select lab.prove('timestamp to timestamptz with the session in UTC: no rewrite',
  not rewrites('alter column ts1 type timestamptz', 'UTC'));
select lab.prove('timestamp to timestamptz in another time zone: rewrite',
  rewrites('alter column ts2 type timestamptz', 'America/New_York'));

-- What running out looks like: an int identity two values from its maximum.
create table tickets (id int generated always as identity primary key, title text);
alter table tickets alter column id restart with 2147483646;
insert into tickets (title) values ('a'), ('b');
do $$
begin
  insert into tickets (title) values ('c');
  raise exception 'no error';
exception when sqlstate '2200H' then
  if sqlerrm <> 'nextval: reached maximum value of sequence "tickets_id_seq" (2147483647)' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('the third insert fails: nextval reached the int maximum (2147483647)', true);
select lab.prove('pg_sequences shows tickets_id_seq at 100 percent of its maximum',
  (select round(100.0 * last_value / max_value, 1) = 100.0
   from pg_sequences where sequencename = 'tickets_id_seq'));

\echo
\echo == Renames ship as expand and contract

select pg_relation_filenode('events') as fn2 \gset
alter table events rename column kind to event_type;
select lab.prove('rename column is catalog only',
  pg_relation_filenode('events') = :fn2);
alter table events rename column event_type to kind;

\echo
\echo == Backfills in batches

select lab.prove('the seed''s statuses: 500,420 failed and 1,499,580 ok',
  (select count(*) filter (where payload->>'status' = 'failed') = 500420
      and count(*) filter (where payload->>'status' = 'ok') = 1499580 from events));

-- The chapter's procedure, pointed at the 200,000 row copy to keep the lab quick.
alter table events_copy add column status text;

create procedure backfill_status(batch_size int default 10000)
language plpgsql as $$
declare
  last_id bigint := 0;
  max_id  bigint;
begin
  select max(id) into max_id from events_copy;
  while last_id < max_id loop
    update events_copy
       set status = payload->>'status'
     where id >  last_id
       and id <= last_id + batch_size
       and status is null;
    last_id := last_id + batch_size;
    commit;
  end loop;
end $$;

call backfill_status(20000);
select lab.prove('the procedure backfills every row',
  (select count(*) from events_copy where status is null) = 0
  and (select count(*) from events_copy where status = payload->>'status') = 200000);
select lab.prove('it committed once per batch: the rows carry ten different transaction ids',
  (select count(distinct xmin::text) from events_copy) = 10);
call backfill_status(20000);
select lab.prove('rerunning it is safe: the status is null condition makes it a no-op',
  (select count(*) from events_copy where status = payload->>'status') = 200000);

\echo
\echo == Drop code first, then the column

select pg_relation_filenode('events') as fn3 \gset
alter table events add column legacy text;
alter table events drop column legacy;
select lab.prove('drop column is catalog only: same file, the attribute is marked dropped',
  pg_relation_filenode('events') = :fn3
  and exists (select 1 from pg_attribute where attrelid = 'events'::regclass and attisdropped));

select ddl_locks('drop table projects cascade') as drop_locks \gset
select lab.prove('dropping a table takes AccessExclusive on the table that references it',
  strongest(:'drop_locks', 'events') = 'AccessExclusiveLock');
select lab.prove('and on the tables it references',
  strongest(:'drop_locks', 'accounts') = 'AccessExclusiveLock'
  and strongest(:'drop_locks', 'users') = 'AccessExclusiveLock');

\echo
\echo == Transactional DDL holds every lock until commit

begin;
alter table accounts add column region text;
alter table users    add column region text;
update accounts set region = 'us';
select lab.prove('after the update, the transaction still holds AccessExclusive on accounts and users',
  my_strongest('accounts') = 'AccessExclusiveLock' and my_strongest('users') = 'AccessExclusiveLock');
rollback;
select lab.prove('and a rollback undoes the DDL: no region column',
  not exists (select 1 from pg_attribute
               where attrelid in ('accounts'::regclass, 'users'::regclass) and attname = 'region'));

select dblink_disconnect('report') \g /dev/null
select dblink_disconnect('migration') \g /dev/null
select dblink_disconnect('web') \g /dev/null
select dblink_disconnect('cic') \g /dev/null

\echo
\echo == Pick the index build that matches the traffic

-- Four more sessions: a migration, a web request, a session that holds a
-- transaction open, and a concurrent build.
select dblink_connect('b_mig', 'dbname=' || current_database()) \g /dev/null
select dblink_connect('b_web', 'dbname=' || current_database()) \g /dev/null
select dblink_connect('b_hold', 'dbname=' || current_database()) \g /dev/null
select dblink_connect('b_cic', 'dbname=' || current_database()) \g /dev/null
select p as b_mig from dblink('b_mig', 'select pg_backend_pid()') t(p int) \gset
select p as b_web from dblink('b_web', 'select pg_backend_pid()') t(p int) \gset
select p as b_hold from dblink('b_hold', 'select pg_backend_pid()') t(p int) \gset
select p as b_cic from dblink('b_cic', 'select pg_backend_pid()') t(p int) \gset

-- Poll a condition in short transactions. A loop inside one transaction
-- would hold a snapshot itself, and a concurrent build would wait for it.
create procedure wait_for(cond text, secs int default 120)
language plpgsql as $$
declare ok boolean := false;
begin
  for i in 1..secs * 50 loop
    execute 'select coalesce((' || cond || '), false)' into ok;
    exit when ok;
    commit;
    perform pg_sleep(0.02);
  end loop;
  if not ok then raise exception 'timed out waiting for: %', cond; end if;
end $$;

-- What every index build in this database is doing right now.
create view build_progress as
select p.pid, p.command, p.phase, p.lockers_total, p.current_locker_pid, a.wait_event
  from pg_stat_progress_create_index p
  join pg_stat_activity a using (pid)
 where p.datname = current_database();

-- Sequential scans and heap pages read on events so far (flushed stats).
create function events_reads(out scans bigint, out pages bigint)
language sql as $$
  select t.seq_scan, s.heap_blks_read + s.heap_blks_hit
    from pg_stat_user_tables t join pg_statio_user_tables s using (relid)
   where t.relid = 'events'::regclass
$$;

\echo
\echo -- What each build costs

-- Serial builds, so every scan and every WAL byte is this session's.
set max_parallel_maintenance_workers = 0;
select pg_relation_size('events') / 8192 as events_pages \gset

select pg_stat_force_next_flush() \g /dev/null
select scans as s0, pages as p0, lab.my_wal() as w0 from events_reads() \gset
create index plain_idx on events (project_id, created_at);
select pg_stat_force_next_flush() \g /dev/null
select scans - :s0 as plain_scans, pages - :p0 as plain_pages, lab.my_wal() - :w0 as plain_wal,
       pg_relation_size('plain_idx') as plain_size from events_reads() \gset
drop index plain_idx;

select pg_stat_force_next_flush() \g /dev/null
select scans as s0, pages as p0, lab.my_wal() as w0 from events_reads() \gset
create index concurrently cic_idx on events (project_id, created_at);
select pg_stat_force_next_flush() \g /dev/null
select scans - :s0 as cic_scans, pages - :p0 as cic_pages, lab.my_wal() - :w0 as cic_wal,
       pg_relation_size('cic_idx') as cic_size from events_reads() \gset
drop index cic_idx;

select lab.prove('a plain build reads the table once',
  :plain_scans = 1 and :plain_pages between 0.95 * :events_pages and 1.05 * :events_pages);
select lab.prove('a concurrent build reads it twice',
  :cic_scans = 2 and :cic_pages between 1.9 * :events_pages and 2.1 * :events_pages);
select lab.prove('both produce the same index, about 7,700 pages',
  :plain_size = :cic_size and :plain_size / 8192 between 7400 and 8000);
select lab.prove('and write about the same WAL, roughly the size of the index',
  :cic_wal::numeric / :plain_wal between 0.9 and 1.1
  and :plain_wal::numeric / :plain_size between 0.7 and 1.2);
reset max_parallel_maintenance_workers;

\echo
\echo -- A plain build blocks writes, not reads

select dblink_exec('b_mig', 'begin') \g /dev/null
select dblink_exec('b_mig', 'create index plain_idx on events (project_id, created_at)') \g /dev/null
select dblink_send_query('b_web',
  $$insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'deploy') returning id$$) \g /dev/null
call wait_for(format('pg_blocking_pids(%s) = array[%s]', :b_web, :b_mig));
select lab.prove('a plain build holds a Share lock on events',
  exists (select 1 from pg_locks where pid = :b_mig and relation = 'events'::regclass
             and mode = 'ShareLock' and granted));
select lab.prove('an INSERT waits for it, on a relation lock',
  (select wait_event_type || ':' || wait_event from pg_stat_activity where pid = :b_web) = 'Lock:relation'
  and exists (select 1 from pg_locks where pid = :b_web and relation = 'events'::regclass
                 and mode = 'RowExclusiveLock' and not granted));
select lab.prove('while a primary key lookup goes straight through',
  (select k from dblink('b_hold', 'select kind from events where id = 42') t(k text)) is not null);
select dblink_exec('b_mig', 'commit') \g /dev/null
call wait_for($$ dblink_is_busy('b_web') = 0 $$);
select lab.prove('the insert completes the moment the build commits',
  (select count(*) from dblink_get_result('b_web') t(id bigint)) = 1);
select * from dblink_get_result('b_web') t(id bigint) \g /dev/null

select lab.prove('two plain builds on one table can run at once: Share does not conflict with Share',
  (select count(*) from dblink('b_mig', $$begin; create index p1 on events (kind); select 1$$) t(x int)) = 1
  and (select count(*) from dblink('b_web', $$begin; create index p2 on events (user_id); select 1$$) t(x int)) = 1
  and (select count(*) from pg_locks where pid in (:b_mig, :b_web) and relation = 'events'::regclass
          and mode = 'ShareLock' and granted) = 2);
select dblink_exec('b_mig', 'rollback') \g /dev/null
select dblink_exec('b_web', 'rollback') \g /dev/null
drop index plain_idx;

\echo
\echo -- A concurrent build waits for old snapshots, anywhere in the database

-- An idle transaction that read another table, in read committed: it holds
-- no snapshot between statements, so the build does not wait for it.
select count(*) from dblink('b_hold', 'begin; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select lab.prove('an idle read committed transaction that read another table does not hold it up',
  (select indisvalid from pg_index where indexrelid = 'kind_idx'::regclass)
  and (select state from pg_stat_activity where pid = :b_hold) = 'idle in transaction');
select dblink_exec('b_hold', 'rollback') \g /dev/null
drop index kind_idx;

-- Same, after a write to another table: it has an xid, but no snapshot.
select count(*) from dblink('b_hold', $$begin; insert into accounts (name) values ('lab'); select 1$$) t(x int) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select lab.prove('nor does one that wrote to another table',
  (select indisvalid from pg_index where indexrelid = 'kind_idx'::regclass)
  and (select state from pg_stat_activity where pid = :b_hold) = 'idle in transaction');
select dblink_exec('b_hold', 'rollback') \g /dev/null
drop index kind_idx;

-- An open cursor keeps its snapshot, even in read committed.
select dblink_exec('b_hold', 'begin') \g /dev/null
select dblink_exec('b_hold', 'declare c cursor for select * from accounts') \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ (select phase = 'waiting for old snapshots' from build_progress) $$);
select lab.prove('an open cursor on another table parks it in "waiting for old snapshots"',
  (select current_locker_pid = :b_hold from build_progress));
select dblink_exec('b_hold', 'rollback') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
drop index kind_idx;

-- A repeatable read transaction keeps its snapshot until it ends.
select count(*) from dblink('b_hold', 'begin isolation level repeatable read; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ (select phase = 'waiting for old snapshots' from build_progress) $$);
select lab.prove('an idle repeatable read transaction on another table parks it in "waiting for old snapshots"',
  (select current_locker_pid = :b_hold and wait_event = 'virtualxid' from build_progress)
  and pg_blocking_pids(:b_cic) = array[:b_hold]);
select lab.prove('the index exists, ready for writes but not valid for reads',
  (select indisready and not indisvalid from pg_index where indexrelid = 'kind_idx'::regclass));
select dblink_exec('b_hold', 'commit') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select lab.prove('when that transaction ends, the build finishes, valid',
  (select indisvalid from pg_index where indexrelid = 'kind_idx'::regclass));
drop index kind_idx;

-- A query that is still running holds a snapshot too.
select dblink_send_query('b_hold', 'select pg_sleep(120)') \g /dev/null
select pg_sleep(0.2) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ (select phase = 'waiting for old snapshots' from build_progress) $$);
select lab.prove('so does a long query that started before the build, on any table',
  (select current_locker_pid = :b_hold from build_progress));
select dblink_cancel_query('b_hold') \g /dev/null
select * from dblink_get_result('b_hold', false) t(x text) \g /dev/null
select * from dblink_get_result('b_hold', false) t(x text) \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
drop index kind_idx;

-- An open write to the table itself stops it before the first scan.
select count(*) from dblink('b_hold',
  $$begin; insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'deploy'); select 1$$) t(x int) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ (select phase = 'waiting for writers before build' from build_progress) $$);
select lab.prove('an uncommitted write to events stops it in "waiting for writers before build"',
  (select current_locker_pid = :b_hold from build_progress));
select dblink_exec('b_hold', 'rollback') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
drop index kind_idx;

\echo
\echo -- lock_timeout: on for a plain build, off for a concurrent one

-- A plain build waiting for its Share lock queues every later write behind it.
select count(*) from dblink('b_hold',
  $$begin; insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'deploy'); select 1$$) t(x int) \g /dev/null
select dblink_send_query('b_mig', 'create index plain_idx on events (kind)') \g /dev/null
call wait_for(format('pg_blocking_pids(%s) = array[%s]', :b_mig, :b_hold));
select dblink_send_query('b_web',
  $$insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'deploy') returning id$$) \g /dev/null
call wait_for(format('pg_blocking_pids(%s) = array[%s]', :b_web, :b_mig));
select lab.prove('a plain build that is only waiting for its lock already blocks the inserts behind it',
  (select not granted from pg_locks where pid = :b_web and relation = 'events'::regclass));
select dblink_exec('b_hold', 'rollback') \g /dev/null
call wait_for($$ dblink_is_busy('b_mig') = 0 and dblink_is_busy('b_web') = 0 $$);
select * from dblink_get_result('b_mig') t(r text) \g /dev/null
select * from dblink_get_result('b_mig') t(r text) \g /dev/null
select * from dblink_get_result('b_web') t(id bigint) \g /dev/null
select * from dblink_get_result('b_web') t(id bigint) \g /dev/null
drop index plain_idx;

-- A concurrent build waiting for its ShareUpdateExclusive lock does not.
select dblink_exec('b_hold', 'begin') \g /dev/null
select dblink_exec('b_hold', 'lock table events in share update exclusive mode') \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for(format('pg_blocking_pids(%s) = array[%s]', :b_cic, :b_hold));
select lab.prove('a concurrent build waiting for its lock lets inserts pass',
  (select count(*) from dblink('b_web',
     $$insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'deploy') returning id$$) t(id bigint)) = 1);
select dblink_exec('b_hold', 'rollback') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
drop index kind_idx;

-- lock_timeout also bounds the build's waits for other transactions.
select count(*) from dblink('b_hold', 'begin isolation level repeatable read; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_exec('b_cic', 'set lock_timeout = ''1s''') \g /dev/null
do $$
begin
  perform dblink_exec('b_cic', 'create index concurrently kind_idx on events (kind)');
  raise exception 'no error';
exception when lock_not_available then
  if sqlerrm not like 'canceling statement due to lock timeout%' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select dblink_exec('b_cic', 'reset lock_timeout') \g /dev/null
select dblink_exec('b_hold', 'commit') \g /dev/null
select lab.prove('a 1s lock_timeout cancels a concurrent build waiting on an old snapshot, leaving an invalid index',
  (select indisready and not indisvalid from pg_index where indexrelid = 'kind_idx'::regclass));
drop index concurrently kind_idx;

\echo
\echo -- Watch the phases go by

create table build_samples (command text, phase text);
create procedure sample_build(conn text)
language plpgsql as $$
begin
  for i in 1..60000 loop
    insert into build_samples select command, phase from build_progress;
    exit when dblink_is_busy(conn) = 0;
    commit;
    perform pg_sleep(0.005);
  end loop;
end $$;

select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call sample_build('b_cic');
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select lab.prove('pg_stat_progress_create_index shows the concurrent build scanning, sorting, then validating',
  (select count(distinct phase) >= 4
          and bool_or(phase = 'building index: scanning table')
          and bool_or(phase like 'index validation:%')
          and bool_and(command = 'CREATE INDEX CONCURRENTLY')
     from build_samples));
drop index kind_idx;
truncate build_samples;

select dblink_send_query('b_mig', 'create index plain_idx on events (kind)') \g /dev/null
call sample_build('b_mig');
select * from dblink_get_result('b_mig') t(r text) \g /dev/null
select * from dblink_get_result('b_mig') t(r text) \g /dev/null
select lab.prove('a plain build has no waiting or validation phases',
  (select bool_and(command = 'CREATE INDEX' and phase like 'building index:%')
          and bool_or(phase = 'building index: scanning table')
     from build_samples));
drop index plain_idx;

\echo
\echo -- What a failed concurrent build leaves behind

-- Cancel a build in its last wait, as a statement_timeout would.
select count(*) from dblink('b_hold', 'begin isolation level repeatable read; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ (select phase = 'waiting for old snapshots' from build_progress) $$);
select dblink_cancel_query('b_cic') \g /dev/null
select * from dblink_get_result('b_cic', false) t(r text) \g /dev/null
select * from dblink_get_result('b_cic', false) t(r text) \g /dev/null
select dblink_exec('b_hold', 'commit') \g /dev/null
select lab.prove('a build canceled after its scans leaves an index that is ready but not valid',
  (select indisready and not indisvalid from pg_index where indexrelid = 'kind_idx'::regclass));
select pg_relation_size('kind_idx') as k0 \gset
insert into events (account_id, project_id, user_id, kind)
select 1, 1, 1, 'kind-' || g from generate_series(1, 20000) g;
select lab.prove('every write still maintains it: it grew with 20,000 inserts',
  pg_relation_size('kind_idx') > :k0);
set enable_seqscan = off;
select lab.prove('but no query can use it',
  not exists (select 1 from unnest(lab.nodes($$ select * from events where kind = 'kind-7' $$)) n
               where n like '%Index%'));
reset enable_seqscan;
delete from events where kind like 'kind-%';
drop index concurrently kind_idx;

-- A unique build that fails: plain rolls back, concurrent leaves debris.
do $$
begin
  create unique index events_project_kind_key on events (project_id, kind);
  raise exception 'no error';
exception when unique_violation then
  null;
end $$;
select lab.prove('a plain unique build that fails leaves nothing behind',
  to_regclass('events_project_kind_key') is null);
do $$
begin
  perform dblink_exec('b_cic', 'create unique index concurrently events_project_kind_key
                                  on events (project_id, kind)');
  raise exception 'no error';
exception when unique_violation then
  null;
end $$;
select lab.prove('a concurrent one leaves an invalid index to drop',
  (select not indisvalid from pg_index where indexrelid = 'events_project_kind_key'::regclass));
drop index concurrently events_project_kind_key;

-- A unique index enforces uniqueness before it is valid.
create table handles (id int primary key, handle text not null);
insert into handles select g, 'user' || g from generate_series(1, 1000) g;
select count(*) from dblink('b_hold', 'begin isolation level repeatable read; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('b_cic', 'create unique index concurrently handles_handle_key on handles (handle)') \g /dev/null
call wait_for($$ (select phase = 'waiting for old snapshots' from build_progress) $$);
do $$
begin
  perform dblink_exec('b_web', $q$insert into handles values (1001, 'user7')$q$);
  raise exception 'no error';
exception when unique_violation then
  null;
end $$;
select lab.prove('while the unique build waits, still invalid, a duplicate insert is already rejected (23505)',
  (select not indisvalid from pg_index where indexrelid = 'handles_handle_key'::regclass));
select dblink_exec('b_hold', 'commit') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null

-- Only one concurrent build per table at a time.
select count(*) from dblink('b_hold', 'begin isolation level repeatable read; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('b_cic', 'create index concurrently kind_idx on events (kind)') \g /dev/null
call wait_for($$ (select phase = 'waiting for old snapshots' from build_progress) $$);
select dblink_send_query('b_mig', 'create index concurrently user_idx on events (user_id)') \g /dev/null
call wait_for(format('pg_blocking_pids(%s) = array[%s]', :b_mig, :b_cic));
select lab.prove('a second concurrent build on the same table queues behind the first',
  exists (select 1 from pg_locks where pid = :b_mig and relation = 'events'::regclass
             and mode = 'ShareUpdateExclusiveLock' and not granted));
select dblink_exec('b_hold', 'commit') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 and dblink_is_busy('b_mig') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_mig') t(r text) \g /dev/null
select * from dblink_get_result('b_mig') t(r text) \g /dev/null
select lab.prove('then both finish, valid',
  (select bool_and(indisvalid) and count(*) = 2 from pg_index
    where indexrelid in ('kind_idx'::regclass, 'user_idx'::regclass)));
drop index kind_idx, user_idx;

\echo
\echo -- REINDEX or REINDEX CONCURRENTLY

select dblink_exec('b_mig', 'begin') \g /dev/null
select dblink_exec('b_mig', 'reindex index events_created_at_idx') \g /dev/null
select lab.prove('plain reindex takes Share on the table and AccessExclusive on the index',
  exists (select 1 from pg_locks where pid = :b_mig and relation = 'events'::regclass and mode = 'ShareLock')
  and exists (select 1 from pg_locks where pid = :b_mig and relation = 'events_created_at_idx'::regclass
                 and mode = 'AccessExclusiveLock'));
select dblink_send_query('b_web', 'select kind from events where id = 42') \g /dev/null
call wait_for(format('pg_blocking_pids(%s) = array[%s]', :b_web, :b_mig));
select lab.prove('and that blocks even a primary key lookup: planning it opens every index on the table',
  (select wait_event from pg_stat_activity where pid = :b_web) = 'relation');
select dblink_exec('b_mig', 'rollback') \g /dev/null
call wait_for($$ dblink_is_busy('b_web') = 0 $$);
select * from dblink_get_result('b_web') t(k text) \g /dev/null
select * from dblink_get_result('b_web') t(k text) \g /dev/null

select count(*) from dblink('b_hold', 'begin isolation level repeatable read; select count(*) from accounts') t(n bigint) \g /dev/null
select dblink_send_query('b_cic', 'reindex index concurrently events_created_at_idx') \g /dev/null
call wait_for(format('(select current_locker_pid = %s from build_progress)', :b_hold));
select lab.prove('reindex concurrently builds a second copy beside the old one, named _ccnew',
  (select command = 'REINDEX CONCURRENTLY' from build_progress)
  and to_regclass('events_created_at_idx_ccnew') is not null);
select lab.prove('while it runs, lookups and inserts go through',
  (select k from dblink('b_web', 'select kind from events where id = 42') t(k text)) is not null
  and (select count(*) from dblink('b_web',
     $$insert into events (account_id, project_id, user_id, kind) values (1, 1, 1, 'deploy') returning id$$) t(id bigint)) = 1);
select dblink_exec('b_hold', 'commit') \g /dev/null
call wait_for($$ dblink_is_busy('b_cic') = 0 $$);
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select * from dblink_get_result('b_cic') t(r text) \g /dev/null
select lab.prove('and swaps it in: one valid index, no _ccnew left',
  to_regclass('events_created_at_idx_ccnew') is null
  and (select indisvalid from pg_index where indexrelid = 'events_created_at_idx'::regclass));

\echo
\echo -- Partitioned tables: build each partition, then attach

create table events_m (
  id bigint, project_id bigint, kind text, created_at timestamptz not null
) partition by range (created_at);
create table events_m_2026_07 partition of events_m for values from ('2026-07-01') to ('2026-08-01');
create table events_m_2026_08 partition of events_m for values from ('2026-08-01') to ('2026-09-01');
create table events_m_2026_09 partition of events_m for values from ('2026-09-01') to ('2026-10-01');
insert into events_m select id, project_id, kind, created_at from events
 where created_at >= '2026-07-01' and created_at < '2026-10-01';

do $$
begin
  perform dblink_exec('b_cic', 'create index concurrently events_m_kind_idx on events_m (kind)');
  raise exception 'no error';
exception when feature_not_supported then
  if sqlerrm not like 'cannot create index on partitioned table "events_m" concurrently%' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('create index concurrently on a partitioned table fails (0A000)', true);

select ddl_locks('create index events_m_kind_idx on events_m (kind)') as pm_locks \gset
select lab.prove('a plain create index on the parent takes Share on every partition',
  strongest(:'pm_locks', 'events_m_2026_07') = 'ShareLock'
  and strongest(:'pm_locks', 'events_m_2026_08') = 'ShareLock'
  and strongest(:'pm_locks', 'events_m_2026_09') = 'ShareLock');

create index events_m_kind_idx on only events_m (kind);
select lab.prove('on only the parent, the index is instant, has no children, and is invalid',
  (select not indisvalid from pg_index where indexrelid = 'events_m_kind_idx'::regclass)
  and not exists (select 1 from pg_inherits where inhparent = 'events_m_kind_idx'::regclass));

select format('create index concurrently %I on %s (kind)', c.relname || '_kind_idx', c.oid::regclass),
       format('alter index events_m_kind_idx attach partition %I', c.relname || '_kind_idx')
  from pg_inherits i join pg_class c on c.oid = i.inhrelid
 where i.inhparent = 'events_m'::regclass and c.relname <> 'events_m_2026_09'
 order by c.relname
\gexec
select lab.prove('with two of three partitions attached, the parent index is still invalid',
  (select not indisvalid from pg_index where indexrelid = 'events_m_kind_idx'::regclass));
create index concurrently events_m_2026_09_kind_idx on events_m_2026_09 (kind);
alter index events_m_kind_idx attach partition events_m_2026_09_kind_idx;
select lab.prove('after the last attach, it turns valid on its own',
  (select indisvalid from pg_index where indexrelid = 'events_m_kind_idx'::regclass)
  and (select count(*) from pg_inherits where inhparent = 'events_m_kind_idx'::regclass) = 3);
create table events_m_2026_10 partition of events_m for values from ('2026-10-01') to ('2026-11-01');
select lab.prove('and a partition created later gets its own matching index',
  exists (select 1 from pg_inherits i join pg_index x on x.indexrelid = i.inhrelid
           where i.inhparent = 'events_m_kind_idx'::regclass
             and x.indrelid = 'events_m_2026_10'::regclass));

\echo
\echo -- Parallel builds and maintenance_work_mem

-- How many processes scanned events during one build: the leader plus each
-- worker counts one scan. Workers report their stats as they exit.
\set build 'create index par_idx on events (project_id, created_at)'

select pg_stat_force_next_flush() \g /dev/null
select scans as s0 from events_reads() \gset
set max_parallel_maintenance_workers = 0;
:build;
drop index par_idx;
reset max_parallel_maintenance_workers;
select pg_sleep(0.5) \g /dev/null
select pg_stat_force_next_flush() \g /dev/null
select lab.prove('with workers off, one process builds the index',
  (select scans - :s0 = 1 from events_reads()));

select pg_stat_force_next_flush() \g /dev/null
select scans as s0 from events_reads() \gset
:build;
drop index par_idx;
select pg_sleep(0.5) \g /dev/null
select pg_stat_force_next_flush() \g /dev/null
select lab.prove('at the defaults (64 MB, 2 workers allowed) the build gets only one worker: each needs 32 MB',
  current_setting('maintenance_work_mem') = '64MB'
  and current_setting('max_parallel_maintenance_workers') = '2'
  and (select scans - :s0 = 2 from events_reads()));

select pg_stat_force_next_flush() \g /dev/null
select scans as s0 from events_reads() \gset
set maintenance_work_mem = '256MB';
:build;
drop index par_idx;
reset maintenance_work_mem;
select pg_sleep(0.5) \g /dev/null
select pg_stat_force_next_flush() \g /dev/null
select lab.prove('with 256 MB it gets both workers: three processes scan the table',
  (select scans - :s0 = 3 from events_reads()));

select dblink_disconnect('b_mig') \g /dev/null
select dblink_disconnect('b_web') \g /dev/null
select dblink_disconnect('b_hold') \g /dev/null
select dblink_disconnect('b_cic') \g /dev/null
