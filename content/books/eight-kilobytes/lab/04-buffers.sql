-- Lab for "The buffer cache decides what stays"
-- https://www.flagon.io/books/eight-kilobytes/buffers
-- Run: ./lab 04-buffers
--
-- shared_buffers is shared by every database on the server, so what other
-- sessions do can evict pages this lab just read. The checks are built to
-- survive that: each one evicts its table first, looks right after the
-- operation, and uses limits ("at most", "at least") rather than exact
-- counts where another session could interfere. Which buffer ring an
-- operation used is read from this backend's own I/O counters
-- (pg_stat_get_backend_io, PostgreSQL 18), which nobody else can disturb.
-- The clock-sweep section empties the whole cache first and expects nobody
-- else to be filling it at that moment, so run this lab on a quiet kit.
-- Timings are not checked.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 0;

create extension if not exists pg_prewarm;
create extension if not exists dblink;

-- Buffers that hold pages of one relation's main fork, in this database.
create view cached as
select c.relname, b.bufferid, b.relblocknumber, b.usagecount, b.isdirty, b.pinning_backends
from pg_buffercache b
join pg_class c
  on b.relfilenode = pg_relation_filenode(c.oid)
 and b.reldatabase = (select oid from pg_database where datname = current_database())
 and b.relforknumber = 0;

-- This backend's I/O counters for one context (normal, bulkread, bulkwrite,
-- vacuum). Run `select pg_stat_force_next_flush()` as its own statement
-- first, so the counters include the statement before it.
create function pg_temp.io(ctx text) returns jsonb
language sql as $$
  select to_jsonb(s) from pg_stat_get_backend_io(pg_backend_pid()) s
  where object = 'relation' and context = ctx
$$;

\echo
\echo '## shared_buffers is an array of pages'

select lab.prove(
  'shared_buffers is 128 MB: 16,384 buffers of 8 KB',
  current_setting('shared_buffers') = '128MB'
  and (select setting::int from pg_settings where name = 'shared_buffers') = 16384
  and current_setting('block_size') = '8192');

select lab.prove(
  'the buffer pool is one 128 MB block of shared memory (plus 4 KB of alignment)',
  (select size from pg_shmem_allocations where name = 'Buffer Blocks') = 16384 * 8192 + 4096);

select lab.prove(
  'each buffer has a 64-byte descriptor: 16,384 of them take exactly 1 MB',
  (select size from pg_shmem_allocations where name = 'Buffer Descriptors') = 16384 * 64);

select lab.prove(
  'pg_buffercache shows one row per buffer',
  (select count(*) from pg_buffercache) = 16384);

select lab.prove(
  'all of shared memory (152 MB) is more than shared_buffers alone',
  pg_size_bytes(current_setting('shared_memory_size')) > pg_size_bytes(current_setting('shared_buffers')));

\echo
\echo '## Finding a page'

select lab.prove(
  'the buffer mapping table, buffer content locks, and pins all have wait events of their own',
  (select count(*) from pg_wait_events
   where (type, name) in (('LWLock', 'BufferMapping'), ('LWLock', 'BufferContent'),
                          ('BufferPin', 'BufferPin'), ('IPC', 'BufferIo'))) = 4);

\echo
\echo '## Pins: in use, not evictable'

select * from pg_buffercache_evict_relation('accounts') \g /dev/null

begin;
declare c cursor for select * from accounts;
fetch 1 from c \g /dev/null

select count(*) as pinned from cached where relname = 'accounts' and pinning_backends > 0 \gset
select bufferid as pinned_buf from cached
where relname = 'accounts' and relblocknumber = 0 and pinning_backends > 0 \gset

select lab.prove(
  'an open cursor holds a pin on the page it is reading (and PostgreSQL 18 pins a few pages ahead)',
  :pinned between 1 and 9);

select lab.prove(
  'a pinned buffer cannot be evicted',
  not (select buffer_evicted from pg_buffercache_evict(:pinned_buf)));
