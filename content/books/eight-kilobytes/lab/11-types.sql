-- Lab for "Types are a contract"
-- https://www.flagon.io/books/eight-kilobytes/types
-- Run: ./lab 11-types
--
-- Every claim below runs against a fresh clone of the sample data. The
-- collation corruption demo edits pg_collation, which is only safe because
-- this lab runs in its own throwaway database (lab_08_types). Never do that
-- on a database you care about.

\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

\echo
\echo '## The opening error'
select lab.prove('2147483647::int + 1 fails with integer out of range',
  lab.try($$ select 2147483647::int + 1 $$) = '22003: integer out of range');
select lab.prove('1,000 rows a second uses up the remaining integer range in about 25 days',
  (2147483647 - 2000000) / 1000.0 / 86400 between 24 and 26);

\echo
\echo '## Every byte is paid per row'
select lab.prove('smallint, integer, bigint, float8 take 2, 4, 8, 8 bytes',
  (pg_column_size(1::smallint), pg_column_size(1::int), pg_column_size(1::bigint),
   pg_column_size(1::float8)) = (2, 4, 8, 8));
select lab.prove('numeric 1 takes 8 bytes and 123456789.12 takes 14',
  (pg_column_size(1::numeric), pg_column_size(123456789.12::numeric)) = (8, 14));
select lab.prove('a smallint between two bigints costs 8 bytes after padding (6 more than at the end)',
  pg_column_size(row(1::bigint, 1::smallint, 1::bigint))
  - pg_column_size(row(1::bigint, 1::bigint, 1::smallint)) = 6);

\echo
\echo '## Money is numeric, never float'
select lab.prove('0.1 + 0.2 in float8 is 0.30000000000000004; in numeric it is 0.3',
  (0.1::float8 + 0.2::float8)::text = '0.30000000000000004' and 0.1::numeric + 0.2 = 0.3);
select lab.prove('a million float8 0.1s sum to 100000.00000133288',
  (select sum(0.1::float8)::text from generate_series(1, 1000000)) = '100000.00000133288');
select lab.prove('a million numeric 0.1s sum to exactly 100000.0',
  (select sum(0.1::numeric)::text from generate_series(1, 1000000)) = '100000.0');
select lab.prove('numeric(12, 2) rounds 1234.567 to 1234.57 on input',
  1234.567::numeric(12, 2)::text = '1234.57');
select lab.prove('arithmetic keeps its own scale: 2.5::numeric(4, 2) * 1.15 = 2.8750',
  (2.5::numeric(4, 2) * 1.15)::text = '2.8750');

\echo
\echo '## Just use text'
select lab.prove('text and varchar(50) store hello in 9 bytes; char(50) in 54',
  (pg_column_size('hello'::text), pg_column_size('hello'::varchar(50)),
   pg_column_size('hello'::char(50))) = (9, 9, 54));
create table t_v (email varchar(100));
create table t_t (email text check (length(email) <= 320));
select lab.prove('varchar(100) rejects 101 characters: value too long for type character varying(100)',
  lab.try($$ insert into t_v values (repeat('x', 101)) $$)
    = '22001: value too long for type character varying(100)');
select lab.prove('the check constraint rejects 321 characters by name (t_t_email_check)',
  lab.try($$ insert into t_t values (repeat('x', 321)) $$) like '23514:%"t_t_email_check"');
select lab.prove('char(n) ignores trailing spaces in comparison, length, and concatenation',
  'a '::char(3) = 'a'::char(3) and length('a  '::char(3)) = 1 and 'a '::char(3) || 'b' = 'ab');

\echo
\echo '## Collations decide what equal means'
select lab.prove('this image has the libc collation en_US.utf8, ICU "unicode", and builtin pg_c_utf8',
  (select count(*) from pg_collation
   where (collname, collprovider) in (('en_US.utf8', 'c'), ('unicode', 'i'),
                                      ('pg_c_utf8', 'b'), ('pg_unicode_fast', 'b'))) = 4);
