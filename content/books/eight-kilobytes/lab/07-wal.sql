-- Lab for "Write it down first"
-- https://www.flagon.io/books/eight-kilobytes/wal
-- Run: ./lab 07-wal
--
-- Every WAL number here comes from EXPLAIN (ANALYZE, WAL) or pg_walinspect
-- filtered to our own transaction, so other sessions on the server can't skew
-- it. A few checks run CHECKPOINT, which is server-wide but harmless.
\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;
create extension if not exists pg_walinspect;

-- wal_demo: a 200,000-row copy of events with a primary key. Autovacuum is
-- off for it so nothing but this script touches its pages.
create table wal_demo with (autovacuum_enabled = off) as
  select * from events where id <= 200000;
alter table wal_demo add primary key (id);
vacuum analyze wal_demo;

\echo
\echo == What a WAL record looks like
select pg_current_wal_lsn() as before_lsn \gset
begin;
update wal_demo set kind = 'build' where id = 200000;
select pg_current_xact_id() as xid \gset
commit;
select pg_current_wal_lsn() as after_lsn \gset

create temp table my_records as
  select resource_manager, record_type, record_length, fpi_length
  from pg_get_wal_records_info(:'before_lsn', :'after_lsn')
  where xid = :'xid';

select format('%s %s: %s bytes (%s of them a page image)', resource_manager, record_type,
              record_length, fpi_length) from my_records;
select lab.prove(
  'the whole row change is one small HOT_UPDATE record (a couple of hundred bytes at most)',
  exists (select 1 from my_records
          where record_type = 'HOT_UPDATE' and record_length - fpi_length < 200));
select lab.prove(
  'the COMMIT record is 34 bytes',
  exists (select 1 from my_records where record_type = 'COMMIT' and record_length = 34));

\echo
\echo == LSNs are byte offsets
select lab.prove(
  'WAL is cut into 16 MB segment files',
  current_setting('wal_segment_size') = '16MB');
select lab.prove(
  'the segment name is timeline, high 32 bits of the LSN, then the LSN''s low bits divided by 16 MB',
  pg_walfile_name(lsn) =
    '00000001'
    || lpad(upper(to_hex((lsn - '0/0'::pg_lsn)::bigint >> 32)), 8, '0')
    || lpad(upper(to_hex(((lsn - '0/0'::pg_lsn)::bigint & x'FFFFFFFF'::bigint) >> 24)), 8, '0'))
from (select pg_current_wal_lsn() as lsn) l;
select lab.prove(
  'subtracting two LSNs gives bytes',
  pg_wal_lsn_diff('0/2000', '0/1000') = 4096);

\echo
\echo == Measuring the WAL a statement writes
create temp table insert_wal as
select (p -> 'Plan' ->> 'WAL Records')::bigint as records,
       (p -> 'Plan' ->> 'WAL Bytes')::bigint as bytes
from lab.plan($$
  insert into wal_demo (id, account_id, project_id, user_id, kind, payload, created_at)
  select 3000000 + g, 1, 1, 1, 'login', '{"status":"ok"}', now()
  from generate_series(1, 10000) g $$) as p;

select format('insert of 10,000 rows: %s records, %s bytes', records, bytes) from insert_wal;
select lab.prove(
  '10,000 inserted rows write about 20,000 WAL records: one heap and one primary-key insert per row',
  records between 20000 and 20100) from insert_wal;
select lab.prove(
  'about 1.8 MB of WAL, roughly 190 bytes per row',
  bytes between 1800000 and 2100000) from insert_wal;

select pg_current_wal_lsn() as before_lsn \gset
insert into wal_demo (id, account_id, project_id, user_id, kind, payload, created_at)
select 4000000 + g, 1, 1, 1, 'login', '{"status":"ok"}', now()
from generate_series(1, 10000) g;
select format('LSN diff around the same insert: %s', pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), :'before_lsn')));
select lab.prove(
  'an LSN diff around the same insert is at least the statement''s own WAL (it also counts everyone else)',
  pg_wal_lsn_diff(pg_current_wal_lsn(), :'before_lsn') >= (select bytes from insert_wal))
from insert_wal;

\echo
\echo == Checkpoints put a limit on recovery
select lab.prove(
  'the redo point is at or before the checkpoint record',
  redo_lsn <= checkpoint_lsn) from pg_control_checkpoint();
select lab.prove(
  'checkpoint_timeout defaults to 5 minutes and max_wal_size to 1 GB',
  current_setting('checkpoint_timeout') = '5min' and current_setting('max_wal_size') = '1GB');
select lab.prove(
  'checkpoint_completion_target defaults to 0.9, checkpoint_warning to 30s, log_checkpoints on',
  current_setting('checkpoint_completion_target') = '0.9'
  and current_setting('checkpoint_warning') = '30s'
  and current_setting('log_checkpoints') = 'on');