commit;

select lab.prove(
  'once the cursor closes, the pins are gone and the same buffer can be evicted',
  (select count(*) from cached where relname = 'accounts' and pinning_backends > 0) = 0
  and (select buffer_evicted from pg_buffercache_evict(:pinned_buf)));

\echo
\echo '## Usage counts climb with every read'

select * from pg_buffercache_evict_relation('accounts') \g /dev/null

select lab.prove(
  'accounts is 9 pages, and after eviction none of them is cached',
  pg_relation_size('accounts') / 8192 = 9
  and (select count(*) from cached where relname = 'accounts') = 0);

select count(*) from accounts \g /dev/null
select lab.prove(
  'one scan: all 9 pages cached, each with usage count 1',
  (select count(*) from cached where relname = 'accounts' and usagecount = 1) = 9);

select count(*) from accounts \g /dev/null
select lab.prove(
  'a second scan: usage count 2',
  (select count(*) from cached where relname = 'accounts' and usagecount = 2) = 9);

select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select lab.prove(
  'five scans: usage count 5, the maximum',
  (select count(*) from cached where relname = 'accounts' and usagecount = 5) = 9);

select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select lab.prove(
  'eight scans: still 5; the counter stops there',
  (select max(usagecount) from cached where relname = 'accounts') = 5);

\echo
\echo '## The clock sweep'

-- Flood the cache. Where the clock hand stops depends on what the cache held
-- before, so start from a known state: evict every unpinned buffer in the
-- server (pg_buffercache_evict_all, PostgreSQL 18; fine on the lab kit, never
-- on a server you care about), read accounts five times so its pages sit at usage
-- count 5, then read the first 20,000 pages of events with pg_prewarm, which
-- uses no ring. The first ~16,000 fill the empty buffers as the hand makes its
-- first pass; the hand's next pass takes pages to 0, and the rest of the
-- flood evicts pages it finds at 0. Which of the flood's older pages go
-- depends on where the hand stood, so the checks look only at the newest
-- pages (all still cached) and at the hot accounts pages.
select * from pg_buffercache_evict_all() \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from accounts \g /dev/null
select pg_prewarm('events', 'buffer', 'main', 0, 19999) as prewarmed \gset

select format('after the flood: accounts pages cached %s, usage counts %s to %s; events pages cached %s of 20000 (%s of the first 2,000, %s of the last 2,000)',
  (select count(*) from cached where relname = 'accounts'),
  (select min(usagecount) from cached where relname = 'accounts'),
  (select max(usagecount) from cached where relname = 'accounts'),
  (select count(*) from cached where relname = 'events'),
  (select count(*) from cached where relname = 'events' and relblocknumber < 2000),
  (select count(*) from cached where relname = 'events' and relblocknumber >= 18000));

select lab.prove(
  'pg_prewarm read 20,000 pages of events, but not all of them could stay: the cache holds 16,384',
  :prewarmed = 20000
  and (select count(*) from cached where relname = 'events') < 16384);

select lab.prove(
  'the flood evicted thousands of its own pages; its newest 2,000 are all still cached',
  (select count(*) from cached where relname = 'events') < 20000 - 3000
  and (select count(*) from cached where relname = 'events' and relblocknumber >= 18000) = 2000);

select lab.prove(
  'every events page still cached was read once: usage count 0 or 1',
  (select max(usagecount) from cached where relname = 'events') <= 1);

select lab.prove(
  'the 9 accounts pages at usage count 5 survived the flood, losing a point per pass',
  (select count(*) from cached where relname = 'accounts') = 9
  and (select max(usagecount) from cached where relname = 'accounts') < 5);

select lab.prove(
  'pg_buffercache_usage_counts (PostgreSQL 16+) summarizes every buffer by usage count, 0 to 5',
  (select sum(buffers) from pg_buffercache_usage_counts()) = 16384
  and (select max(usage_count) from pg_buffercache_usage_counts()) <= 5);