create temp table words as
  select x from (values ('apple'), ('Banana'), ('cherry'),
                        ('_draft'), ('Zebra'), ('éclair')) v(x);
select lab.prove('C sorts by code point: Banana Zebra _draft apple cherry éclair',
  (select string_agg(x, ' ' order by x collate "C") from words)
    = 'Banana Zebra _draft apple cherry éclair');
select lab.prove('builtin pg_c_utf8 sorts exactly like C',
  (select string_agg(x, ' ' order by x collate "pg_c_utf8") from words)
    = (select string_agg(x, ' ' order by x collate "C") from words));
select lab.prove('glibc en_US puts _draft after cherry: apple Banana cherry _draft éclair Zebra',
  (select string_agg(x, ' ' order by x collate "en_US.utf8") from words)
    = 'apple Banana cherry _draft éclair Zebra');
select lab.prove('ICU (unicode, root locale) puts _draft first: _draft apple Banana cherry éclair Zebra',
  (select string_agg(x, ' ' order by x collate "unicode") from words)
    = '_draft apple Banana cherry éclair Zebra');
select lab.prove('the database default is libc en_US.utf8 on glibc 2.41',
  (select (datlocprovider, datcollate) = ('c', 'en_US.utf8') and datcollversion like '2.%'
   from pg_database where datname = current_database()));
select lab.prove('upper() under pg_c_utf8 gives ÉCLAIR; under C it gives éCLAIR',
  upper('éclair' collate pg_c_utf8) = 'ÉCLAIR' and upper('éclair' collate "C") = 'éCLAIR');
select lab.prove('pg_unicode_fast folds ß to ss',
  casefold('Straße' collate "pg_unicode_fast") = 'strasse');

create table pfx (name text collate pg_c_utf8, name_en text collate "en_US.utf8");
insert into pfx select 'user' || g, 'user' || g from generate_series(1, 100000) g;
create index pfx_name_idx on pfx (name);
create index pfx_name_en_idx on pfx (name_en);
analyze pfx;
select lab.prove('under the builtin C.UTF-8 collation a plain B-tree serves like ''abc%''',
  'Bitmap Index Scan' = any(lab.nodes($$ select * from pfx where name like 'user42%' $$))
  or 'Index Scan' = any(lab.nodes($$ select * from pfx where name like 'user42%' $$)));
select lab.prove('under en_US.utf8 the same kind of index cannot serve it',
  lab.nodes($$ select * from pfx where name_en like 'user42%' $$) = array['Seq Scan']);

\echo
\echo '### Deterministic and nondeterministic'
select lab.prove('an uppercase email finds nothing in the default collation',
  (select count(*) from users where account_id = 2 and email = 'USER1@EXAMPLE.COM') = 0
  and exists (select 1 from users where account_id = 2 and email = 'user1@example.com'));
create collation case_insensitive (
  provider = icu, locale = 'und-u-ks-level2', deterministic = false
);
select lab.prove('Ada@Example.com = ada@example.com is false by default, true under case_insensitive',
  not ('Ada@Example.com' = 'ada@example.com')
  and ('Ada@Example.com' = 'ada@example.com' collate case_insensitive));
create table users_ci (
  id          bigint primary key,
  account_id  bigint not null,
  email       text collate case_insensitive not null,
  unique (account_id, email)
);
insert into users_ci select id, account_id, email from users;
vacuum analyze users_ci;
select lab.prove('the case-insensitive unique constraint rejects USER1@EXAMPLE.COM',
  lab.try($$ insert into users_ci values (1000001, 2, 'USER1@EXAMPLE.COM') $$)
    like '23505:%users_ci_account_id_email_key%');
select lab.prove('an equality lookup on users_ci uses the index and reads under 10 pages',
  'Index Scan' = any(lab.nodes($$ select * from users_ci where account_id = 2 and email = 'USER1@EXAMPLE.COM' $$))
  and lab.buffers($$ select * from users_ci where account_id = 2 and email = 'USER1@EXAMPLE.COM' $$) < 10);
select lab.prove('like works on a nondeterministic collation in PostgreSQL 18 and finds the row',
  (select count(*) from users_ci where email like 'USER4242@%') = 1);
