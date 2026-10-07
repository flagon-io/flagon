-- Lab for "Pick your keys once"
-- https://www.flagon.io/books/eight-kilobytes/keys
-- Run: ./lab 12-keys
--
-- The chapter's bigint vs UUIDv4 vs UUIDv7 experiment runs here at one fifth
-- of the chapter's scale (200,000 rows per phase instead of 1,000,000, and
-- phase 2 in ten batches of 20,000), so the lab finishes in a minute or two. The
-- checks prove the ratios the chapter relies on, not its absolute sizes.

\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

\echo
\echo '## Natural keys change; surrogate keys don''t'
select lab.prove('users has a surrogate identity key and unique (account_id, email) as the natural key',
  (select attidentity = 'a' from pg_attribute where attrelid = 'users'::regclass and attname = 'id')
  and exists (select 1 from pg_constraint where conrelid = 'users'::regclass and contype = 'u'
              and pg_get_constraintdef(oid) = 'UNIQUE (account_id, email)'));

\echo
\echo '## Identity vs serial'
create table imported (id bigint generated always as identity primary key, v text);
select lab.prove('generated always refuses an explicit id without overriding system value',
  lab.try($$ insert into imported (id, v) values (1, 'a') $$) like '428C9:%');
insert into imported (id, v) overriding system value values (1, 'a'), (2, 'b'), (3, 'c');
select lab.prove('after importing ids 1 to 3, the next normal insert collides on id 1',
  lab.try($$ insert into imported (v) values ('d') $$)
    like '23505: duplicate key value violates unique constraint "imported_pkey"%');
select setval(pg_get_serial_sequence('imported', 'id'), (select max(id) from imported)) is not null as moved \gset
insert into imported (v) values ('d');
select lab.prove('after setval to max(id), the next insert gets 4',
  (select max(id) from imported) = 4);

create sequence gap_demo;
select nextval('gap_demo') is not null as first \gset
begin;
select nextval('gap_demo') is not null as taken \gset
rollback;
select lab.prove('nextval is never rolled back: after an aborted transaction took 2, the next value is 3',
  nextval('gap_demo') = 3);

\echo
\echo '## What a UUID is'
select lab.prove('uuidv7() makes version 7, gen_random_uuid() and uuidv4() make version 4',
  uuid_extract_version(uuidv7()) = 7
  and uuid_extract_version(gen_random_uuid()) = 4
  and uuid_extract_version(uuidv4()) = 4);
select lab.prove('every UUID is stored in 16 bytes',
  pg_column_size(uuidv7()) = 16 and pg_column_size(gen_random_uuid()) = 16);
select lab.prove('uuid_extract_timestamp of a v7 is its creation time; of a v4 it is null',
  abs(extract(epoch from uuid_extract_timestamp(uuidv7()) - now())) < 60
  and uuid_extract_timestamp(gen_random_uuid()) is null);
select lab.prove('100,000 uuidv7() values from one session strictly increase',
  (select bool_and(u > prev)
   from (select u, lag(u) over (order by g) as prev
         from (select g, uuidv7() as u from generate_series(1, 100000) g) s) x
   where prev is not null));
select lab.prove('consecutive v7 values share their leading time digits; v4 values do not',
  (select count(distinct left(uuidv7()::text, 8)) from generate_series(1, 4)) <= 2
  and (select count(distinct left(gen_random_uuid()::text, 8)) from generate_series(1, 4)) = 4);
select lab.prove('uuidv7(interval ''-1 hour'') embeds a time one hour ago',
  abs(extract(epoch from uuid_extract_timestamp(uuidv7(interval '-1 hour')) - (now() - interval '1 hour'))) < 60);

\echo
\echo '## The experiment: bigint vs UUIDv4 vs UUIDv7 (200,000 rows per phase)'
create extension if not exists pgstattuple;
create table k_bigint (id bigint generated always as identity primary key, n int);
create table k_uuidv4 (id uuid primary key default gen_random_uuid(),     n int);
create table k_uuidv7 (id uuid primary key default uuidv7(),              n int);
create table k_res (phase int, k text, batch int, wal numeric, fpi bigint, dirtied bigint, hit bigint);