select lab.prove(
  'pg_buffercache_summary (PostgreSQL 16+) gives used, unused, dirty and pinned in one row',
  (select buffers_used + buffers_unused from pg_buffercache_summary()) = 16384);

\echo
\echo '## Dirty buffers and who writes them'

select * from pg_buffercache_evict_relation('accounts') \g /dev/null
update accounts set name = name where id <= 50;

select lab.prove(
  'an update dirties the pages it changes in memory; nothing is written to the table file yet',
  (select count(*) from cached where relname = 'accounts' and isdirty) >= 1);

select bufferid as dirty_buf from cached where relname = 'accounts' and isdirty limit 1 \gset
select lab.prove(
  'to reuse a dirty buffer, the evicting process must write the page out first',
  (select buffer_evicted and buffer_flushed from pg_buffercache_evict(:dirty_buf)));

\echo
\echo '## Big operations get a ring'

select lab.prove(
  'events (35,173 pages) is bigger than a quarter of shared_buffers (4,096 pages); users (1,126) is not',
  pg_relation_size('events') / 8192 > 16384 / 4
  and pg_relation_size('users') / 8192 = 1126);

select lab.prove(
  'PostgreSQL 18 bulk-read ring: 256 KB plus room for in-flight reads, 2,304 KB (288 buffers) at the defaults',
  256 + 8 * (pg_size_bytes(current_setting('io_combine_limit')) / 8192)
          * current_setting('effective_io_concurrency')::int = 2304);

-- A sequential scan of events.
select * from pg_buffercache_evict_relation('events') \g /dev/null
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkread') as br0 \gset
select count(kind) from events \g /dev/null
select count(*) as events_cached from cached where relname = 'events' \gset
select max(usagecount) as events_max_usage from cached where relname = 'events' \gset
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkread') as br1 \gset

select format('after a full scan of events: %s of its 35,173 pages are in shared_buffers', :events_cached);

select lab.prove(
  'a full scan of events leaves at most one ring (288 buffers) of it in shared_buffers',
  :events_cached <= 288);

select lab.prove(
  'the scan went through the bulkread ring: tens of thousands of buffer reuses',
  (:'br1'::jsonb ->> 'reuses')::bigint - (:'br0'::jsonb ->> 'reuses')::bigint > 30000);

select lab.prove(
  'pages read through a ring never get a usage count above 1',
  :events_max_usage <= 1);

-- users is under the threshold, so a scan of it uses the normal clock sweep.
select * from pg_buffercache_evict_relation('users') \g /dev/null
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkread') as ub0 \gset
select count(email) from users \g /dev/null
select count(*) as users_cached from cached where relname = 'users' \gset
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkread') as ub1 \gset

select lab.prove(
  'a scan of users (under the threshold) uses no ring and caches the whole table',
  (:'ub1'::jsonb ->> 'reads')::bigint = (:'ub0'::jsonb ->> 'reads')::bigint
  and :users_cached >= 1100);

-- VACUUM gets its own ring, sized by vacuum_buffer_usage_limit (PostgreSQL 16+).
select lab.prove(
  'vacuum_buffer_usage_limit defaults to 2 MB (256 buffers)',
  current_setting('vacuum_buffer_usage_limit') = '2MB');

select * from pg_buffercache_evict_relation('events') \g /dev/null
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('vacuum') as v0 \gset
vacuum (disable_page_skipping) events;
select count(*) as vac_cached from cached where relname = 'events' \gset
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('vacuum') as v1 \gset

select format('after VACUUM read all of events: %s of its pages are in shared_buffers', :vac_cached);
select lab.prove(
  'VACUUM reading all 35,173 pages of events leaves about one 2 MB ring of them behind',
  :vac_cached <= 300
  and (:'v1'::jsonb ->> 'reuses')::bigint - (:'v0'::jsonb ->> 'reuses')::bigint > 30000);