select lab.prove('but it is a sequential scan of all 834 pages',
  'Seq Scan' = any(lab.nodes($$ select count(*) from users_ci where email like 'USER4242@%' $$))
  and lab.buffers($$ select count(*) from users_ci where email like 'USER4242@%' $$) >= 834);
select lab.prove('regular expressions fail: nondeterministic collations are not supported',
  lab.try($$ select count(*) from users_ci where email ~ 'x' $$)
    like '0A000: nondeterministic collations are not supported%');
select lab.prove('ilike fails the same way',
  lab.try($$ select count(*) from users_ci where email ilike 'x%' $$)
    like '0A000: nondeterministic collations are not supported%');

\echo
\echo '### Case-insensitive matching: pick one'
create index users_lower_email on users (account_id, lower(email));
select lab.prove('the lower(email) expression index serves the lookup in a few pages',
  'Index Scan' = any(lab.nodes($$ select id from users where account_id = 2 and lower(email) = lower('USER1@Example.com') $$))
  and lab.buffers($$ select id from users where account_id = 2 and lower(email) = lower('USER1@Example.com') $$) < 10);
select lab.prove('casefold() matches STRASSE and Straße under pg_unicode_fast; lower() does not',
  casefold('STRASSE' collate "pg_unicode_fast") = casefold('Straße' collate "pg_unicode_fast")
  and lower('STRASSE') <> lower('Straße'));

\echo
\echo '### An OS upgrade can corrupt your indexes (simulated, in this clone only)'
create extension if not exists amcheck;
create collation app_en (provider = libc, locale = 'en_US.utf8');
create table tags (name text collate app_en primary key);
insert into tags values ('apple'), ('Banana'), ('cherry'), ('_draft'), ('Zebra'),
                        ('éclair'), ('delta'), ('Echo'), ('fig'), ('Golf');
insert into tags select 'tag' || g from generate_series(1, 5000) g;
insert into tags select 'Tag' || g from generate_series(1, 5000) g;
select lab.prove('before the change, the index finds Zebra',
  (select count(*) from tags where name = 'Zebra') = 1);

-- Simulate the OS changing its sort rules under the index. This rewrites a
-- catalog row; it is safe here only because this database is a disposable clone.
update pg_collation set collcollate = 'C.utf8', collctype = 'C.utf8', collversion = null
where collname = 'app_en';

-- A new session picks up the new rules.
\c
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;
set enable_seqscan = off;
select lab.prove('after the change, the index finds no Zebra',
  (select count(*) from tags where name = 'Zebra') = 0);
select lab.prove('and no rows between Tag1 and Tag2',
  (select count(*) from tags where name >= 'Tag1' and name < 'Tag2') = 0);
reset enable_seqscan;
set enable_indexscan = off; set enable_bitmapscan = off; set enable_indexonlyscan = off;
select lab.prove('with index scans disabled, the same queries find Zebra and 1,111 rows',
  (select count(*) from tags where name = 'Zebra') = 1
  and (select count(*) from tags where name >= 'Tag1' and name < 'Tag2') = 1111);
reset enable_indexscan; reset enable_bitmapscan; reset enable_indexonlyscan;
select lab.prove('amcheck reports: item order invariant violated for index "tags_pkey"',
  lab.try($$ select bt_index_check('tags_pkey', true) $$)
    like 'XX002: item order invariant violated for index "tags_pkey"%');
select lab.prove('the primary key accepts a second Zebra',
  lab.try($$ insert into tags values ('Zebra') $$) = 'ok');
set enable_indexscan = off; set enable_bitmapscan = off; set enable_indexonlyscan = off;
select lab.prove('the table now holds two Zebra rows under a primary key',
  (select count(*) from tags where name = 'Zebra') = 2);
reset enable_indexscan; reset enable_bitmapscan; reset enable_indexonlyscan;
select lab.prove('reindex fails: could not create unique index "tags_pkey"',
  lab.try($$ reindex index tags_pkey $$) like '23505: could not create unique index "tags_pkey"%');

