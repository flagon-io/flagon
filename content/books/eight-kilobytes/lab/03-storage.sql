-- Lab for "Everything is a page"
-- https://www.flagon.io/books/eight-kilobytes/storage
-- Run: ./lab 03-storage
--
-- Every select lab.prove(...) below is a claim from the chapter. The lab
-- creates a few small tables of its own (padded, packed, docs, the fillfactor
-- copies of users) and changes one row of users and one of events.

\pset tuples_only on
\pset format unaligned
create extension if not exists pg_freespacemap;
create extension if not exists pg_visibility;

\echo
\echo '## A table is a file of pages'

select lab.prove(
  'the events file is nothing but 8 KB pages: 288,137,216 bytes is exactly 35,173 pages',
  pg_relation_size('events') = 288137216
  and pg_relation_size('events') % 8192 = 0
  and pg_relation_size('events') / 8192 = 35173);

select lab.prove(
  'pg_relation_filepath names the file as base/<database oid>/<relfilenode>',
  pg_relation_filepath('events') =
    format('base/%s/%s',
           (select oid from pg_database where datname = current_database()),
           pg_relation_filenode('events')));

create table relfile_demo (id int);
select lab.prove(
  'the relfilenode starts out equal to the table''s OID',
  (select relfilenode = oid from pg_class where relname = 'relfile_demo'));
select relfilenode as before_truncate from pg_class where relname = 'relfile_demo' \gset
truncate relfile_demo;
select lab.prove(
  'truncate writes a fresh file under a new relfilenode',
  (select relfilenode <> :before_truncate and relfilenode <> oid
   from pg_class where relname = 'relfile_demo'));

select lab.prove(
  'no file grows past 1 GB: segment_size is 1GB',
  current_setting('segment_size') = '1GB');
select lab.prove(
  'a page is 8 KB, so a 1 GB segment holds pages 0 to 131071',
  current_setting('block_size')::int = 8192
  and (1024 * 1024 * 1024) / current_setting('block_size')::int = 131072);

\echo
\echo '## Forks'

select lab.prove(
  'events has a free space map fork (88 kB) and a visibility map fork (16 kB)',
  pg_relation_size('events', 'fsm') = 90112
  and pg_relation_size('events', 'vm') = 16384);

create unlogged table cache_entries (key text primary key, value jsonb);
select lab.prove(
  'an unlogged table gets an init fork, an empty file named <relfilenode>_init',
  (pg_stat_file(pg_relation_filepath('cache_entries') || '_init')).size = 0
  and pg_relation_size('cache_entries', 'init') = 0);

select lab.prove(
  'pg_relation_size is the main fork; pg_table_size adds the other forks and TOAST; pg_total_relation_size adds the indexes',
  pg_table_size('events') = pg_relation_size('events') + pg_relation_size('events', 'fsm')
                          + pg_relation_size('events', 'vm')
                          + coalesce((select pg_total_relation_size(reltoastrelid)
                                      from pg_class where oid = 'events'::regclass
                                        and reltoastrelid <> 0), 0)
  and pg_total_relation_size('events') = pg_table_size('events') + pg_indexes_size('events'));

\echo
\echo '## The 8 KB page'

select lab.prove(
  'page 0 of events holds 56 rows',
  (select count(*) from heap_page_items(get_raw_page('events', 0))) = 56);

select lab.prove(
  'lower = 24-byte header + 56 line pointers x 4 bytes = 248; upper = 384; 136 bytes free',
  lower = 24 + 4 * 56 and lower = 248 and upper = 384 and upper - lower = 136)
from page_header(get_raw_page('events', 0));

select lab.prove(
  '136 free bytes is too few for another events row (136 to 144 bytes, plus a line pointer)',
  (select upper - lower from page_header(get_raw_page('events', 0)))
    < (select min(lp_len) + 4 from heap_page_items(get_raw_page('events', 0))));

select lab.prove(
  'special is 8192 on a table page: no special space; flags is 4, the all-visible flag',
  special = 8192 and pagesize = 8192 and flags = 4)