-- Bulk writes: COPY and CREATE TABLE AS use a 16 MB ring; INSERT ... SELECT does not.
create table copied (n bigint);
create table inserted (n bigint);

select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkwrite') as bw0 \gset
select pg_temp.io('normal') as nw0 \gset
copy copied from program 'seq 1 2000000';
select count(*) as copy_cached from cached where relname = 'copied' \gset
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkwrite') as bw1 \gset
select pg_temp.io('normal') as nw1 \gset

select pg_relation_size('copied') / 8192 as copy_pages \gset
select format('COPY of 2,000,000 rows: %s pages written, %s of them still in shared_buffers', :copy_pages, :copy_cached);

select lab.prove(
  'COPY writes through the bulkwrite ring: it extended the table there and wrote its own dirty pages',
  (:'bw1'::jsonb ->> 'extends')::bigint - (:'bw0'::jsonb ->> 'extends')::bigint > 0
  and (:'bw1'::jsonb ->> 'writes')::bigint - (:'bw0'::jsonb ->> 'writes')::bigint > 1000);

select lab.prove(
  'COPY leaves at most its 16 MB ring (2,048 buffers) of its pages in the cache',
  :copy_pages between 8850 and 8850 + 64 and :copy_cached <= 2048 + 64);

select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkwrite') as bw2 \gset
select pg_temp.io('normal') as nw2 \gset
insert into inserted select generate_series(1, 2000000);
select count(*) as insert_cached from cached where relname = 'inserted' \gset
select pg_stat_force_next_flush() \g /dev/null
select pg_temp.io('bulkwrite') as bw3 \gset
select pg_temp.io('normal') as nw3 \gset

select format('INSERT ... SELECT of the same rows: %s of its pages in shared_buffers on this run', :insert_cached);

select lab.prove(
  'INSERT ... SELECT gets no ring: it extends the table through the normal buffer pool',
  (:'bw3'::jsonb ->> 'extends')::bigint = (:'bw2'::jsonb ->> 'extends')::bigint
  and (:'nw3'::jsonb ->> 'extends')::bigint - (:'nw2'::jsonb ->> 'extends')::bigint > 0);

\echo
\echo '## Temporary tables use local buffers'

select lab.prove(
  'temp_buffers defaults to 8 MB (1,024 buffers) per session',
  current_setting('temp_buffers') = '8MB');

create temp table recent as select * from events where id <= 100000;

select lab.prove(
  'a temp table of 100,000 events is 1,792 pages (14 MB), bigger than temp_buffers',
  pg_relation_size('recent') / 8192 = 1792);

select lab.plan($$ select count(kind) from recent $$) as tp \gset
select lab.prove(
  'every scan of it reads all 1,792 pages again: local buffers are per session and too small',
  (:'tp'::jsonb -> 'Plan' ->> 'Local Read Blocks')::int = 1792
  and coalesce((:'tp'::jsonb -> 'Plan' ->> 'Shared Hit Blocks')::int, 0)
    + coalesce((:'tp'::jsonb -> 'Plan' ->> 'Shared Read Blocks')::int, 0) = 0);

select lab.prove(
  'temp table pages never appear in shared_buffers',
  not exists (select 1 from pg_buffercache where relfilenode = pg_relation_filenode('recent')));

create function pg_temp.try_set_temp_buffers() returns text
language plpgsql as $$
begin
  set temp_buffers = '64MB';
  return 'no error';
exception when invalid_parameter_value then
  return sqlerrm;
end $$;

select lab.prove(
  'temp_buffers cannot be changed once the session has used a temp table',
  pg_temp.try_set_temp_buffers() like 'invalid value for parameter "temp_buffers"%');