\echo
\echo '### Detect it before it bites'
-- Put the real rules back, but record an old library version, standing in for
-- a collation created before an OS upgrade.
update pg_collation set collcollate = 'en_US.utf8', collctype = 'en_US.utf8', collversion = '2.28'
where collname = 'app_en';
\c
\pset tuples_only on
\pset format unaligned
set client_min_messages = error;   -- hide the version-mismatch WARNING the next queries trigger
select lab.prove('the version check finds app_en recorded at 2.28 against the library''s 2.41',
  (select (collversion, pg_collation_actual_version(oid)) = ('2.28', '2.41')
   from pg_collation
   where collversion <> pg_collation_actual_version(oid) and collname = 'app_en'));
select lab.prove('pg_database_collation_actual_version reports the default collation version',
  (select datcollversion = pg_database_collation_actual_version(oid)
   from pg_database where datname = current_database()));
select lab.prove('the exposure query lists users_account_id_email_key, users_lower_email and tags_pkey',
  (select array_agg(i.indexrelid::regclass::text)
   from pg_index i
   join pg_class c on c.oid = i.indexrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and exists (
       select 1
       from unnest(i.indcollation::oid[]) as k(coll)
       join pg_collation pc on pc.oid = k.coll
       where pc.collprovider <> 'b'
         and pc.collname not in ('C', 'POSIX')))
  @> array['users_account_id_email_key', 'users_lower_email', 'tags_pkey']);
select lab.prove('the exposure query skips the builtin-collated pfx_name_idx',
  not exists (select 1 from pg_index i
              where i.indexrelid = 'pfx_name_idx'::regclass
                and exists (select 1 from unnest(i.indcollation::oid[]) k(coll)
                            join pg_collation pc on pc.oid = k.coll
                            where pc.collprovider <> 'b' and pc.collname not in ('C', 'POSIX'))));
-- Repair: remove the duplicate, reindex, then refresh the version.
set enable_indexscan = off; set enable_bitmapscan = off; set enable_indexonlyscan = off;
delete from tags where ctid = (select max(ctid) from tags where name = 'Zebra');
reset enable_indexscan; reset enable_bitmapscan; reset enable_indexonlyscan;
select lab.prove('after removing the duplicate, reindex succeeds and amcheck passes',
  lab.try($$ reindex index tags_pkey $$) = 'ok'
  and lab.try($$ select bt_index_check('tags_pkey', true) $$) = 'ok');
alter collation app_en refresh version;
select lab.prove('refresh version records the library version, so the mismatch is gone',
  (select collversion = pg_collation_actual_version(oid) from pg_collation where collname = 'app_en'));
-- The database default records a version too (PostgreSQL 15+). Pretend this
-- database was created on an older glibc, then "fix" it.
update pg_database set datcollversion = '2.31' where datname = current_database();
select lab.prove(
  'the recorded collation version (2.31) no longer matches the library',
  (select datcollversion <> pg_database_collation_actual_version(oid)
   from pg_database where datname = current_database()));
do $$ begin
  execute format('alter database %I refresh collation version', current_database());
end $$;
select lab.prove(
  'REFRESH COLLATION VERSION only rewrites the recorded number',
  (select datcollversion = pg_database_collation_actual_version(oid)
   from pg_database where datname = current_database()));
set client_min_messages = warning;

\echo
\echo '## Timestamps: always timestamptz'
set timezone = 'America/New_York';
create table tz_demo (label text, ts timestamp, tstz timestamptz);
insert into tz_demo values ('new york', clock_timestamp(), clock_timestamp());
set timezone = 'UTC';
insert into tz_demo values ('utc', clock_timestamp(), clock_timestamp());
select lab.prove('timestamp records the two inserts four hours apart; timestamptz under a second apart',
  (select max(ts) - min(ts) between interval '4 hours' and interval '4 hours 1 second'
      and max(tstz) - min(tstz) < interval '1 second' from tz_demo));