select lab.prove(
  'pg_stat_checkpointer counts timed and requested checkpoints separately',
  count(*) = 3)
from information_schema.columns
where table_name = 'pg_stat_checkpointer'
  and column_name in ('num_timed', 'num_requested', 'num_done');

\echo
\echo == Full-page writes: why WAL spikes after a checkpoint
-- Same update twice, each in its own transaction as in the chapter: right
-- after a checkpoint, then again. If some other checkpoint lands between the
-- two runs, try again.
create temp table fpi_test (attempt int, first_fpi bigint, first_bytes bigint,
                            second_fpi bigint, second_bytes bigint);
do $$
declare
  p1 jsonb; p2 jsonb; redo_before pg_lsn;
begin
  for attempt in 1..5 loop
    checkpoint;
    select redo_lsn into redo_before from pg_control_checkpoint();
    p1 := lab.plan($q$ update wal_demo set kind = 'build' where id % 200 = 0 $q$);
    commit;
    p2 := lab.plan($q$ update wal_demo set kind = 'deploy' where id % 200 = 0 $q$);
    commit;
    if (select redo_lsn from pg_control_checkpoint()) = redo_before then
      insert into fpi_test values (attempt,
        (p1 -> 'Plan' ->> 'WAL FPI')::bigint, (p1 -> 'Plan' ->> 'WAL Bytes')::bigint,
        (p2 -> 'Plan' ->> 'WAL FPI')::bigint, (p2 -> 'Plan' ->> 'WAL Bytes')::bigint);
      exit;
    end if;
  end loop;
end $$;

select format('wal_demo: %s pages', pg_relation_size('wal_demo') / 8192);
select format('after a checkpoint: %s fpi, %s bytes; again: %s fpi, %s bytes (%sx less)',
              first_fpi, first_bytes, second_fpi, second_bytes, round(first_bytes::numeric / second_bytes))
from fpi_test;
select lab.prove(
  'right after a checkpoint, updating 1,100 scattered rows writes over 1,000 full-page images',
  first_fpi > 1000) from fpi_test;
select lab.prove(
  'that is several MB of WAL, almost all of it page images',
  first_bytes > 5000000) from fpi_test;
select lab.prove(
  'the same update again, with the pages already imaged, writes almost no page images',
  second_fpi < 50) from fpi_test;
select lab.prove(
  'the second run writes over 10 times less WAL for identical work',
  first_bytes > 10 * second_bytes) from fpi_test;
select lab.prove(
  'full_page_writes is on by default',
  current_setting('full_page_writes') = 'on');

\echo
\echo == Hint bits and checksums
select lab.prove(
  'data checksums are on (the initdb default in PostgreSQL 18)',
  current_setting('data_checksums') = 'on');

create table hint_demo (id int, v text) with (autovacuum_enabled = off);
insert into hint_demo select g, md5(g::text) from generate_series(1, 200000) g;
checkpoint;
create temp table read_wal as
select (p -> 'Plan' ->> 'WAL FPI')::bigint as fpi,
       (p -> 'Plan' ->> 'WAL Bytes')::bigint as bytes
from lab.plan($$ select count(*) from hint_demo $$) as p;
select format('first SELECT: %s fpi, %s bytes; hint_demo has %s pages', fpi, bytes,
              pg_relation_size('hint_demo') / 8192) from read_wal;
select lab.prove(
  'the first plain SELECT of a freshly loaded table after a checkpoint writes a page image per page',
  fpi >= 0.9 * (select relpages from pg_class where relname = 'hint_demo')) from read_wal;
select lab.prove(
  'a read-only query generated megabytes of WAL',
  bytes > 5000000) from read_wal;
select lab.prove(
  'the second SELECT writes no WAL',
  lab.wal_bytes($$ select count(*) from hint_demo $$) = 0);

\echo
\echo == wal_compression is a free win
select lab.prove(
  'wal_compression is off by default',
  current_setting('wal_compression') = 'off');

create temp table compression_test (setting text, fpi bigint, bytes bigint);
do $$
declare
  s text; p jsonb; redo_before pg_lsn;
begin
  -- A warm-up run first, so every measured run starts from the same layout.
  foreach s in array array['warmup', 'off', 'lz4', 'zstd'] loop
    for attempt in 1..5 loop
      execute format('set local wal_compression = %L',
                     case s when 'warmup' then 'off' else s end);
      checkpoint;
      select redo_lsn into redo_before from pg_control_checkpoint();
      p := lab.plan($q$ update wal_demo set kind = 'build' where id % 200 = 0 $q$);
      if (select redo_lsn from pg_control_checkpoint()) = redo_before then
        insert into compression_test values (s,
          (p -> 'Plan' ->> 'WAL FPI')::bigint, (p -> 'Plan' ->> 'WAL Bytes')::bigint);
        exit;
      end if;
    end loop;
  end loop;
