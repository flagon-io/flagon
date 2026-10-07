-- Lab for "Know the nouns first"
-- https://www.flagon.io/books/eight-kilobytes/basics
-- Run: ./lab 01-basics
--
-- The primitives every later chapter assumes, each checked against the
-- running server: databases, processes, schemas, roles, transactions, the
-- catalog, settings, extensions, and the files underneath.

\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

\echo
\echo '## A table is rows that share the same columns'
select lab.prove('events has 2,000,000 rows, every one with the same seven columns',
  (select count(*) from events) = 2000000
  and (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'events') = 7);

\echo
\echo '## SELECT asks, and changes nothing'
begin;
select count(*) from events where project_id = 4242 \g /dev/null
select lab.prove('a select takes no transaction id: reading writes nothing',
  pg_current_xact_id_if_assigned() is null);
commit;

\echo
\echo '## INSERT adds a row, and in Postgres so does UPDATE'
create table notes (id int primary key, body text);
insert into notes values (1, 'first draft');
select ctid::text as ctid_before from notes where id = 1 \gset
update notes set body = 'second draft' where id = 1;
select lab.prove('an update gives the row a new address',
  (select ctid::text from notes where id = 1) <> :'ctid_before');
select lab.prove('and leaves the old version on the page: one row, two copies',
  (select count(*) from notes) = 1
  and (select count(*) from heap_page_items(get_raw_page('notes', 0))) = 2);
delete from notes where id = 1;
select lab.prove('a delete leaves the row on the page too, marked dead, for vacuum to clear',
  (select count(*) from notes) = 0
  and (select count(*) from heap_page_items(get_raw_page('notes', 0))) = 2);

\echo
\echo '## JOIN puts the tables back together'
select lab.prove('a join follows account_id from a user to its account: user 295 is in account 296',
  (select a.id from users u join accounts a on a.id = u.account_id where u.id = 295) = 296);

\echo
\echo '## An index makes one read cheap and every write dearer'
select lab.buffers($$ select id from users where email = 'user29695@example.com' $$) as before_index \gset
create index users_email_idx on users (email);
select lab.buffers($$ select id from users where email = 'user29695@example.com' $$) as after_index \gset
\echo pages read finding one user by email: before :before_index, after :after_index
select lab.prove('finding one user by email reads hundreds of pages without an index and a handful with one',
  :before_index > 300 and :after_index < 10);

\echo
\echo '## One server runs many databases, and they don''t share tables'
\pset tuples_only off
select datname, datistemplate from pg_database
where datname in ('book', 'postgres', 'template0', 'template1') order by datname;
\pset tuples_only on
select lab.prove('the server holds several databases, book among them, and book is a template',
  (select count(*) from pg_database) >= 4
  and (select datistemplate from pg_database where datname = 'book'));
select lab.prove('a query can''t reach into another database',
  lab.try($$ select count(*) from book.public.events $$)
    like '0A000: cross-database references are not implemented%');

\echo
\echo '## Every connection is its own process'
create extension if not exists dblink;
select dblink_connect('other', 'dbname=' || current_database()) \g /dev/null
select lab.prove('a second connection is served by a different server process',
  (select pid from dblink('other', 'select pg_backend_pid()') as t(pid int)) <> pg_backend_pid());
select dblink_disconnect('other') \g /dev/null
\pset tuples_only off
select backend_type, count(*) from pg_stat_activity group by backend_type order by backend_type;
\pset tuples_only on
select lab.prove('the server runs its own processes too: a checkpointer, a WAL writer, an autovacuum launcher',
  (select count(distinct backend_type) = 3 from pg_stat_activity
   where backend_type in ('checkpointer', 'walwriter', 'autovacuum launcher')));

\echo
\echo '## Schemas are folders, and search_path picks the one you meant'
create schema billing;
create table public.invoices  (id bigint, note text);
create table billing.invoices (id bigint, note text);
insert into public.invoices  values (1, 'public');
insert into billing.invoices values (1, 'billing');
select lab.prove('with the default search_path, invoices means public.invoices',
  (select note from invoices) = 'public');
set search_path = billing, public;
select lab.prove('put billing first and the same query reads billing.invoices',
  (select note from invoices) = 'billing');
reset search_path;

\echo
\echo '## A role is a user, a group, or both'
drop role if exists ana;
drop role if exists reporting;
create role reporting;
create role ana login in role reporting;
select lab.prove('a role with LOGIN is a user; one without is a group, and membership links them',
  (select rolcanlogin from pg_roles where rolname = 'ana')
  and not (select rolcanlogin from pg_roles where rolname = 'reporting')
  and pg_has_role('ana', 'reporting', 'member'));
drop role ana;
drop role reporting;

\echo
\echo '## Every statement runs in a transaction'
begin;
create table scratch_t (x int);
insert into scratch_t values (1);
rollback;
select lab.prove('a rolled-back transaction takes its create table with it',
  to_regclass('scratch_t') is null);
select pg_current_xact_id()::text as xid1 \gset
select pg_current_xact_id()::text as xid2 \gset
select lab.prove('two statements outside begin run as two transactions, with two transaction ids',
  :xid1 < :xid2);

\echo
\echo '## The server describes itself in tables'
\pset tuples_only off
select relname, relkind, relpages, reltuples::bigint from pg_class where relname = 'events';
\pset tuples_only on
select lab.prove('pg_class already knows events is 35,173 pages and about 2 million rows',
  (select relpages = 35173 and reltuples between 1990000 and 2010000 from pg_class where relname = 'events'));

\echo
\echo '## A setting has a value, a source, and a scope'
select lab.prove('work_mem defaults to 4MB',
  current_setting('work_mem') = '4MB');
begin;
set local work_mem = '64MB';
select lab.prove('set local changes it for this transaction only',
  current_setting('work_mem') = '64MB');
commit;
select lab.prove('and it''s back at commit',
  current_setting('work_mem') = '4MB');
select lab.prove('pg_settings says where each value came from',
  (select source from pg_settings where name = 'work_mem') = 'default');

\echo
\echo '## Extensions arrive with one command'
\pset tuples_only off
select extname from pg_extension where extname <> 'plpgsql' order by extname;
\pset tuples_only on
select lab.prove('the lab database has the book''s five extensions installed',
  (select count(*) from pg_extension
   where extname in ('pg_stat_statements', 'pg_trgm', 'pageinspect', 'pg_buffercache', 'pgstattuple')) = 5);

\echo
\echo '## Your data is files you never touch'
\pset tuples_only off
select pg_relation_filepath('events') as file, pg_relation_size('events') as bytes;
\pset tuples_only on
select lab.prove('events is a file under base/ of exactly 35,173 pages of 8,192 bytes',
  pg_relation_filepath('events') like 'base/%'
  and pg_relation_size('events') = 35173 * 8192);