from page_header(get_raw_page('events', 0));

select lab.prove(
  'data checksums are on (initdb default since PostgreSQL 18)',
  current_setting('data_checksums') = 'on');

\echo
\echo '### Line pointers and the ctid'

select lab.prove(
  'the first three events live at (0,1), (0,2), (0,3)',
  array(select ctid::text from events where id <= 3 order by id) = '{"(0,1)","(0,2)","(0,3)"}');

select lab.prove(
  'the primary key index stores ctids: its first leaf points id 2 at page 0, slot 2',
  exists (select from bt_page_items('events_pkey', 1)
          where htid = '(0,2)' and data = '02 00 00 00 00 00 00 00'));

select lab.prove(
  'the events primary key has a root, one internal level, and leaves: 3 index pages per lookup',
  (select level from bt_metap('events_pkey')) = 2);

select ctid as old_ctid from users where id = 1 \gset
update users set name = name where id = 1;
select lab.prove(
  'a row''s ctid changes when the row is updated',
  (select ctid from users where id = 1) <> :'old_ctid'::tid);

\echo
\echo '## 8 KB is a compile-time choice, and you should keep it'
select lab.prove('the page size is fixed when Postgres is built: block_size is 8192, and no setting can change it',
  current_setting('block_size') = '8192'
  and (select context from pg_settings where name = 'block_size') = 'internal');
select lab.prove('WAL blocks are a separate compile-time constant, also 8 KB here',
  current_setting('wal_block_size') = '8192'
  and (select context from pg_settings where name = 'wal_block_size') = 'internal');

\echo
\echo '## Inside a tuple'

select lab.prove(
  'tuple 1 sits at offset 8048 and is 144 bytes long, ending exactly at the end of the page',
  lp_off = 8048 and lp_len = 144 and lp_off + lp_len = 8192 and lp_flags = 1)
from heap_page_items(get_raw_page('events', 0)) where lp = 1;

select lab.prove(
  'tuple 2 sits right below it at 7904',
  lp_off = 7904)
from heap_page_items(get_raw_page('events', 0)) where lp = 2;

select lab.prove(
  'every row on page 0 was inserted by one transaction (the seed), and none is deleted (t_xmax = 0)',
  count(distinct t_xmin::text) = 1 and bool_and(t_xmax::text = '0'))
from heap_page_items(get_raw_page('events', 0));

select lab.prove(
  't_infomask2''s low bits hold the column count (7), and t_hoff is 24',
  (t_infomask2 & 2047) = 7 and t_hoff = 24)
from heap_page_items(get_raw_page('events', 0)) where lp = 1;

select lab.prove(
  'pageinspect decodes t_infomask 2306 as HASVARWIDTH, XMIN_COMMITTED, XMAX_INVALID',
  t_infomask = 2306
  and raw_flags = '{HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}')
from heap_page_items(get_raw_page('events', 0)),
     heap_tuple_infomask_flags(t_infomask, t_infomask2)
where lp = 1;

select lab.prove(
  'the first 8 data bytes are id = 1, little-endian',
  substr(t_data, 1, 8) = '\x0100000000000000'::bytea)
from heap_page_items(get_raw_page('events', 0)) where lp = 1;

select lab.prove(
  'the next 8 bytes are account_id: 0x03a9 = 937',
  substr(t_data, 9, 8) = '\xa903000000000000'::bytea
  and (select account_id from events where id = 1) = 937
  and x'03a9'::int = 937)
from heap_page_items(get_raw_page('events', 0)) where lp = 1;

\echo
\echo '### NULLs cost one bit'

select lab.prove(
  'projects rows 1 and 3 (not archived) carry a null bitmap 11110100; row 2 (archived) has none',
  array_agg(coalesce(t_bits, '') order by lp) = '{11110100,"",11110100}')
from heap_page_items(get_raw_page('projects', 0)) where lp <= 3;