-- Run one insert under EXPLAIN (ANALYZE, BUFFERS, WAL) and keep its counters.
create function k_run(p_phase int, p_table text, p_k text, p_batch int, p_rows int)
returns void language plpgsql as $$
declare p jsonb;
begin
  p := lab.plan(format('insert into %I (n) select g from generate_series(1, %s) g', p_table, p_rows));
  insert into k_res values (p_phase, p_k, p_batch,
    (p -> 'Plan' ->> 'WAL Bytes')::numeric, (p -> 'Plan' ->> 'WAL FPI')::bigint,
    (p -> 'Plan' ->> 'Shared Dirtied Blocks')::bigint, (p -> 'Plan' ->> 'Shared Hit Blocks')::bigint);
end $$;

create function k_index() returns table (k text, size bigint, leaf_pages bigint,
                                         density float8, fragmentation float8)
language sql as $$
  select k, pg_relation_size(t || '_pkey'), (s).leaf_pages, (s).avg_leaf_density, (s).leaf_fragmentation
  from (values ('bigint', 'k_bigint'), ('v4', 'k_uuidv4'), ('v7', 'k_uuidv7')) v(k, t),
       lateral (select pgstatindex(t || '_pkey') as s) x
$$;

\echo '### Phase 1: one bulk insert each, after a checkpoint'
checkpoint;
select k_run(1, 'k_bigint', 'bigint', 0, 200000) is null as done \gset
checkpoint;
select k_run(1, 'k_uuidv4', 'v4', 0, 200000) is null as done \gset
checkpoint;
select k_run(1, 'k_uuidv7', 'v7', 0, 200000) is null as done \gset
create table k_index1 as select * from k_index();
\pset tuples_only off
select k, pg_size_pretty(size) as size, leaf_pages, round(density::numeric, 1) as avg_leaf_density
from k_index1 order by k;
\pset tuples_only on

select lab.prove('bigint and UUIDv7 pack leaves about 90 percent full',
  (select bool_and(density between 88 and 92) from k_index1 where k in ('bigint', 'v7')));
select lab.prove('UUIDv4 leaves settle around 70 percent full (between 60 and 78)',
  (select density between 60 and 78 from k_index1 where k = 'v4'));
select lab.prove('UUIDv4 needs at least 20 percent more leaf pages than UUIDv7 for the same key width',
  (select (select leaf_pages from k_index1 where k = 'v4')::numeric
        / (select leaf_pages from k_index1 where k = 'v7') > 1.2));
select lab.prove('index size: bigint < UUIDv7 < UUIDv4',
  (select size from k_index1 where k = 'bigint') < (select size from k_index1 where k = 'v7')
  and (select size from k_index1 where k = 'v7') < (select size from k_index1 where k = 'v4'));
select lab.prove('between two checkpoints with everything in memory, the WAL gap is modest (v4 under 1.5x v7)',
  (select (select wal from k_res where phase = 1 and k = 'v4')
        / (select wal from k_res where phase = 1 and k = 'v7') < 1.5));
select lab.prove('UUIDv7 inserts touch fewer shared buffers than UUIDv4',
  (select hit from k_res where phase = 1 and k = 'v7') < (select hit from k_res where phase = 1 and k = 'v4'));

\echo '### Phase 2: the next 200,000 rows in 10 batches of 20,000, a checkpoint before each'
do $$
begin
  for i in 1..10 loop
    checkpoint; perform k_run(2, 'k_bigint', 'bigint', i, 20000);
    checkpoint; perform k_run(2, 'k_uuidv4', 'v4',     i, 20000);
    checkpoint; perform k_run(2, 'k_uuidv7', 'v7',     i, 20000);
  end loop;
end $$;
\pset tuples_only off
select k, pg_size_pretty(sum(wal)) as wal, sum(fpi) as fpi, sum(dirtied) as dirtied, sum(hit) as hits
from k_res where phase = 2 group by k order by k;
\pset tuples_only on

create temp view k2 as
  select k, sum(wal) as wal, sum(fpi) as fpi, sum(dirtied) as dirtied
  from k_res where phase = 2 group by k;
select lab.prove('with checkpoints in play, UUIDv4 writes more than 3 times the WAL of UUIDv7',
  (select wal from k2 where k = 'v4') > 3 * (select wal from k2 where k = 'v7'));
select lab.prove('and more than 3 times the WAL of bigint',
  (select wal from k2 where k = 'v4') > 3 * (select wal from k2 where k = 'bigint'));
select lab.prove('UUIDv7 WAL is within 20 percent of bigint''s',
  (select (select wal from k2 where k = 'v7') / (select wal from k2 where k = 'bigint') between 1.0 and 1.2));