end $$;
delete from compression_test where setting = 'warmup';
select format('%s: %s fpi, %s bytes, %s%% of off', setting, fpi, bytes,
              round(100.0 * bytes / (select bytes from compression_test where setting = 'off')))
from compression_test order by bytes desc;

select lab.prove(
  'compression writes about the same number of page images',
  max(fpi) < 1.2 * min(fpi)) from compression_test;
select lab.prove(
  'lz4 cuts image-heavy WAL by over a third (under 67% of off)',
  (select bytes from compression_test where setting = 'lz4')
    < 0.67 * (select bytes from compression_test where setting = 'off'));
select lab.prove(
  'zstd cuts it by more than half',
  (select bytes from compression_test where setting = 'zstd')
    < 0.5 * (select bytes from compression_test where setting = 'off'));
select lab.prove(
  'zstd squeezes harder than lz4',
  (select bytes from compression_test where setting = 'zstd')
    < (select bytes from compression_test where setting = 'lz4'));

\echo
\echo == Commit means flush
select lab.prove(
  'synchronous_commit defaults to on, wal_writer_delay to 200ms, commit_delay to 0',
  current_setting('synchronous_commit') = 'on'
  and current_setting('wal_writer_delay') = '200ms'
  and current_setting('commit_delay') = '0');

-- 200 single-row transactions, counting this backend's own WAL fsyncs
-- (pg_stat_get_backend_io is PostgreSQL 18+).
create table commit_demo (id int);
select pg_stat_force_next_flush() \g /dev/null
select sum(fsyncs) as f0 from pg_stat_get_backend_io(pg_backend_pid()) where object = 'wal' \gset
do $$ begin
  for i in 1..200 loop insert into commit_demo values (i); commit; end loop;
end $$;
select pg_stat_force_next_flush() \g /dev/null
select sum(fsyncs) as f1 from pg_stat_get_backend_io(pg_backend_pid()) where object = 'wal' \gset
set synchronous_commit = off;
do $$ begin
  for i in 1..200 loop insert into commit_demo values (i); commit; end loop;
end $$;
reset synchronous_commit;
select pg_stat_force_next_flush() \g /dev/null
select sum(fsyncs) as f2 from pg_stat_get_backend_io(pg_backend_pid()) where object = 'wal' \gset

select format('WAL fsyncs for 200 commits: %s with synchronous_commit on, %s with it off', :f1 - :f0, :f2 - :f1);
select lab.prove(
  'with synchronous_commit = on, 200 commits make this session flush WAL over 100 times (once per commit when the server is quiet)',
  :f1 - :f0 >= 100);
select lab.prove(
  'with synchronous_commit = off, the same 200 commits wait for no flush at all',
  :f2 - :f1 <= 10);

do $$ begin
  set local synchronous_commit = off;
  perform lab.prove('synchronous_commit can be set per transaction',
                    current_setting('synchronous_commit') = 'off');
end $$;
select lab.prove(
  'and it reverts when the transaction ends',
  current_setting('synchronous_commit') = 'on');

\echo
\echo == WAL is the basis of everything else
select lab.prove(
  'wal_level defaults to replica',
  current_setting('wal_level') = 'replica');
select lab.prove(
  'the replication slot query runs (an empty result means no slots)',
  count(*) >= 0)
from (select slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as retained
      from pg_replication_slots) s;

\echo
\echo == Writing less WAL
create index wal_demo_created_at_idx on wal_demo (created_at);
select lab.prove(
  'each extra index adds a WAL record per inserted row (about 30,000 records with two indexes)',
  records between 30000 and 30200)
from (select (lab.plan($$
        insert into wal_demo (id, account_id, project_id, user_id, kind, payload, created_at)
        select 5000000 + g, 1, 1, 1, 'login', '{"status":"ok"}', now()
        from generate_series(1, 10000) g $$) -> 'Plan' ->> 'WAL Records')::bigint as records) r;
drop index wal_demo_created_at_idx;

select lab.prove(
  'updating rows to the values they already have still writes WAL',
  lab.wal_bytes($$ update wal_demo set kind = kind where id <= 1000 $$) > 50000);

create unlogged table wal_cache (like wal_demo);
select lab.prove(
  'an unlogged table writes almost no WAL: the same 10,000 rows, under 1% of the logged bytes',
  lab.wal_bytes($$
    insert into wal_cache (id, account_id, project_id, user_id, kind, payload, created_at)
    select g, 1, 1, 1, 'login', '{"status":"ok"}', now()
    from generate_series(1, 10000) g $$)
  < 0.01 * (select bytes from insert_wal));
