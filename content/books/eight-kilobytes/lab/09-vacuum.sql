-- Lab for "Vacuum is not optional"
-- https://www.flagon.io/books/eight-kilobytes/vacuum
-- Run: ./lab 09-vacuum
--
-- Follows vac_demo through the chapter: bloat it, vacuum it, reuse the space,
-- block vacuum with an open snapshot (via dblink), then rebuild it.
\pset tuples_only on
\pset format unaligned
create extension if not exists dblink;
create extension if not exists pg_visibility;

-- vac_demo: the first half million events, autovacuum off so only our
-- vacuums run.
create table vac_demo (like events including defaults)
  with (autovacuum_enabled = off);
insert into vac_demo overriding system value
  select * from events where id <= 500000;
alter table vac_demo add primary key (id);
vacuum (analyze) vac_demo;

\echo
\echo == Measure dead tuples with pgstattuple
select lab.prove(
  'half a million rows take about 8,800 pages, with no dead tuples and under 1% free',
  tuple_count = 500000 and table_len / 8192 between 8700 and 8900
  and dead_tuple_count = 0 and free_percent < 1)
from pgstattuple('vac_demo');

update vac_demo set payload = payload || '{"seen": true}' where id % 2 = 0;
select lab.prove(
  'updating every second row leaves 250,000 dead tuples, about 31% of the table',
  tuple_count = 500000 and dead_tuple_count = 250000
  and dead_tuple_percent between 29 and 33)
from pgstattuple('vac_demo');
select lab.prove(
  'the table grew about 55% (to about 13,600 pages) with nothing inserted',
  pg_relation_size('vac_demo') / 8192 between 13400 and 13800);
select pg_relation_size('vac_demo') / 8192 as pages_after_update \gset

\echo
\echo == Vacuum does five jobs
vacuum vac_demo;
select lab.prove(
  'vacuum removed all 250,000 dead tuples',
  dead_tuple_count = 0) from pgstattuple('vac_demo');
select lab.prove(
  'and set every page all-visible in the visibility map',
  all_visible = :pages_after_update) from pg_visibility_map_summary('vac_demo');

\echo
\echo == 2. Record the free space
select lab.prove(
  'the table is the same size, and the dead space is now about 32% free space',
  pg_relation_size('vac_demo') / 8192 = :pages_after_update
  and free_percent between 29 and 34)
from pgstattuple('vac_demo');

insert into vac_demo overriding system value
  select * from events where id between 500001 and 600000;
select lab.prove(
  '100,000 new rows land in that free space: not one page added',
  pg_relation_size('vac_demo') / 8192 = :pages_after_update);
select lab.prove(
  '600,000 live rows, free space down to about 19%',
  tuple_count = 600000 and free_percent between 16 and 22)
from pgstattuple('vac_demo');

\echo
\echo == 3. Truncate empty pages at the end
create table trunc_demo with (autovacuum_enabled = off) as
  select * from events where id <= 100000;
select pg_relation_size('trunc_demo') / 8192 as trunc_before \gset
delete from trunc_demo where id > 50000;
vacuum trunc_demo;
select lab.prove(
  'deleting the newest half and vacuuming cuts the file roughly in half (about 1,790 to 880 pages)',
  :trunc_before between 1750 and 1850
  and pg_relation_size('trunc_demo') / 8192 between 860 and 900);

create table front_demo with (autovacuum_enabled = off) as
  select * from events where id <= 100000;
delete from front_demo where id <= 50000;
vacuum front_demo;
select lab.prove(
  'deleting the oldest half instead frees the space at the front, and the file does not shrink',
  pg_relation_size('front_demo') / 8192 = :trunc_before);

select lab.prove(
  'truncation can be turned off per table with the vacuum_truncate storage parameter',
  (select count(*) from pg_settings where name = 'vacuum_truncate') = 1);
alter table front_demo set (vacuum_truncate = false);
vacuum (truncate false) front_demo;