set timezone = 'America/New_York';
select lab.prove('across the 2026-03-08 DST jump: +1 hour is 03:30, +1 day is 01:30 next day, +24 hours is 02:30',
  ('2026-03-08 01:30'::timestamptz + interval '1 hour')::text   = '2026-03-08 03:30:00-04'
  and ('2026-03-08 01:30'::timestamptz + interval '1 day')::text    = '2026-03-09 01:30:00-04'
  and ('2026-03-08 01:30'::timestamptz + interval '24 hours')::text = '2026-03-09 02:30:00-04');
select lab.prove('a plain timestamp returns 02:30, a time that never existed in New York',
  ('2026-03-08 01:30'::timestamp + interval '1 hour')::text = '2026-03-08 02:30:00');
reset timezone;
select lab.prove('timestamp and timestamptz are both 8 bytes',
  pg_column_size(now()) = 8 and pg_column_size(now()::timestamp) = 8);
begin;
select pg_sleep(0.05) is null as slept \gset
select lab.prove('inside a transaction now() stays at its start; clock_timestamp() moves on',
  clock_timestamp() - now() >= interval '50 milliseconds');
commit;

\echo
\echo '## Dates and intervals'
select lab.prove('date is 4 bytes, interval 16, boolean 1',
  (pg_column_size(current_date), pg_column_size(interval '1 day'), pg_column_size(true)) = (4, 16, 1));
select lab.prove('Jan 31 + 1 month = Feb 28; date + 1 adds a day; Mar 1 - Feb 1 = 28 (an integer)',
  ('2026-01-31'::date + interval '1 month')::text = '2026-02-28 00:00:00'
  and '2026-01-31'::date + 1 = '2026-02-01'::date
  and pg_typeof(date '2026-03-01' - date '2026-02-01') = 'integer'::regtype
  and date '2026-03-01' - date '2026-02-01' = 28);

\echo
\echo '## Enums, check constraints, and lookup tables'
create type event_kind as enum ('deploy', 'build', 'comment', 'alert', 'login');
alter type event_kind add value 'rollback' after 'deploy';
select lab.prove('an enum value takes 4 bytes; add value can go anywhere in the order',
  pg_column_size('deploy'::event_kind) = 4
  and enum_range(null::event_kind)::text = '{deploy,rollback,build,comment,alert,login}');
begin;
alter type event_kind add value 'audit';
select lab.prove('a value added inside a transaction is unusable until commit (unsafe use of new value)',
  lab.try($$ select 'audit'::event_kind $$) like '55P04: unsafe use of new value "audit"%');
rollback;
select lab.prove('rename value works',
  lab.try($$ alter type event_kind rename value 'login' to 'sign_in' $$) = 'ok');
select lab.prove('there is no drop value',
  lab.try($$ alter type event_kind drop value 'sign_in' $$) like '0A000:%');

\echo
\echo '## Store UUIDs as uuid'
select lab.prove('a uuid is 16 bytes; the same value as text is 40',
  pg_column_size(gen_random_uuid()) = 16 and pg_column_size(gen_random_uuid()::text) = 40);

\echo
\echo '## Network addresses, ranges, arrays'
select lab.prove('10.1.2.3 << 10.1.0.0/16; host() and network() split 10.1.2.3/24',
  '10.1.2.3'::inet << '10.1.0.0/16'::cidr
  and host('10.1.2.3/24'::inet) = '10.1.2.3'
  and network('10.1.2.3/24'::inet)::text = '10.1.2.0/24');
create table ips (a inet);
insert into ips values ('10.0.0.10'), ('10.0.0.9'), ('::1');
select lab.prove('in a table, IPv4 inet takes 7 bytes and IPv6 19; 10.0.0.9 sorts before 10.0.0.10',
  (select array_agg(pg_column_size(a) order by a) from ips) = array[7, 7, 19]
  and (select array_agg(host(a) order by a) from ips) = array['10.0.0.9', '10.0.0.10', '::1']);
select lab.prove('daterange contains, int4range overlaps, upper() of January is 2026-02-01',
  '[2026-01-01,2026-02-01)'::daterange @> '2026-01-15'::date
  and int4range(1, 10) && int4range(5, 20)
  and upper('[2026-01-01,2026-02-01)'::daterange) = '2026-02-01'::date);