select lab.prove(
  'row 2 is archived and 8 bytes longer, because it stores the timestamp',
  (select lp_len from heap_page_items(get_raw_page('projects', 0)) where lp = 2)
    = (select lp_len from heap_page_items(get_raw_page('projects', 0)) where lp = 1) + 8
  and (select archived_at is not null from projects where ctid = '(0,2)')
  and (select archived_at is null from projects where ctid = '(0,1)'));

select lab.prove(
  't_hoff is 24 either way: the bitmap fits in the header''s spare byte',
  bool_and(t_hoff = 24))
from heap_page_items(get_raw_page('projects', 0)) where lp <= 3;

\echo
\echo '## Column order is free space'

select lab.prove(
  'alignment: bool and uuid c, int2 s, int4/text/jsonb/numeric i, int8/timestamptz d',
  string_agg(typname || '=' || typalign::text, ',' order by typname) =
    'bool=c,int2=s,int4=i,int8=d,jsonb=i,numeric=i,text=i,timestamptz=d,uuid=c')
from pg_type
where typname in ('bool', 'int2', 'int4', 'int8', 'timestamptz', 'uuid', 'text', 'jsonb', 'numeric');

create table padded (
  is_active  boolean,
  id         bigint,
  is_admin   boolean,
  created_at timestamptz,
  flags      smallint,
  score      bigint
);

create table packed (
  id         bigint,
  created_at timestamptz,
  score      bigint,
  flags      smallint,
  is_active  boolean,
  is_admin   boolean
);

insert into padded select true, g, false, now(), 1, g from generate_series(1, 1000000) g;
insert into packed select g, now(), g, 1, true, false from generate_series(1, 1000000) g;
vacuum analyze padded, packed;

select lab.prove(
  'a padded row is 72 bytes; the same columns packed take 52',
  (select pg_column_size(p.*) from padded p limit 1) = 72
  and (select pg_column_size(p.*) from packed p limit 1) = 52);

select lab.prove(
  'packed''s 52-byte tuples start 56 bytes apart on the page (8-byte aligned)',
  (select lp_off from heap_page_items(get_raw_page('packed', 0)) where lp = 1)
  - (select lp_off from heap_page_items(get_raw_page('packed', 0)) where lp = 2) = 56);

select lab.prove(
  'page 0 of padded holds 107 tuples, page 0 of packed holds 136',
  (select count(*) from heap_page_items(get_raw_page('padded', 0))) = 107
  and (select count(*) from heap_page_items(get_raw_page('packed', 0))) = 136
  and 8168 / (72 + 4) = 107 and 8168 / (56 + 4) = 136);

select lab.prove(
  '9,346 pages versus 7,353: padded is about 27% bigger',
  pg_relation_size('padded') / 8192 = 9346
  and pg_relation_size('packed') / 8192 = 7353
  and pg_relation_size('padded')::numeric / pg_relation_size('packed') between 1.26 and 1.28);

select lab.prove(
  'events rows are 136 to 144 bytes, about 66 of them JSON',
  min(lp_len) = 136 and max(lp_len) = 144)
from heap_page_items(get_raw_page('events', 0));
select lab.prove(
  'the average payload is about 66 bytes',
  avg(pg_column_size(payload)) between 64 and 68)
from events where id <= 20000;

\echo
\echo '## TOAST: where large values go'

create table toast_edge (body text);
insert into toast_edge values (repeat('a', 2000)), (repeat('a', 2010));
select lab.prove(
  'a 2,028-byte row is stored as is; a 2,038-byte one crosses 2,032 bytes and is compressed',
  (array_agg(lp_len order by lp))[1] = 2028
  and (array_agg(lp_len order by lp))[2] < 100
  and (select array_agg(pg_column_compression(body) is not null order by length(body))
       from toast_edge) = '{f,t}')
from heap_page_items(get_raw_page('toast_edge', 0));

create table docs (
  id   bigint generated always as identity primary key,
  body text
);
select reltoastrelid::regclass as toast_table from pg_class where relname = 'docs' \gset
select lab.prove(
  'a table with a variable-length column gets its own TOAST table in pg_toast',
  :'toast_table' like 'pg_toast.pg_toast_%');