select lab.prove('bigint and UUIDv7 batches write a handful of full-page images; UUIDv4 batches write hundreds or more',
  (select max(fpi) from k_res where phase = 2 and k in ('bigint', 'v7')) < 50
  and (select min(fpi) from k_res where phase = 2 and k = 'v4') > 500);
select lab.prove('UUIDv4 full-page images climb as the index grows (last batch above first)',
  (select fpi from k_res where phase = 2 and k = 'v4' and batch = 10)
  > (select fpi from k_res where phase = 2 and k = 'v4' and batch = 1));
select lab.prove('UUIDv4 dirties more than 5 times the buffers of UUIDv7',
  (select dirtied from k2 where k = 'v4') > 5 * (select dirtied from k2 where k = 'v7'));

create table k_index2 as select * from k_index();
\pset tuples_only off
select k, pg_size_pretty(size) as size, leaf_pages, round(density::numeric, 1) as avg_leaf_density,
       round(fragmentation::numeric, 1) as leaf_fragmentation
from k_index2 order by k;
\pset tuples_only on
select lab.prove('after both phases, bigint and UUIDv7 leaf fragmentation is 0 and UUIDv4''s is about 50 percent',
  (select bool_and(fragmentation < 1) from k_index2 where k in ('bigint', 'v7'))
  and (select fragmentation between 40 and 60 from k_index2 where k = 'v4'));
select lab.prove('UUIDv4 index is still at least 20 percent bigger than UUIDv7''s',
  (select (select size from k_index2 where k = 'v4')::numeric
        / (select size from k_index2 where k = 'v7') > 1.2));

\echo
\echo '## Store uuid as uuid, not text'
create table k_text   (id text primary key);
create table k_uuid2  (id uuid primary key);
insert into k_text  select id::text from k_uuidv7 order by id;
insert into k_uuid2 select id       from k_uuidv7 order by id;
select lab.prove('the text primary key index is more than 70 percent bigger than the uuid one',
  pg_relation_size('k_text_pkey') > 1.7 * pg_relation_size('k_uuid2_pkey'));
select lab.prove('the text table is more than 40 percent bigger',
  pg_relation_size('k_text') > 1.4 * pg_relation_size('k_uuid2'));