select dblink_connect('t', 'dbname=' || current_database()) \g /dev/null
select dblink_exec('t', 'set max_parallel_workers_per_gather = 0') \g /dev/null
select dblink_exec('t', 'set temp_buffers = ''32MB''') \g /dev/null
select dblink_exec('t', 'create temp table recent as select * from events where id <= 100000') \g /dev/null
select dblink_exec('t', $q$ create function pg_temp.lp(q text) returns jsonb language plpgsql as $f$
  declare r jsonb; begin execute 'explain (analyze, buffers, format json) ' || q into r; return r -> 0 -> 'Plan'; end $f$ $q$) \g /dev/null
select * from dblink('t', $q$ select pg_temp.lp('select count(kind) from recent')::text $q$) as t(p text) \gset t_
select dblink_disconnect('t') \g /dev/null

select lab.prove(
  'with temp_buffers = 32MB set first, the same table is read entirely from local buffers',
  (:'t_p'::jsonb ->> 'Local Hit Blocks')::int = 1792
  and coalesce((:'t_p'::jsonb ->> 'Local Read Blocks')::int, 0) = 0);

\echo
\echo '## Warming the cache: pg_prewarm'

select * from pg_buffercache_evict_relation('users') \g /dev/null
select lab.prove(
  'after eviction, none of users is cached',
  (select count(*) from cached where relname = 'users') = 0);

select pg_prewarm('users') as users_prewarmed \gset
select lab.prove(
  'pg_prewarm(''users'') loads all 1,126 pages and says so',
  :users_prewarmed = 1126
  and (select count(*) from cached where relname = 'users') >= 1100);

select lab.prove(
  'after prewarming, a full scan of users is all hits',
  (lab.plan($$ select count(email) from users $$) -> 'Plan' ->> 'Shared Read Blocks')::int = 0);

select lab.prove(
  'prewarmed pages start at usage count 1, like any other page read once',
  (select max(usagecount) from cached where relname = 'users') <= 2);

select lab.prove(
  'it works on indexes too: users_pkey is 276 pages',
  pg_prewarm('users_pkey') = 276);

select lab.prove(
  'the read and prefetch modes load the OS page cache only, not shared_buffers',
  pg_prewarm('accounts', 'read') = 9
  and pg_prewarm('accounts', 'prefetch') = 9);

\echo
\echo '## effective_cache_size is a hint'

select lab.prove(
  'effective_cache_size defaults to 4 GB, more than the whole 152 MB of shared memory',
  current_setting('effective_cache_size') = '4GB');

set effective_cache_size = '1MB';
select lab.nodes($$ select * from users order by account_id, email limit 30000 $$) as small_ecs \gset
reset effective_cache_size;
select lab.nodes($$ select * from users order by account_id, email limit 30000 $$) as big_ecs \gset

select lab.prove(
  'same query, same data: at 1 MB the planner sorts a seq scan; at 4 GB it walks the index',
  'Sort' = any(:'small_ecs'::text[]) and 'Seq Scan' = any(:'small_ecs'::text[])
  and 'Index Scan' = any(:'big_ecs'::text[]) and not ('Sort' = any(:'big_ecs'::text[])));

select lab.prove(
  'any session can set it: it is a planner input, not an allocation',
  (select context from pg_settings where name = 'effective_cache_size') = 'user'
  and (select context from pg_settings where name = 'shared_buffers') = 'postmaster');

\echo
\echo '## Huge pages'

select lab.prove(
  'shared_memory_size_in_huge_pages (PostgreSQL 15+) says how many 2 MB pages to reserve',
  current_setting('shared_memory_size_in_huge_pages')::int
    = ceil(pg_size_bytes(current_setting('shared_memory_size')) / (2 * 1024 * 1024.0)));

\echo
\echo '## work_mem is per node'

set enable_hashjoin = off;
set enable_nestloop = off;
begin;
declare two_sorts cursor for
  select *
  from (select user_id, created_at from events where id <= 300000) a
  join (select user_id, created_at from events where id > 1700000) b using (user_id);