\echo
\echo == 4. Freeze old tuples
-- These rows are only a few thousand transactions old, far younger than
-- vacuum_freeze_min_age, so a plain vacuum isn't required to freeze them.
-- (It may freeze some opportunistically when it's writing a page image anyway.)
select lab.prove(
  'vacuum_freeze_min_age is 50 million transactions',
  current_setting('vacuum_freeze_min_age') = '50000000');
vacuum (freeze) trunc_demo;
select lab.prove(
  'vacuum (freeze) marks every page of a table all-frozen',
  all_frozen = (pg_relation_size('trunc_demo') / 8192))
from pg_visibility_map_summary('trunc_demo');
select lab.prove(
  'and the table''s relfrozenxid jumps to the present',
  age(relfrozenxid) < 1000) from pg_class where relname = 'trunc_demo';

\echo
\echo == Autovacuum: when it fires
select lab.prove(
  'autovacuum defaults: naptime 1 min, 3 workers, threshold 50, scale factor 0.2',
  current_setting('autovacuum_naptime') = '1min'
  and current_setting('autovacuum_max_workers') = '3'
  and current_setting('autovacuum_vacuum_threshold') = '50'
  and current_setting('autovacuum_vacuum_scale_factor') = '0.2');
select lab.prove(
  'insert-driven vacuum: threshold 1000, scale factor 0.2',
  current_setting('autovacuum_vacuum_insert_threshold') = '1000'
  and current_setting('autovacuum_vacuum_insert_scale_factor') = '0.2');
select lab.prove(
  'PostgreSQL 18 caps the dead-tuple threshold at autovacuum_vacuum_max_threshold, 100 million',
  current_setting('autovacuum_vacuum_max_threshold') = '100000000');
select lab.prove(
  'analyze fires at 50 + 10% changed rows; anti-wraparound at age 200 million',
  current_setting('autovacuum_analyze_threshold') = '50'
  and current_setting('autovacuum_analyze_scale_factor') = '0.1'
  and current_setting('autovacuum_freeze_max_age') = '200000000');
select lab.prove(
  'PostgreSQL 18 tracks frozen pages per table (pg_class.relallfrozen) for the insert threshold',
  exists (select 1 from information_schema.columns
          where table_name = 'pg_class' and column_name = 'relallfrozen'));

select lab.prove(
  'for events (2,000,000 rows), the default trigger is 400,050 dead rows',
  (select count(*) from events) = 2000000
  and least(100000000, 50 + 0.2 * (select count(*) from events)) = 400050);

alter table events set (
  autovacuum_vacuum_scale_factor        = 0.01,
  autovacuum_vacuum_threshold           = 1000,
  autovacuum_vacuum_insert_scale_factor = 0.01,
  autovacuum_analyze_scale_factor       = 0.02,
  autovacuum_vacuum_cost_limit          = 1000
);
select lab.prove(
  'every autovacuum parameter works as a storage parameter',
  array_length(reloptions, 1) = 5) from pg_class where relname = 'events';
select lab.prove(
  'with scale factor 0.01 and threshold 1000, events is vacuumed at about 21,000 dead rows',
  1000 + 0.01 * (select count(*) from events) = 21000);

\echo
\echo == Cost-based throttling
select lab.prove(
  'page costs: hit 1, miss 2, dirty 20',
  current_setting('vacuum_cost_page_hit') = '1'
  and current_setting('vacuum_cost_page_miss') = '2'
  and current_setting('vacuum_cost_page_dirty') = '20');
select lab.prove(
  'autovacuum uses vacuum_cost_limit (200) because its own limit is -1, and sleeps 2 ms',
  current_setting('vacuum_cost_limit') = '200'
  and current_setting('autovacuum_vacuum_cost_limit') = '-1'
  and current_setting('autovacuum_vacuum_cost_delay') = '2ms');
select lab.prove(
  'manual VACUUM is unthrottled: vacuum_cost_delay is 0',
  current_setting('vacuum_cost_delay') = '0');
select lab.prove(
  'vacuum_buffer_usage_limit defaults to 2 MB',
  current_setting('vacuum_buffer_usage_limit') = '2MB');

\echo
\echo == What blocks vacuum
select all_visible as av_before from pg_visibility_map_summary('vac_demo') \gset

-- Session A takes a snapshot and sits there.
select dblink_connect('session_a', 'dbname=' || current_database()) is not null \g /dev/null
select dblink_exec('session_a', 'begin isolation level repeatable read') is not null \g /dev/null
select n from dblink('session_a', 'select count(*) from accounts') as t(n bigint) \g /dev/null

update vac_demo set kind = 'deploy' where id <= 100000;
select all_visible as av_after_update from pg_visibility_map_summary('vac_demo') \gset
select lab.prove(
  'most pages are still all-visible after the update, so vacuum can skip them',
  :av_after_update > 0.3 * :pages_after_update);

vacuum vac_demo;
select lab.prove(
  'vacuum removes nothing: 100,000 rows are dead but not yet removable',
  dead_tuple_count = 100000) from pgstattuple('vac_demo');
select lab.prove(
  'the culprit shows up in pg_stat_activity with a non-null backend_xmin',
  count(*) = 1)
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid()
  and backend_xmin is not null and state = 'idle in transaction';

select dblink_exec('session_a', 'commit') is not null \g /dev/null
select dblink_disconnect('session_a') is not null \g /dev/null
vacuum vac_demo;
select lab.prove(
  'once that transaction ends, the next vacuum removes all 100,000',
  dead_tuple_count = 0) from pgstattuple('vac_demo');

select lab.prove(
  'max_prepared_transactions defaults to 0',
  current_setting('max_prepared_transactions') = '0');
select lab.prove(
  'the slot and prepared-transaction queries run',
  (select count(*) from pg_replication_slots) >= 0
  and (select count(*) from pg_prepared_xacts) >= 0);

\echo
\echo == Bloat: measuring it and getting rid of it
create temp table idx_before as
  select index_size, avg_leaf_density from pgstatindex('vac_demo_pkey');
select lab.prove(
  'after all those non-HOT updates, the primary key''s leaves are only about half full',
  avg_leaf_density between 40 and 65) from idx_before;

reindex index concurrently vac_demo_pkey;
select lab.prove(
  'REINDEX CONCURRENTLY packs the leaves back to about 90%',
  avg_leaf_density between 88 and 92) from pgstatindex('vac_demo_pkey');
select lab.prove(
  'and the index is over a third smaller',
  (select index_size from pgstatindex('vac_demo_pkey'))
    < 0.67 * (select index_size from idx_before));

select pg_relation_filenode('vac_demo') as filenode_before \gset
vacuum full vac_demo;
select lab.prove(
  'VACUUM FULL writes a new file (the filenode changes)',
  pg_relation_filenode('vac_demo') <> :filenode_before);
select lab.prove(
  'compacted from about 13,600 to about 11,000 pages, under 1% free',
  table_len / 8192 between 10700 and 11200 and tuple_count = 600000 and free_percent < 1)
from pgstattuple('vac_demo');

\echo
\echo == Wraparound: the emergency to avoid
select lab.prove(
  'vacuum_freeze_table_age 150 million, autovacuum_freeze_max_age 200 million, vacuum_failsafe_age 1.6 billion',
  current_setting('vacuum_freeze_table_age') = '150000000'
  and current_setting('autovacuum_freeze_max_age') = '200000000'
  and current_setting('vacuum_failsafe_age') = '1600000000');
select lab.prove(
  'multixacts have their own freeze settings',
  current_setting('autovacuum_multixact_freeze_max_age') = '400000000'
  and current_setting('vacuum_multixact_failsafe_age') = '1600000000');
select lab.prove(
  'PostgreSQL 18 eager freezing is tuned by vacuum_max_eager_freeze_failure_rate (default 0.03)',
  current_setting('vacuum_max_eager_freeze_failure_rate') = '0.03');

begin;
select count(*) from vac_demo \g /dev/null
select lab.prove(
  'a read-only transaction consumes no xid',
  pg_current_xact_id_if_assigned() is null);
commit;

\echo
\echo == A monitoring query set
select lab.prove(
  'the closest-to-autovacuum query runs',
  count(*) > 0)
from (
  select s.relname, s.n_dead_tup,
         round(current_setting('autovacuum_vacuum_threshold')::int
               + current_setting('autovacuum_vacuum_scale_factor')::float8 * c.reltuples) as vacuum_at,
         s.last_autovacuum, s.autovacuum_count
  from pg_stat_user_tables s
  join pg_class c on c.oid = s.relid
  order by s.n_dead_tup desc
  limit 10
) q;
select lab.prove(
  'the freeze-age queries run',
  (select count(*) from (
     select c.oid::regclass, age(c.relfrozenxid),
            round(100.0 * age(c.relfrozenxid)
                  / current_setting('autovacuum_freeze_max_age')::int, 1),
            pg_size_pretty(pg_total_relation_size(c.oid))
     from pg_class c where c.relkind in ('r', 'm', 't')
     order by age(c.relfrozenxid) desc limit 10) q) > 0
  and (select count(*) from (
     select datname, age(datfrozenxid), mxid_age(datminmxid) from pg_database) q) > 0);
select lab.prove(
  'the vacuum progress query runs',
  count(*) >= 0)
from (
  select p.pid, p.relid::regclass, p.phase, p.heap_blks_scanned, p.heap_blks_total,
         p.index_vacuum_count, now() - a.xact_start
  from pg_stat_progress_vacuum p join pg_stat_activity a using (pid)
) q;
select lab.prove(
  'log_autovacuum_min_duration defaults to 10 minutes',
  current_setting('log_autovacuum_min_duration') = '10min');