insert into docs (body) values (repeat('a', 1000));
insert into docs (body) values (repeat('a', 3000));
insert into docs (body) values (repeat('a', 100000));
insert into docs (body) select string_agg(md5(random()::text), '') from generate_series(1, 100);
insert into docs (body) select string_agg(md5(random()::text), '') from generate_series(1, 1000);

select lab.prove(
  'row 1 (1,000 characters) is stored as is: 1,000 bytes plus a 4-byte length header',
  pg_column_size(body) = 1004 and pg_column_compression(body) is null)
from docs where id = 1;

select lab.prove(
  'rows 2 and 3 compress in place: 3,000 a''s become 44 bytes, 100,000 become 1,156',
  array_agg(pg_column_size(body) order by id) = '{44,1156}'
  and bool_and(pg_column_compression(body) = 'pglz')
  and bool_and(pg_column_toast_chunk_id(body) is null))
from docs where id in (2, 3);

select lab.prove(
  'random hex doesn''t compress, so rows 4 and 5 move out of line',
  bool_and(pg_column_compression(body) is null)
  and bool_and(pg_column_toast_chunk_id(body) is not null)
  and array_agg(pg_column_size(body) order by id) = '{3200,32000}')
from docs where id in (4, 5);

select lab.prove(
  'on the table page, rows 1 to 5 take 1036, 76, 1188, 50 and 50 bytes',
  array_agg(lp_len order by lp) = '{1036,76,1188,50,50}')
from heap_page_items(get_raw_page('docs', 0));

select lab.prove(
  'a 50-byte row is 24 of header, 8 for id, and an 18-byte TOAST pointer',
  24 + 8 + 18 = 50);

select lab.prove(
  'out-of-line values are cut into chunks of at most 1,996 bytes: 2 chunks for row 4, 17 for row 5',
  (select array_agg(n order by n) from
     (select count(*) as n from :toast_table group by chunk_id) c) = '{2,17}'
  and (select max(length(chunk_data)) from :toast_table) = 1996);

\echo
\echo '### What TOAST means for your queries'

alter table docs add column title text;
select pg_column_toast_chunk_id(body) as chunk_before from docs where id = 5 \gset
update docs set title = 'renamed' where id = 5;
select lab.prove(
  'an update that doesn''t change a toasted value keeps the same TOAST pointer',
  pg_column_toast_chunk_id(body) = :chunk_before)
from docs where id = 5;

update docs set body = body || 'x' where id = 5;
select lab.prove(
  'an update that changes a toasted value stores the whole new value, every chunk',
  pg_column_toast_chunk_id(body) <> :chunk_before
  and (select count(*) from :toast_table t
       where t.chunk_id = pg_column_toast_chunk_id(d.body)) = 17)
from docs d where id = 5;

\echo
\echo '### Storage strategies and compression'

select lab.prove(
  'default strategies: bigint plain, numeric main, text/jsonb/bytea extended',
  string_agg(typname || '=' || typstorage::text, ',' order by typname) =
    'bytea=x,int8=p,jsonb=x,numeric=m,text=x')
from pg_type where typname in ('int8', 'numeric', 'text', 'jsonb', 'bytea');

select lab.prove(
  'the default compression method is pglz',
  current_setting('default_toast_compression') = 'pglz');

alter table docs alter column body set compression lz4;
insert into docs (body) values (repeat('a', 100000));
select lab.prove(
  'the same 100,000 characters take 411 bytes with lz4, against 1,156 with pglz',
  pg_column_compression(body) = 'lz4' and pg_column_size(body) = 411)
from docs where id = 6;

create table ttt_default (a text, b text);
create table ttt_256 (a text, b text) with (toast_tuple_target = 256);
insert into ttt_default values (repeat('a', 1500), null);
insert into ttt_256     values (repeat('a', 1500), null);
select lab.prove(
  'toast_tuple_target = 256 does not touch a 1.5 KB row: toasting still starts at about 2 KB',
  (select pg_column_compression(a) from ttt_256) is null
  and (select pg_column_size(a) from ttt_256) = 1504);