select lab.prove('uppercase and lowercase hex are equal as uuid, different as text',
  'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'::uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid
  and 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11' <> 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

\echo
\echo '## The database can''t always mint the id'
-- A bigint key with the client's uuid beside it: a retry inserts nothing.
create table client_rows (
  id         bigint generated always as identity primary key,
  account_id bigint not null,
  client_id  uuid not null,
  body       text not null,
  unique (account_id, client_id)
);
insert into client_rows (account_id, client_id, body)
values (1, '01a10f20-21b7-71a1-8d90-e6f8de20e3c7', 'first try')
on conflict (account_id, client_id) do nothing;
with retry as (
  insert into client_rows (account_id, client_id, body)
  values (1, '01a10f20-21b7-71a1-8d90-e6f8de20e3c7', 'second try')
  on conflict (account_id, client_id) do nothing
  returning id)
select count(*) as retry_inserted from retry \gset
select lab.prove('a retry with the same client id inserts nothing, and the first row stands',
  :retry_inserted = 0
  and (select count(*) = 1 and min(body) = 'first try' from client_rows));

\echo
\echo '### A client''s UUIDv7 is input, not a clock'
select lab.prove('a UUIDv7 minted on a clock five years fast sorts after every id minted today',
  uuidv7(interval '5 years') > uuidv7()
  and uuid_extract_timestamp(uuidv7(interval '5 years')) > now() + interval '4 years');

-- A week of ids minted in time order, then 20,000 more: on time, or synced late
-- (minted at random moments in that same week).
create table v7_ontime (id uuid primary key);
create table v7_late   (id uuid primary key);
insert into v7_ontime
  select uuidv7(-(interval '7 days') * (1 - g / 100000.0)) from generate_series(1, 100000) g;
insert into v7_late select id from v7_ontime order by id;
insert into v7_ontime select uuidv7() from generate_series(1, 20000);
insert into v7_late   select uuidv7(-(interval '7 days') * random()) from generate_series(1, 20000);
\pset tuples_only off
select 'on time' as ids, (pgstatindex('v7_ontime_pkey')).avg_leaf_density,
       (pgstatindex('v7_ontime_pkey')).leaf_pages
union all
select 'synced late', (pgstatindex('v7_late_pkey')).avg_leaf_density,
       (pgstatindex('v7_late_pkey')).leaf_pages;
\pset tuples_only on
select lab.prove('ids synced a week late split pages mid-index: leaves end up at least 10 points less full',
  (select avg_leaf_density from pgstatindex('v7_late_pkey'))
    < (select avg_leaf_density from pgstatindex('v7_ontime_pkey')) - 10);

create table notes (
  id         uuid primary key,
  account_id bigint not null,
  body       text not null
);
insert into notes values ('01a10f20-21b7-71bf-bbef-258ac7147265', 1, 'account 1''s note');
-- account 2 sends account 1's id, which it saw in a URL
insert into notes values ('01a10f20-21b7-71bf-bbef-258ac7147265', 2, 'written by account 2')
on conflict (id) do update set body = excluded.body;
select lab.prove('on conflict do update with a client-sent id rewrites a row in another account',
  (select account_id = 1 and body = 'written by account 2' from notes));

update notes set body = 'account 1''s note';
with ins as (
  insert into notes values ('01a10f20-21b7-71bf-bbef-258ac7147265', 2, 'written by account 2')
  on conflict (id) do nothing
  returning id)
select count(*) as note_inserted from ins \gset
select lab.prove('on conflict do nothing inserts nothing, and the caller''s account holds no row with that id',
  :note_inserted = 0
  and (select body = 'account 1''s note' from notes)
  and not exists (select 1 from notes
                  where id = '01a10f20-21b7-71bf-bbef-258ac7147265' and account_id = 2));

\echo
\echo '## Keys in multi-tenant schemas'
select lab.prove('user 295 belongs to account 296',
  (select account_id from users where id = 295) = 296);
begin;
select lab.prove('without a composite key, a project in account 1 can name a user in account 296 as owner',
  lab.try($$ insert into projects (account_id, owner_id, name) values (1, 295, 'cross-tenant') $$) = 'ok');
rollback;
alter table users
  add constraint users_account_id_id_key unique (account_id, id);
alter table projects
  add constraint projects_owner_same_account
  foreign key (account_id, owner_id) references users (account_id, id);
select lab.prove('with the composite foreign key, the cross-tenant owner is refused',
  lab.try($$ insert into projects (account_id, owner_id, name) values (1, 295, 'cross-tenant') $$)
    = '23503: insert or update on table "projects" violates foreign key constraint "projects_owner_same_account"');

\echo
\echo '## Never hand out a counter'
\echo '### Five ids give away your total'
\pset tuples_only off
with seen as (
  select id from events where account_id = 42 order by md5(id::text) limit 5
)
select array_agg(id order by id)                         as seen,
       round(max(id) + max(id)::numeric / count(*) - 1) as estimate,
       (select count(*) from events)                     as actual
from seen;
\pset tuples_only on
select lab.prove('five event ids seen by one customer estimate the table''s 2,000,000 rows within 5 percent',
  (with seen as (select id from events where account_id = 42 order by md5(id::text) limit 5)
   select abs(max(id) + max(id)::numeric / count(*) - 1 - 2000000) / 2000000 < 0.05 from seen));
select lab.prove('all 2,084 of account 42''s event ids estimate it within 0.1 percent',
  (select count(*) = 2084
          and abs(max(id) + max(id)::numeric / count(*) - 1 - 2000000) / 2000000 < 0.001
   from events where account_id = 42));

\echo '### Two ids give away your growth'
select lab.prove('the gap between two event ids a week apart is exactly the number of events created that week',
  (select min(id) from events where created_at >= '2026-09-08')
  - (select min(id) from events where created_at >= '2026-09-01')
  = (select count(*) from events where created_at >= '2026-09-01' and created_at < '2026-09-08'));

\echo '### UUIDv7'
select lab.prove('1,000,000 uuidv7() calls in one session strictly increase, though thousands share a millisecond',
  (select bool_and(u > prev) and count(distinct uuid_extract_timestamp(u)) < count(*) / 10
   from (select u, lag(u) over (order by g) as prev
         from (select g, uuidv7() as u from generate_series(1, 1000000) g) s) x
   where prev is not null));

\echo '### ULID'
create table ulid_like (id uuid primary key);
-- 48-bit millisecond time, then 80 random bits: one id per millisecond for 200 seconds
insert into ulid_like
select (lpad(to_hex(1790000000000 + g), 12, '0') || substr(md5(g::text), 1, 20))::uuid
from generate_series(1, 200000) g;
select lab.prove('ULID-shaped ids (ms time + random) stored as uuid pack leaves 90 percent full with no fragmentation, like UUIDv7',
  (select avg_leaf_density between 88 and 92 and leaf_fragmentation < 1
   from pgstatindex('ulid_like_pkey')));

\echo '### KSUID'
select lab.prove('base62 text sorts in byte order only under the C collation: Z before a in C, not in the default',
  ('Z' < 'a' collate "C") and not ('Z' < 'a'));
select lab.prove('KSUID''s 32-bit seconds from its 2014 epoch last about 136 years',
  round((2 ^ 32) / (365.25 * 86400)) = 136
  and to_timestamp(1400000000) = '2014-05-13 16:53:20+00');

\echo '### Snowflake-style ids'
select lab.prove('41 bits of milliseconds cover about 69 years; 12 bits of sequence allow 4,096 ids per ms per machine',
  floor((2 ^ 41) / 1000 / (365.25 * 86400)) = 69 and 2 ^ 12 = 4096 and 2 ^ 10 = 1024);

\echo '### NanoID'
\pset tuples_only off
select chars, chars * 6 as bits,
       to_char(sqrt(2 * 2 ^ (chars * 6) * 1e-9), '9.9EEEE') as ids_for_one_in_a_billion
from unnest(array[8, 12, 16, 21]) as chars;
\pset tuples_only on
select lab.prove('at one-in-a-billion odds, UUIDv4''s 122 random bits allow about 103 trillion ids',
  sqrt(2 * 2 ^ 122 * 1e-9) between 1.02e14 and 1.04e14);
select lab.prove('a 21-character NanoID (126 bits) allows about 4 times as many; a 12-character one about 3 million',
  sqrt(2 * 2 ^ 126 * 1e-9) between 4.0e14 and 4.2e14
  and sqrt(2 * 2 ^ 72 * 1e-9) between 3.0e6 and 3.1e6);

\echo '### Base32 in pure SQL'
create function b32_encode(u uuid) returns text
language sql immutable strict parallel safe as $$
  select string_agg(
           substr('0123456789abcdefghjkmnpqrstvwxyz',
                  substring(b from i * 5 + 1 for 5)::bit(5)::int + 1, 1),
           '' order by i)
  from (select B'00' || ('x' || replace(u::text, '-', ''))::bit(128) as b) s,
       generate_series(0, 25) as i
$$;

create function b32_decode(t text) returns uuid
language sql immutable strict parallel safe as $$
  select case when t ~ '^[0-7][0-9a-hjkmnp-tv-z]{25}$' then
    (select (lpad(to_hex(substring(b from 3 for 64)::bigint), 16, '0')
          || lpad(to_hex(substring(b from 67 for 64)::bigint), 16, '0'))::uuid
     from (select string_agg(
                    (strpos('0123456789abcdefghjkmnpqrstvwxyz',
                            substr(t, i, 1)) - 1)::bit(5)::text,
                    '' order by i)::bit(130) as b
           from generate_series(1, 26) as i) s)
  end
$$;

select lab.prove('b32_encode matches the TypeID spec''s test vectors',
  b32_encode('01890a5d-ac96-774b-bcce-b302099a8057') = '01h455vb4pex5vsknk084sn02q'
  and b32_encode('ffffffff-ffff-ffff-ffff-ffffffffffff') = '7zzzzzzzzzzzzzzzzzzzzzzzzz'
  and b32_encode('00000000-0000-0000-0000-000000000020') = '00000000000000000000000010');
select lab.prove('b32_decode turns the ULID spec''s example into the 128 bits ULID libraries give',
  b32_decode(lower('01ARZ3NDEKTSV4RRFFQ69G5FAV')) = '01563e3a-b5d3-d676-4c61-efb99302bd5b');
select lab.prove('a uuid is 36 characters as text and 26 in base32; prj_ plus base32 is 30',
  length(uuidv7()::text) = 36 and length(b32_encode(uuidv7())) = 26
  and length('prj_' || b32_encode(uuidv7())) = 30);
select lab.prove('50,000 random uuids survive encode then decode unchanged',
  (select bool_and(b32_decode(b32_encode(u)) = u)
   from (select gen_random_uuid() as u from generate_series(1, 50000)) x));
select lab.prove('the encoding preserves sort order: base32 strings compare like the uuids they encode',
  (select bool_and((u < v) = (b32_encode(u) < b32_encode(v)))
   from (select gen_random_uuid() as u, gen_random_uuid() as v
         from generate_series(1, 50000)) x));
select lab.prove('garbage, uppercase, and out-of-range strings decode to null, not an error',
  b32_decode('not-an-id') is null
  and b32_decode('01ARZ3NDEKTSV4RRFFQ69G5FAV') is null
  and b32_decode('8zzzzzzzzzzzzzzzzzzzzzzzzz') is null);

\echo '### Store the uuid, print the prefix'
create table pid_text (
  id         bigint generated always as identity primary key,
  public_id  text not null unique default 'prj_' || b32_encode(uuidv7())
);
create table pid_uuid (
  id         bigint generated always as identity primary key,
  public_id  uuid not null unique default uuidv7()
);
insert into pid_text select from generate_series(1, 200000);
insert into pid_uuid select from generate_series(1, 200000);
\pset tuples_only off
select (select pg_column_size(public_id) from pid_text limit 1)  as text_bytes,
       (select pg_column_size(public_id) from pid_uuid limit 1)  as uuid_bytes,
       pg_size_pretty(pg_relation_size('pid_text_public_id_key')) as text_index,
       pg_size_pretty(pg_relation_size('pid_uuid_public_id_key')) as uuid_index,
       pg_size_pretty(pg_relation_size('pid_text'))               as text_heap,
       pg_size_pretty(pg_relation_size('pid_uuid'))               as uuid_heap;
\pset tuples_only on
select lab.prove('prj_ plus 26 characters takes 31 bytes in the row; the uuid takes 16',
  (select pg_column_size(public_id) from pid_text limit 1) = 31
  and (select pg_column_size(public_id) from pid_uuid limit 1) = 16);
select lab.prove('the text public id index is more than 40 percent bigger than the uuid one',
  pg_relation_size('pid_text_public_id_key') > 1.4 * pg_relation_size('pid_uuid_public_id_key'));
select lab.prove('both indexes still pack leaves about 90 percent full, since both keys arrive in order',
  (select avg_leaf_density between 88 and 92 from pgstatindex('pid_text_public_id_key'))
  and (select avg_leaf_density between 88 and 92 from pgstatindex('pid_uuid_public_id_key')));

\echo '### Moving an API off integer ids'
alter table projects add column public_id uuid;
-- the default first, so rows inserted during the backfill get an id too
alter table projects alter column public_id set default uuidv7();
do $$
declare
  lo bigint := 0;
  hi bigint;
begin
  select max(id) into hi from projects;
  while lo < hi loop
    update projects
    set    public_id = uuidv7(created_at - clock_timestamp())
    where  id > lo and id <= lo + 5000 and public_id is null;
    lo := lo + 5000;
    commit;
  end loop;
end $$;
create unique index concurrently projects_public_id_key on projects (public_id);
alter table projects add constraint projects_public_id_not_null
  check (public_id is not null) not valid;
alter table projects validate constraint projects_public_id_not_null;
alter table projects alter column public_id set not null;
alter table projects drop constraint projects_public_id_not_null;

select lab.prove('after the batched backfill every project has a public id, and they are unique',
  (select count(*) = 20000 and count(distinct public_id) = 20000 from projects));
select lab.prove('each backfilled id embeds its row''s created_at, to within a few milliseconds',
  (select max(abs(extract(epoch from uuid_extract_timestamp(public_id) - created_at))) < 0.05
   from projects));
select 'prj_' || b32_encode(public_id) as pid from projects where id = 4242 \gset
select lab.prove('anyone holding project 4242''s public id can read its creation date',
  (select uuid_extract_timestamp(b32_decode(substr(:'pid', 5)))::date = created_at::date
   from projects where id = 4242));
select lab.prove('looking up a project by its prefixed public id is one index scan of a few pages',
  lab.nodes(format($$ select id, name from projects where public_id = b32_decode(substr(%L, 5)) $$, :'pid'))
    @> array['Index Scan']
  and lab.buffers(format($$ select id, name from projects where public_id = b32_decode(substr(%L, 5)) $$, :'pid')) <= 4);
select lab.prove('and it finds project 4242',
  (select id from projects where public_id = b32_decode(substr(:'pid', 5))) = 4242);