select lab.prove('discrete ranges normalize to half-open: [1,3] becomes [1,4)',
  '[1,3]'::int4range::text = '[1,4)');
select lab.prove('array containment and array_length',
  '{deploy,build}'::text[] @> array['build'] and array_length('{1,2,3}'::int[], 1) = 3);

\echo
\echo '## jsonb, and why not json'
select lab.prove('json keeps input verbatim; jsonb drops the duplicate key and normalizes',
  '{"a":1, "a":2, "b" : [1,2]}'::json::text = '{"a":1, "a":2, "b" : [1,2]}'
  and '{"a":1, "a":2, "b" : [1,2]}'::jsonb::text = '{"a": 2, "b": [1, 2]}');
select lab.prove('the sample payload is 52 bytes as json and 68 as jsonb',
  pg_column_size('{"status":"ok","duration_ms":120,"region":"iad"}'::json) = 52
  and pg_column_size('{"status":"ok","duration_ms":120,"region":"iad"}'::jsonb) = 68);
select lab.prove('events.payload values take 63 to 69 bytes each',
  (select min(pg_column_size(payload)) >= 63 and max(pg_column_size(payload)) <= 69 from events));
select lab.prove('the same facts as typed columns would take about a fifth of the space',
  (select avg(pg_column_size(payload))
          / avg((octet_length(payload->>'status') + 1) + 4 + (octet_length(payload->>'region') + 1))
   from (select payload from events tablesample system (5) repeatable (42)) e) between 5 and 6);

\echo
\echo '## Domains'
create domain email_address as text
  check (value ~ '^[^@\s]+@[^@\s]+$' and length(value) <= 320);
select lab.prove('the domain rejects nope and accepts a@b.co',
  lab.try($$ select 'nope'::email_address $$)
    = '23514: value for domain email_address violates check constraint "email_address_check"'
  and 'a@b.co'::email_address = 'a@b.co');

\echo
\echo '## Generated columns'
create table g_demo (
  id           bigint generated always as identity primary key,
  price_cents  bigint not null,
  qty          int    not null,
  total_cents  bigint generated always as (price_cents * qty),
  total_stored bigint generated always as (price_cents * qty) stored
);
insert into g_demo (price_cents, qty) values (1999, 3);
select lab.prove('both generated columns compute 5997',
  (select (total_cents, total_stored) = (5997, 5997) from g_demo));
select lab.prove('in PostgreSQL 18 the default is virtual (v); stored is s',
  (select array_agg(attgenerated::text order by attnum) from pg_attribute
   where attrelid = 'g_demo'::regclass and attgenerated <> '') = array['v', 's']);
select lab.prove('indexes on virtual generated columns are not supported; on stored ones they are',
  lab.try($$ create index on g_demo (total_cents) $$)
    = '0A000: indexes on virtual generated columns are not supported'
  and lab.try($$ create index on g_demo (total_stored) $$) = 'ok');

\echo
\echo '## Types to avoid'
create table s_demo (id serial primary key, v text);
insert into s_demo (id, v) values (1, 'manual');
select lab.prove('serial: after an explicit id, the next default insert collides',
  lab.try($$ insert into s_demo (v) values ('auto') $$)
    like '23505: duplicate key value violates unique constraint "s_demo_pkey"%');
select lab.prove('serial is a 4-byte integer',
  (select atttypid = 'integer'::regtype from pg_attribute
   where attrelid = 's_demo'::regclass and attname = 'id'));
create table i_demo (id bigint generated always as identity primary key, v text);
select lab.prove('generated always as identity refuses the explicit id',
  lab.try($$ insert into i_demo (id, v) values (1, 'manual') $$)
    = '428C9: cannot insert a non-DEFAULT value into column "id"');
select lab.prove('timetz refuses a named zone',
  lab.try($$ select '12:00 America/New_York'::timetz $$)
    like '22007: invalid input syntax for type time with time zone%');