insert into ttt_default
  select string_agg(md5(random()::text), ''), (select string_agg(md5(random()::text), '') from generate_series(1, 40))
  from generate_series(1, 40);
insert into ttt_256
  select string_agg(md5(random()::text), ''), (select string_agg(md5(random()::text), '') from generate_series(1, 40))
  from generate_series(1, 40);
select lab.prove(
  'once a row crosses the threshold, toast_tuple_target = 256 moves both 1,280-byte values out; the default moves one',
  (select (pg_column_toast_chunk_id(a) is not null)::int + (pg_column_toast_chunk_id(b) is not null)::int
   from ttt_default where b is not null) = 1
  and (select (pg_column_toast_chunk_id(a) is not null)::int + (pg_column_toast_chunk_id(b) is not null)::int
       from ttt_256 where b is not null) = 2);

\echo
\echo '## Fillfactor'

create table users_ff85 (like users including all) with (fillfactor = 85);
create table users_ff100 (like users including all);

insert into users_ff100 (account_id, email, name, created_at)
select account_id, email, name, created_at from users;
insert into users_ff85 (account_id, email, name, created_at)
select account_id, email, name, created_at from users;

vacuum analyze users_ff100, users_ff85;

select lab.prove(
  'with fillfactor 85 the same 100,000 users take 1,322 pages instead of 1,126 (about 17% more)',
  (select relpages from pg_class where relname = 'users_ff85') = 1322
  and (select relpages from pg_class where relname = 'users_ff100') = 1126);

select lab.prove(
  'each fillfactor 85 page keeps about 1.2 KB free',
  upper - lower between 1200 and 1300)
from page_header(get_raw_page('users_ff85', 0));

select lab.prove(
  'tables default to fillfactor 100: no reloption is set on users',
  (select reloptions from pg_class where relname = 'users') is null);

\echo
\echo '## The free space map'

select lab.prove(
  'the FSM stores one byte per page in 32-byte steps: events page 0 (136 free) is recorded as 128',
  avail = 128 and avail % 32 = 0)
from pg_freespace('events') where blkno = 0;

select lab.prove(
  'pages 1 and 2 show 0; every page but the last has less room than one more row needs',
  (select array_agg(avail order by blkno) from pg_freespace('events') where blkno in (1, 2)) = '{0,0}'
  and (select max(avail) from pg_freespace('events')
       where blkno < pg_relation_size('events') / 8192 - 1) < 148);

select lab.prove(
  'the fillfactor 85 table shows 1,248 bytes available on its first pages',
  bool_and(avail = 1248))
from pg_freespace('users_ff85') where blkno between 0 and 2;

\echo
\echo '## The visibility map'

select lab.prove(
  'every page of events is all-visible and none is frozen yet',
  all_visible = 35173 and all_frozen = 0)
from pg_visibility_map_summary('events');

select lab.prove(
  '35,173 pages at two bits each is about 9 KB, which takes two 8 KB visibility map pages',
  ceil(35173 * 2 / 8.0) between 8700 and 8900
  and pg_relation_size('events', 'vm') = 2 * 8192);

update accounts set name = name where id = 1;
select lab.prove(
  'any change to a page clears its all-visible bit',
  (select all_visible from pg_visibility_map('accounts', 0)) = false
  and (select flags & 4 from page_header(get_raw_page('accounts', 0))) = 0);

vacuum accounts;
select lab.prove(
  'vacuum sets it again once every transaction can see the change',
  (select all_visible from pg_visibility_map('accounts', 0)) = true
  and (select flags & 4 from page_header(get_raw_page('accounts', 0))) = 4);

\echo
\echo '## Count pages before you create the table'

select lab.prove(
  'events rows average about 139 bytes, so about 57 fit on a page, and the estimate lands within 1% of the real 35,173 pages',
  avg(lp_len) between 138 and 141
  and abs(2000000 / (8168 / (avg(lp_len) + 4)) - 35173) < 352)
from heap_page_items(get_raw_page('events', 10000));