fetch 1 from two_sorts \g /dev/null

-- The cursor's portal and every context below it.
select count(*) as sorts,
       min(total_bytes) as smallest,
       max(total_bytes) as largest
from pg_backend_memory_contexts c,
     (select path, level from pg_backend_memory_contexts
      where name = 'PortalContext' and ident = 'two_sorts') p
where c.path[p.level] = p.path[p.level]
  and c.name = 'TupleSort sort'
  and c.total_bytes > 1024 * 1024 \gset
commit;
reset enable_hashjoin;
reset enable_nestloop;

select format('two sorts held open by one cursor: %s TupleSort contexts, %s to %s bytes each',
              :sorts, :smallest, :largest);
select lab.prove(
  'one query, two Sort nodes, two work_mem allowances: each sort holds about 4 MB',
  :sorts = 2
  and :smallest between 3.5 * 1024 * 1024 and 4.5 * 1024 * 1024
  and :largest between 3.5 * 1024 * 1024 and 4.5 * 1024 * 1024);

\echo
\echo '## Memory contexts'

select lab.prove(
  'pg_backend_memory_contexts lists this backend''s contexts, from TopMemoryContext down',
  (select level from pg_backend_memory_contexts where name = 'TopMemoryContext') = 1
  and exists (select 1 from pg_backend_memory_contexts where name = 'CacheMemoryContext'));

select lab.prove(
  'pg_log_backend_memory_contexts(pid) asks any backend to write its contexts to the server log',
  pg_log_backend_memory_contexts(pg_backend_pid()));

\echo
\echo '## The catalog caches grow'

create schema tenants;
do $$ begin
  for i in 1..1000 loop
    execute format('create table tenants.t%s (
      id bigint primary key, account_id bigint not null, body text, created_at timestamptz)', i);
  end loop;
end $$;

-- CacheMemoryContext and everything under it, in the session behind `conn`.
create function pg_temp.cache_bytes(conn text) returns bigint
language sql as $f$
  select b from dblink(conn, $q$
    select sum(c.total_bytes)::bigint
    from pg_backend_memory_contexts c,
         (select path, level from pg_backend_memory_contexts
          where name = 'CacheMemoryContext') top
    where c.path[top.level] = top.path[top.level] $q$) as t(b bigint)
$f$;

select dblink_connect('w', 'dbname=' || current_database()) \g /dev/null
select pg_temp.cache_bytes('w') as fresh \gset
select dblink_exec('w', $q$ do $$ begin
  for i in 1..1000 loop
    execute format('select count(*) from tenants.t%s where id = 1', i);
  end loop;
end $$ $q$) \g /dev/null
select pg_temp.cache_bytes('w') as touched \gset
select dblink_exec('w', 'discard all') \g /dev/null
select pg_temp.cache_bytes('w') as discarded \gset
select dblink_disconnect('w') \g /dev/null

select dblink_connect('w', 'dbname=' || current_database()) \g /dev/null
select pg_temp.cache_bytes('w') as reconnected \gset
select dblink_disconnect('w') \g /dev/null

select format('CacheMemoryContext: fresh %s, after 1,000 tables %s, after DISCARD ALL %s, new connection %s',
              pg_size_pretty(:fresh::bigint), pg_size_pretty(:touched::bigint),
              pg_size_pretty(:discarded::bigint), pg_size_pretty(:reconnected::bigint));

select lab.prove(
  'a fresh connection''s catalog caches take under 2 MB',
  :fresh < 2 * 1024 * 1024);

select lab.prove(
  'touching 1,000 small tables grows them by more than 5 MB',
  :touched - :fresh > 5 * 1024 * 1024);

select lab.prove(
  'DISCARD ALL gives none of it back',
  :discarded >= :touched * 0.95);

select lab.prove(
  'a new connection starts small again',
  :reconnected < 2 * 1024 * 1024);
