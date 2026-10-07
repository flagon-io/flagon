-- Lab for "The settings that matter"
-- https://www.flagon.io/books/eight-kilobytes/configuration
-- Run: ./lab 29-configuration
--
-- Defaults are checked against pg_settings.boot_val (the compiled-in value,
-- whatever this server's config says), "reload or restart" against
-- pg_settings.context. Nothing here changes the server's configuration:
-- the lab uses ALTER DATABASE on its own database, one throwaway role, and SET.

\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;

create function boot(setting text) returns text
language sql as $$ select boot_val from pg_settings where name = $1 $$;
create function ctx(setting text) returns text
language sql as $$ select context from pg_settings where name = $1 $$;

\echo
\echo == The opening: what a stock server assumes

select lab.prove('shared_buffers defaults to 128 MB (16384 pages of 8 kB)',
  boot('shared_buffers') = '16384'
  and (select unit from pg_settings where name = 'shared_buffers') = '8kB');
select lab.prove('random_page_cost defaults to 4, seq_page_cost to 1',
  boot('random_page_cost') = '4' and boot('seq_page_cost') = '1');
select lab.prove('max_wal_size defaults to 1 GB',
  boot('max_wal_size') = '1024' and (select unit from pg_settings where name = 'max_wal_size') = 'MB');
select lab.prove('a checkpoint starts after about max_wal_size / (1 + checkpoint_completion_target) of WAL: ~539 MB',
  round(1024 / (1 + boot('checkpoint_completion_target')::numeric)) = 539);
select lab.prove('no slow-query, lock-wait, or temp-file logging by default',
  boot('log_min_duration_statement') = '-1'
  and boot('log_lock_waits') = 'off'
  and boot('log_temp_files') = '-1');
select lab.prove('roughly 400 settings in pg_settings',
  (select count(*) from pg_settings) between 370 and 430);

\echo
\echo == The most specific setting wins

alter database :"DBNAME" set work_mem = '16MB';
select dblink_connect('fresh', 'dbname=' || current_database()) \g /dev/null
select lab.prove('a new session picks up the database setting, with source = database',
  (select s from dblink('fresh',
     $$select setting || ' ' || unit || ' ' || source from pg_settings where name = 'work_mem'$$) t(s text))
  = '16384 kB database');
select lab.prove('pg_db_role_setting holds it',
  (select setconfig from pg_db_role_setting
    where setdatabase = (select oid from pg_database where datname = current_database())
      and setrole = 0) = '{work_mem=16MB}');
select lab.prove('this session, connected before the change, keeps its old value',
  current_setting('work_mem') = '4MB');

set work_mem = '64MB';
begin;
set local work_mem = '1GB';
select lab.prove('SET LOCAL wins inside the transaction', current_setting('work_mem') = '1GB');
commit;
select lab.prove('and the session value comes back at commit', current_setting('work_mem') = '64MB');
reset work_mem;

-- A role setting beats the database setting; a role-in-database setting beats both.
drop role if exists lab_cfg_reporting;
create role lab_cfg_reporting login;
alter role lab_cfg_reporting set work_mem = '256MB';
select dblink_connect('reporting', 'dbname=' || current_database() || ' user=lab_cfg_reporting') \g /dev/null
select lab.prove('a role setting overrides the database setting (source = user)',
  (select s from dblink('reporting',
     $$select current_setting('work_mem') || ' ' || source from pg_settings where name = 'work_mem'$$) t(s text))
  = '256MB user');
select dblink_disconnect('reporting') \g /dev/null
alter role lab_cfg_reporting in database :"DBNAME" set work_mem = '128MB';
select dblink_connect('reporting', 'dbname=' || current_database() || ' user=lab_cfg_reporting') \g /dev/null
select lab.prove('a role-in-database setting overrides both (source = database user)',
  (select s from dblink('reporting',
     $$select current_setting('work_mem') || ' ' || source from pg_settings where name = 'work_mem'$$) t(s text))
  = '128MB database user');
select dblink_disconnect('reporting') \g /dev/null
select dblink_disconnect('fresh') \g /dev/null
drop role lab_cfg_reporting;

\echo
\echo == Context decides reload or restart

select context || ': ' || count(*) from pg_settings group by context order by count(*) desc;
select lab.prove('postmaster (restart): shared_buffers, max_connections, io_method',
  ctx('shared_buffers') = 'postmaster' and ctx('max_connections') = 'postmaster'
  and ctx('io_method') = 'postmaster');
select lab.prove('sighup (reload): max_wal_size, log_line_prefix, log_checkpoints',
  ctx('max_wal_size') = 'sighup' and ctx('log_line_prefix') = 'sighup'
  and ctx('log_checkpoints') = 'sighup');
select lab.prove('most autovacuum_* settings are sighup; the freeze ages and worker slots need a restart',
  (select count(*) filter (where context = 'sighup') > count(*) / 2
     from pg_settings where name like 'autovacuum%')
  and ctx('autovacuum_freeze_max_age') = 'postmaster'
  and ctx('autovacuum_worker_slots') = 'postmaster');
select lab.prove('more log_* settings are superuser than sighup',
  (select count(*) filter (where context = 'superuser') > count(*) filter (where context = 'sighup')
     from pg_settings where name like 'log\_%'));
select lab.prove('superuser: log_min_duration_statement, log_lock_waits, log_temp_files, wal_compression',
  ctx('log_min_duration_statement') = 'superuser' and ctx('log_lock_waits') = 'superuser'
  and ctx('log_temp_files') = 'superuser' and ctx('wal_compression') = 'superuser');
select lab.prove('user: work_mem, random_page_cost, statement_timeout',
  ctx('work_mem') = 'user' and ctx('random_page_cost') = 'user' and ctx('statement_timeout') = 'user');
select lab.prove('internal: block_size, data_checksums, wal_segment_size',
  ctx('block_size') = 'internal' and ctx('data_checksums') = 'internal'
  and ctx('wal_segment_size') = 'internal');

do $$
begin
  set shared_buffers = '1GB';
  raise exception 'no error';
exception when cant_change_runtime_param then
  if sqlerrm <> 'parameter "shared_buffers" cannot be changed without restarting the server' then
    raise exception 'NOT PROVED: %', sqlerrm;
  end if;
end $$;
select lab.prove('SET on a postmaster setting fails: cannot be changed without restarting the server (55P02)', true);
select lab.prove('pg_settings has pending_restart; pg_file_settings has an error column',
  exists (select 1 from information_schema.columns
           where table_name = 'pg_settings' and column_name = 'pending_restart')
  and exists (select 1 from information_schema.columns
           where table_name = 'pg_file_settings' and column_name = 'error'));

\echo
\echo == Memory: budget it before you tune it

select lab.prove('the budget: 32MB x 3 nodes x 100 connections = 9.4 GB; 4 + 9.4 + 2 + 1 = 16.4 GB',
  round(32 * 3 * 100 / 1024.0, 1) = 9.4
  and round(4 + 32 * 3 * 100 / 1024.0 + 512 * 4 / 1024.0 + 1, 1) = 16.4);
select lab.prove('shared_memory_size_in_huge_pages (15+) covers shared_memory_size in 2 MB pages',
  current_setting('shared_memory_size_in_huge_pages')::int * 2
  >= (select setting::int from pg_settings where name = 'shared_memory_size'));
select lab.prove('huge_pages defaults to try; huge_pages_status (17+) reports what happened',
  boot('huge_pages') = 'try'
  and current_setting('huge_pages_status') in ('on', 'off'));
select lab.prove('effective_cache_size defaults to 4 GB',
  boot('effective_cache_size') = '524288');

\echo
\echo == work_mem: multiply before you raise it

select lab.prove('work_mem defaults to 4 MB, hash_mem_multiplier to 2',
  boot('work_mem') = '4096' and boot('hash_mem_multiplier') = '2');

set max_parallel_workers_per_gather = 0;
create temp table sorts (work_mem text, method text, space_kb bigint, space_type text, temp_written bigint);
do $$
declare
  wm text;
  p  jsonb;
begin
  foreach wm in array array['4MB', '64MB', '128MB', '256MB'] loop
    perform set_config('work_mem', wm, true);
    p := lab.plan('select account_id, created_at from events order by account_id, created_at') -> 'Plan';
    insert into sorts values (wm, p ->> 'Sort Method', (p ->> 'Sort Space Used')::bigint,
                              p ->> 'Sort Space Type', (p ->> 'Temp Written Blocks')::bigint);
  end loop;
end $$;
select work_mem || ': ' || method || ', ' || space_kb || ' kB ' || space_type
       || ', temp blocks written ' || temp_written from sorts;
select lab.prove('at the default 4 MB the sort spills: external merge, about 50 MB on disk',
  (select method = 'external merge' and space_type = 'Disk'
          and space_kb between 45000 and 56000 and temp_written > 10000
     from sorts where work_mem = '4MB'));
select lab.prove('at 256 MB it sorts in memory, using about 109 MB',
  (select method = 'quicksort' and space_type = 'Memory' and space_kb between 100000 and 120000
     from sorts where work_mem = '256MB'));
select lab.prove('the threshold: 64 MB (less than the sort needs) still spills, 128 MB (more) does not',
  (select method from sorts where work_mem = '64MB') = 'external merge'
  and (select method from sorts where work_mem = '128MB') = 'quicksort');
reset max_parallel_workers_per_gather;

select lab.prove('an ordinary group by: a sort and a hash aggregate, in a leader and two workers',
  (select n @> array['Gather Merge', 'Sort', 'Aggregate', 'Seq Scan']
     from lab.nodes('select kind, count(*) from events group by kind') n)
  -- in JSON, "Partial HashAggregate" is an Aggregate with Strategy Hashed, Partial Mode Partial
  and (select jsonb_path_exists(p, 'strict $.**.Plans[*] ? (@."Strategy" == "Hashed" && @."Partial Mode" == "Partial")')
              and jsonb_path_exists(p, 'strict $.**.Plans[*] ? (@."Node Type" == "Seq Scan" && @."Parallel Aware" == true)')
         from lab.plan('select kind, count(*) from events group by kind') p)
  and (select (p -> 'Plan' -> 'Plans' -> 0 ->> 'Workers Planned')::int
         from lab.plan('select kind, count(*) from events group by kind') p) = 2);
select lab.prove('its ceiling: (1 sort + 2 for the hash) x 3 processes = 9 x work_mem; 200 x 3 x 64MB = 38 GB',
  (1 + 2) * 3 = 9 and round(200 * 3 * 64 / 1024.0) = 38);

select lab.prove('maintenance_work_mem defaults to 64 MB, autovacuum_work_mem to -1 (use maintenance_work_mem)',
  boot('maintenance_work_mem') = '65536' and boot('autovacuum_work_mem') = '-1');

\echo
\echo == random_page_cost assumes spinning disks

create index events_project_id_idx on events (project_id);
analyze events;
set max_parallel_workers_per_gather = 0;
\set q 'select * from events where project_id between 1 and 20 order by project_id limit 5000'
select lab.nodes(:'q') as nodes_at_4 \gset
select lab.buffers(:'q') as buffers_at_4 \gset
set random_page_cost = 1.1;
select lab.nodes(:'q') as nodes_at_11 \gset
select lab.buffers(:'q') as buffers_at_11 \gset
reset random_page_cost;
reset max_parallel_workers_per_gather;
\echo at 4: :nodes_at_4 :buffers_at_4 pages; at 1.1: :nodes_at_11 :buffers_at_11 pages
select lab.prove('at random_page_cost = 4: a bitmap heap scan, then a sort',
  (:'nodes_at_4')::text[] @> array['Sort', 'Bitmap Heap Scan']);
select lab.prove('at 1.1: an index scan in order, no sort',
  (:'nodes_at_11')::text[] @> array['Index Scan'] and not (:'nodes_at_11')::text[] @> array['Sort']);
select lab.prove('both touch about the same number of pages',
  :buffers_at_11::numeric / :buffers_at_4 between 0.8 and 1.25);

\echo
\echo == effective_io_concurrency and asynchronous I/O

select lab.prove('18 defaults: effective_io_concurrency and maintenance_io_concurrency 16',
  boot('effective_io_concurrency') = '16' and boot('maintenance_io_concurrency') = '16');
select lab.prove('io_method defaults to worker and needs a restart',
  boot('io_method') = 'worker' and ctx('io_method') = 'postmaster');
select lab.prove('io_workers defaults to 3 and changes with a reload',
  boot('io_workers') = '3' and ctx('io_workers') = 'sighup');
select lab.prove('io_combine_limit defaults to 16 pages (128 kB)',
  boot('io_combine_limit') = '16' and current_setting('io_combine_limit') = '128kB');
select lab.prove('io_method accepts worker, sync, and (on liburing builds) io_uring',
  (select enumvals @> array['worker', 'sync'] from pg_settings where name = 'io_method'));

\echo
\echo == WAL and checkpoints

select lab.prove('checkpoint_timeout 5 min, checkpoint_completion_target 0.9, min_wal_size 80 MB',
  boot('checkpoint_timeout') = '300' and boot('checkpoint_completion_target') = '0.9'
  and boot('min_wal_size') = '80');
select lab.prove('wal_compression off (superuser), wal_buffers -1 (automatic, restart)',
  boot('wal_compression') = 'off' and ctx('wal_compression') = 'superuser'
  and boot('wal_buffers') = '-1' and ctx('wal_buffers') = 'postmaster');
select lab.prove('automatic wal_buffers = 1/32 of shared_buffers, capped at one WAL segment',
  (select source from pg_settings where name = 'wal_buffers') = 'default'
  and pg_size_bytes(current_setting('wal_buffers')) = least(
    pg_size_bytes(current_setting('shared_buffers')) / 32,
    pg_size_bytes(current_setting('wal_segment_size'))));
select lab.prove('pg_stat_checkpointer (17+) has num_timed and num_requested',
  (select count(*) from information_schema.columns
    where table_name = 'pg_stat_checkpointer' and column_name in ('num_timed', 'num_requested')) = 2);

\echo
\echo == Autovacuum for real workloads

select lab.prove('autovacuum_vacuum_cost_limit -1, meaning vacuum_cost_limit (200)',
  boot('autovacuum_vacuum_cost_limit') = '-1' and boot('vacuum_cost_limit') = '200');
select lab.prove('scale factors 0.2, 0.2 (insert), 0.1 (analyze)',
  boot('autovacuum_vacuum_scale_factor') = '0.2'
  and boot('autovacuum_vacuum_insert_scale_factor') = '0.2'
  and boot('autovacuum_analyze_scale_factor') = '0.1');
select lab.prove('autovacuum_max_workers 3, a reload in 18, up to autovacuum_worker_slots (16, restart)',
  boot('autovacuum_max_workers') = '3' and ctx('autovacuum_max_workers') = 'sighup'
  and boot('autovacuum_worker_slots') = '16' and ctx('autovacuum_worker_slots') = 'postmaster');
select lab.prove('log_autovacuum_min_duration defaults to 10 min',
  boot('log_autovacuum_min_duration') = '600000');

\echo
\echo == Parallel query speeds up one query, not the server

select lab.prove('max_worker_processes 8 (restart), max_parallel_workers 8, per gather 2, maintenance 2',
  boot('max_worker_processes') = '8' and ctx('max_worker_processes') = 'postmaster'
  and boot('max_parallel_workers') = '8' and boot('max_parallel_workers_per_gather') = '2'
  and boot('max_parallel_maintenance_workers') = '2');
select lab.prove('min_parallel_table_scan_size defaults to 8 MB',
  boot('min_parallel_table_scan_size') = '1024');
select lab.prove('events (275 MB) is past 8 x 3^3 = 216 MB but short of 648 MB: four workers',
  pg_relation_size('events') between 216 * 1024 * 1024 and 648 * 1024 * 1024);
set max_parallel_workers_per_gather = 8;
select lab.prove('with the cap raised, the planner plans 4 workers for events',
  (select (p -> 'Plan' -> 'Plans' -> 0 ->> 'Workers Planned')::int
     from lab.plan('select kind, count(*) from events group by kind') p) = 4);
reset max_parallel_workers_per_gather;

\echo
\echo == Logging that pays off

select lab.prove('log_checkpoints on (15+), deadlock_timeout 1s, log_line_prefix ''%m [%p] ''',
  boot('log_checkpoints') = 'on' and boot('deadlock_timeout') = '1000'
  and boot('log_line_prefix') = '%m [%p] ');

load 'auto_explain';
select lab.prove('auto_explain loads into a session',
  exists (select 1 from pg_settings where name = 'auto_explain.log_min_duration'));
select lab.prove('the slow count reads about 35,000 pages',
  lab.buffers($$select count(*) from events where kind = 'alert' and payload->>'status' = 'failed'$$)
  between 33000 and 37000);
create temp table est as
with recursive walk(node) as (
  select lab.plan($$select count(*) from events where kind = 'alert' and payload->>'status' = 'failed'$$) -> 'Plan'
  union all
  select child from walk, jsonb_array_elements(coalesce(walk.node -> 'Plans', '[]')) child
)
select (node ->> 'Plan Rows')::numeric * (1 + coalesce((select (n2.node ->> 'Workers Planned')::int
                                                          from walk n2 where n2.node ? 'Workers Planned' limit 1), 0)) as est,
       (node ->> 'Actual Rows')::numeric * (node ->> 'Actual Loops')::numeric as actual
  from walk where node ->> 'Node Type' like '%Seq Scan';
select 'estimated ' || round(est) || ' rows, actual ' || round(actual) from est;
select lab.prove('the planner estimates under 5,000 matching rows; there are over 60,000',
  (select est < 5000 and actual > 60000 from est));

\echo
\echo == A starter config for 4 vCPU and 16 GB

-- Every setting in the starter config exists on PostgreSQL 18...
select lab.prove('every name in the starter config is a real setting',
  (select count(*) from unnest(array[
     'max_connections','shared_buffers','huge_pages','effective_cache_size','work_mem',
     'hash_mem_multiplier','maintenance_work_mem','autovacuum_work_mem','random_page_cost',
     'effective_io_concurrency','maintenance_io_concurrency','io_method','io_workers',
     'wal_compression','max_wal_size','min_wal_size','checkpoint_timeout',
     'checkpoint_completion_target','wal_level','max_slot_wal_keep_size',
     'autovacuum_max_workers','autovacuum_vacuum_cost_limit','autovacuum_vacuum_scale_factor',
     'autovacuum_vacuum_insert_scale_factor','autovacuum_analyze_scale_factor',
     'max_worker_processes','max_parallel_workers','max_parallel_workers_per_gather',
     'max_parallel_maintenance_workers','idle_in_transaction_session_timeout',
     'log_line_prefix','log_min_duration_statement','log_lock_waits','log_temp_files',
     'log_autovacuum_min_duration','log_checkpoints','shared_preload_libraries',
     'pg_stat_statements.max','pg_stat_statements.track','auto_explain.log_min_duration',
     'auto_explain.log_analyze','auto_explain.log_buffers','auto_explain.log_timing',
     'track_io_timing']) n
    where not exists (select 1 from pg_settings where name = n)) = 0);

-- ...and every value we can SET in a session is accepted.
begin;
select set_config(n, v, true) from (values
  ('effective_cache_size', '12GB'), ('work_mem', '32MB'), ('hash_mem_multiplier', '2.0'),
  ('maintenance_work_mem', '1GB'), ('random_page_cost', '1.1'),
  ('effective_io_concurrency', '64'), ('maintenance_io_concurrency', '64'),
  ('wal_compression', 'lz4'), ('max_parallel_workers', '4'),
  ('max_parallel_workers_per_gather', '2'), ('max_parallel_maintenance_workers', '2'),
  ('idle_in_transaction_session_timeout', '5min'), ('log_min_duration_statement', '500ms'),
  ('log_lock_waits', 'on'), ('log_temp_files', '0'), ('pg_stat_statements.track', 'top'),
  ('auto_explain.log_min_duration', '2s'), ('auto_explain.log_analyze', 'on'),
  ('auto_explain.log_buffers', 'on'), ('auto_explain.log_timing', 'off'),
  ('track_io_timing', 'on')) s(n, v) \g /dev/null
select lab.prove('the session-settable starter values are all accepted (wal_compression = lz4 included)',
  current_setting('wal_compression') = 'lz4' and current_setting('random_page_cost') = '1.1');
select set_config('wal_compression', 'zstd', true) \g /dev/null
select lab.prove('this build also has zstd for wal_compression', current_setting('wal_compression') = 'zstd');
rollback;

\echo
\echo == Below Postgres: the OS and the box

-- Kernel settings belong to the host, so most can't be proved from inside a
-- container. What can: Postgres's own side of each, and what the container
-- sees. Files under /proc are read with pg_read_file (the lab runs as a
-- superuser in the same container as the server).
create function host_file(path text) returns text
language plpgsql as $$
begin
  return btrim(pg_read_file(path), E' \n');
exception when others then
  return 'unreadable';
end $$;

select split_part(pg_read_file('postmaster.pid'), E'\n', 1)::int as pm_pid \gset
select lab.prove('without PG_OOM_ADJUST_FILE, a backend inherits the postmaster''s oom_score_adj',
  position('PG_OOM_ADJUST_FILE'::bytea in pg_read_binary_file('/proc/' || :pm_pid || '/environ')) = 0
  and host_file('/proc/' || :pm_pid || '/oom_score_adj')
      = host_file('/proc/' || pg_backend_pid() || '/oom_score_adj'));

select lab.prove('huge_pages defaults to try, and changing it needs a restart',
  boot('huge_pages') = 'try' and ctx('huge_pages') = 'postmaster');
select lab.prove('huge_page_size 0 means the kernel''s default huge page size',
  boot('huge_page_size') = '0');
select lab.prove('shared_memory_size_in_huge_pages is computed by the server, not set',
  ctx('shared_memory_size_in_huge_pages') = 'internal');
select current_setting('shared_memory_size_in_huge_pages')::bigint as hp_needed,
       (regexp_match(pg_read_file('/proc/meminfo'), 'Hugepagesize:\s+(\d+) kB'))[1]::bigint as hp_kb \gset
select lab.prove('shared_memory_size_in_huge_pages covers shared_memory_size at the kernel''s huge page size',
  :hp_needed * :hp_kb * 1024 >= pg_size_bytes(current_setting('shared_memory_size')) - 1024 * 1024
  and (:hp_needed - 1) * :hp_kb * 1024 < pg_size_bytes(current_setting('shared_memory_size')));

select lab.prove('on Linux, checkpoint_flush_after is 256 kB and bgwriter_flush_after 512 kB; backends: 0',
  boot('checkpoint_flush_after') = '32' and boot('bgwriter_flush_after') = '64'
  and boot('backend_flush_after') = '0'
  and (select unit from pg_settings where name = 'checkpoint_flush_after') = '8kB');

select lab.prove('PostgreSQL 18 has pg_numa_available() and pg_shmem_allocations_numa',
  to_regprocedure('pg_numa_available()') is not null
  and to_regclass('pg_shmem_allocations_numa') is not null);

select lab.prove('shared_buffers lives in anonymous mmap memory; dynamic shared memory is POSIX shm',
  current_setting('shared_memory_type') = 'mmap'
  and current_setting('dynamic_shared_memory_type') = 'posix');
select lab.prove('Postgres keeps dynamic shared memory segments in /dev/shm',
  exists (select 1 from pg_ls_dir('/dev/shm') f where f like 'PostgreSQL.%'));
select lab.prove('the lab kit''s compose file gives /dev/shm 512 MB, not Docker''s 64 MB',
  host_file('/proc/self/mounts') ~ '/dev/shm \S+ \S*size=524288k');

\echo
\echo -- The kernel settings this container sees, for information only (not checked: they belong to the host)
select 'vm.overcommit_memory      ' || host_file('/proc/sys/vm/overcommit_memory');
select 'vm.overcommit_ratio       ' || host_file('/proc/sys/vm/overcommit_ratio');
select 'vm.swappiness             ' || host_file('/proc/sys/vm/swappiness');
select 'vm.dirty_background_ratio ' || host_file('/proc/sys/vm/dirty_background_ratio');
select 'vm.dirty_ratio            ' || host_file('/proc/sys/vm/dirty_ratio');
select 'vm.zone_reclaim_mode      ' || host_file('/proc/sys/vm/zone_reclaim_mode');
select 'transparent huge pages    ' || host_file('/sys/kernel/mm/transparent_hugepage/enabled');
select 'cgroup memory.max         ' || host_file('/sys/fs/cgroup/memory.max');
