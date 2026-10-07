#!/usr/bin/env bash
# Lab for "Extensions worth knowing"
# https://www.flagon.io/books/eight-kilobytes/extensions
#
# Run: ./lab 15          (from this folder; Linux, macOS, or Git Bash)
#      KEEP=1 ./lab 15   (leave both servers up to explore; then
#        docker compose -f 15-extensions.compose.yml exec postgres psql -d lab
#        docker compose -f 15-extensions.compose.yml exec timescaledb psql -d lab
#        and docker compose -f 15-extensions.compose.yml down -v when done)
#
# Starts two PostgreSQL 18 servers from 15-extensions.compose.yml. The first
# run builds an image (PostGIS plus third-party extensions from
# apt.postgresql.org) and pulls TimescaleDB's; that takes a few minutes once.
# The `postgres` server gets the book's accounts, users, and projects (no
# events); the `timescaledb` server gets two million events shaped like the
# book's. Every claim prints PROVED; the first one that doesn't hold stops
# the run, and both servers are always torn down again, volumes included.

LAB_COMPOSE=15-extensions.compose.yml
. "$(dirname "$0")/lib.sh"

has() { grep -qF -- "$1" <<<"$2"; }
# pg / ts [psql args]: psql in the lab database on each server, quiet and
# unaligned. The lab.prove() checks print their own PROVED lines.
pg() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres \
    psql -X -q -At -v ON_ERROR_STOP=1 -d lab "$@"
}
ts() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" timescaledb \
    psql -X -q -At -v ON_ERROR_STOP=1 -d lab "$@"
}

echo "starting two PostgreSQL 18 servers (the first run builds and pulls images)"
start --build

section "Setting up: the book's accounts, users, and projects"
# The postgres service creates `lab` itself (with PostGIS already in it), so
# pg_cron's scheduler has its database from the first start.
"${COMPOSE[@]}" exec -T timescaledb psql -X -q -v ON_ERROR_STOP=1 \
  -c "create database lab template template0" >/dev/null
# The seed minus its two million events, and the lab helpers, on both.
sed '/^insert into events/,/^order by r.g;/d' seed.sql | pg >/dev/null
pg < helpers.sql >/dev/null
ts < helpers.sql >/dev/null
pg <<'SQL'
select lab.prove('the seed loaded 1,000 accounts, 100,000 users, and 20,000 projects',
  (select count(*) from accounts) = 1000 and (select count(*) from users) = 100000
  and (select count(*) from projects) = 20000);
SQL

section "How extensions work: versions and update paths"
pg <<'SQL'
create extension hstore version '1.4';
select lab.prove('create extension can install an older version on request: hstore 1.4',
  (select extversion from pg_extension where extname = 'hstore') = '1.4');
select lab.prove('there is no 1.4-to-1.8 script; Postgres chains four update scripts',
  (select path from pg_extension_update_paths('hstore')
    where source = '1.4' and target = '1.8') = '1.4--1.5--1.6--1.7--1.8');
alter extension hstore update;
select lab.prove('alter extension hstore update walks it to the default version, 1.8',
  (select extversion from pg_extension where extname = 'hstore') = '1.8');
SQL

section "How extensions work: trusted and untrusted"
pg <<'SQL'
create extension plpython3u;
create role app login;
grant create on database lab to app;
grant create on schema public to app;
grant usage on schema lab to app;
set role app;
select lab.prove('a role with CREATE on the database, not a superuser, can install a trusted extension (citext)',
  lab.try('create extension citext') = 'ok');
select lab.prove('the same role cannot install an untrusted one (postgres_fdw): 42501',
  lab.try('create extension postgres_fdw') like '42501:%');
select lab.prove('it can write functions in trusted plpgsql',
  lab.try($q$create function one_pg() returns int language plpgsql
                 as 'begin return 1; end'$q$) = 'ok');
select lab.prove('but not in untrusted plpython3u: 42501',
  lab.try($q$create function one_py() returns int language plpython3u
                 as 'return 1'$q$) like '42501:%');
select lab.prove('the pljs extension is not marked trusted: the app role cannot install it (42501)',
  (select not trusted from pg_available_extension_versions v
    join pg_available_extensions a on a.name = v.name and a.default_version = v.version
   where v.name = 'pljs')
  and lab.try('create extension pljs') like '42501:%');
reset role;
create extension pljs;
set role app;
select lab.prove('but once a superuser installs it, pljs is a trusted language the app role can write in',
  (select lanpltrusted from pg_language where lanname = 'pljs')
  and lab.try($q$create function one_js() returns int language pljs
                 as 'return 1'$q$) = 'ok');
reset role;
select lab.prove('pg_available_extension_versions shows the flags: citext trusted, postgres_fdw and plpython3u not',
  (select bool_and(trusted = (name = 'citext'))
     from pg_available_extension_versions
    where name in ('citext', 'postgres_fdw', 'plpython3u')));
SQL

section "How extensions work: shared_preload_libraries"
ts <<'SQL'
create extension pg_stat_statements;
select lab.prove('pg_stat_statements installs without being preloaded',
  exists (select 1 from pg_extension where extname = 'pg_stat_statements'));
select lab.prove('but reading it fails until it is in shared_preload_libraries: 55000',
  lab.try('select count(*) from pg_stat_statements') like '55000:%');
SQL

section "Core has replaced some contrib modules"
pg <<'SQL'
select lab.prove('with neither uuid-ossp nor pgcrypto installed, core makes v4 and v7 UUIDs',
  not exists (select 1 from pg_extension where extname in ('uuid-ossp', 'pgcrypto'))
  and uuid_extract_version(gen_random_uuid()) = 4
  and uuid_extract_version(uuidv4()) = 4
  and uuid_extract_version(uuidv7()) = 7);
select lab.prove('and core hashes with SHA-256 (sha256(), PostgreSQL 11+)',
  encode(sha256('flagon'), 'hex') = encode(sha256(convert_to('flagon', 'UTF8')), 'hex')
  and length(sha256('flagon')) = 32);
SQL

section "PostGIS: geometry, geography, and SRIDs"
pg <<'SQL'
create extension if not exists postgis;
select lab.prove('Frankfurt to Amsterdam as geometry in SRID 4326: about 4.4, in degrees',
  st_distance('SRID=4326;POINT(8.68 50.11)'::geometry,
              'SRID=4326;POINT(4.90 52.37)'::geometry) between 4.39 and 4.42);
select lab.prove('as geography: about 364.5 km, in meters, on the spheroid',
  st_distance('SRID=4326;POINT(8.68 50.11)'::geography,
              'SRID=4326;POINT(4.90 52.37)'::geography) between 364000 and 365000);
select lab.prove('in Web Mercator (3857): about 582 km, 60 percent too long',
  st_distance(st_transform('SRID=4326;POINT(8.68 50.11)'::geometry, 3857),
              st_transform('SRID=4326;POINT(4.90 52.37)'::geometry, 3857))
    between 575000 and 590000);
select lab.prove('in an equal-area projection for Europe (3035): within 0.01 percent of the geography answer',
  abs(st_distance(st_transform('SRID=4326;POINT(8.68 50.11)'::geometry, 3035),
                  st_transform('SRID=4326;POINT(4.90 52.37)'::geometry, 3035))
      - st_distance('SRID=4326;POINT(8.68 50.11)'::geography,
                    'SRID=4326;POINT(4.90 52.37)'::geography)) < 40);
SQL

section "PostGIS: indexes, ST_DWithin, and nearest neighbors"
pg <<'SQL'
-- Each user's last-seen location, scattered around five cities.
select setseed(0.46);
create table user_locations as
with c(i, lon, lat) as (values (0, -77.49, 39.04), (1, -122.38, 37.62),
                               (2, 4.90, 52.37), (3, 8.68, 50.11), (4, 151.21, -33.87))
select u.id as user_id,
       st_makepoint(c.lon + (random() + random() + random() - 1.5) * 4,
                    c.lat + (random() + random() + random() - 1.5) * 3)::geography(point, 4326) as last_seen
from users u join c on c.i = u.id % 5
order by u.id;
alter table user_locations add primary key (user_id);
vacuum analyze user_locations;

\set fra '''SRID=4326;POINT(8.68 50.11)''::geography'
\set within 'select count(*) from user_locations where st_dwithin(last_seen, ' :fra ', 50000)'
\set dist   'select count(*) from user_locations where st_distance(last_seen, ' :fra ') < 50000'
\set buf    'select count(*) from user_locations where st_intersects(last_seen, st_buffer(' :fra ', 50000))'
\set knn    'select user_id from user_locations order by last_seen <-> ' :fra ' limit 5'

select lab.prove('955 users were last seen within 50 km of Frankfurt',
  (:within) = 955);
select lab.prove('without an index, ST_DWithin reads all 834 pages of the table',
  pg_relation_size('user_locations') / 8192 = 834
  and lab.buffers(:'within') = 834);

create index user_locations_gist on user_locations using gist (last_seen);

select lab.prove('with a GiST index, ST_DWithin becomes a bitmap index scan on the bounding box',
  'Bitmap Index Scan' = any (lab.nodes(:'within')));
select lab.prove('the box finds 1,615 candidates; the exact distance check keeps 955',
  (select (p -> 'Plan' -> 'Plans' -> 0 -> 'Plans' -> 0 ->> 'Actual Rows')::numeric = 1615
          and (p -> 'Plan' -> 'Plans' -> 0 ->> 'Rows Removed by Filter')::numeric = 660
     from lab.plan(:'within') p));
select lab.prove('but those 955 rows are scattered: the query still reads over 700 of the 834 pages',
  lab.buffers(:'within') between 700 and 834);
select lab.prove('ST_Distance(...) < 50000 gives the same answer and never uses the index',
  (:dist) = 955 and 'Seq Scan' = any (lab.nodes(:'dist'))
  and not ('Bitmap Index Scan' = any (lab.nodes(:'dist'))));
select lab.prove('a 50 km ST_Buffer is a 32-sided polygon, so intersecting it misses 6 of the 955',
  st_npoints(st_buffer(:fra, 50000)::geometry) = 33 and (:buf) = 949);

cluster user_locations using user_locations_gist;
analyze user_locations;

select lab.prove('after CLUSTER on the GiST index, the same query reads under 150 pages',
  (:within) = 955 and lab.buffers(:'within') < 150);
select lab.prove('nearest neighbors with <-> walk the index in distance order and read under 20 pages',
  lab.nodes(:'knn') = '{Limit,"Index Scan"}' and lab.buffers(:'knn') < 20);
select lab.prove('and the first of them is the true nearest user',
  (select user_id from user_locations order by last_seen <-> :fra limit 1)
  = (select user_id from user_locations order by st_distance(last_seen, :fra) limit 1));
SQL

section "TimescaleDB: a hypertable of two million events"
ts <<'SQL'
create extension timescaledb;
create table events (
  account_id  bigint      not null,
  project_id  bigint      not null,
  kind        text        not null,
  payload     jsonb       not null,
  created_at  timestamptz not null
) with (tsdb.hypertable, tsdb.partition_column = 'created_at', tsdb.chunk_interval = '7 days');

-- Same shape and dates as the book's events.
select setseed(0.42);
insert into events
select 1 + (p % 1000), p,
       (array['deploy','deploy','build','build','build','comment','alert','login'])[1 + floor(random()*8)::int],
       jsonb_build_object('status', (array['ok','ok','ok','failed'])[1 + floor(random()*4)::int],
                          'duration_ms', floor(random()*5000)::int,
                          'region', (array['iad','sfo','ams','fra','syd'])[1 + floor(random()*5)::int]),
       timestamptz '2026-10-06' - interval '365 days' + (g * interval '365 days' / 2000000)
from generate_series(1, 2000000) g,
     lateral (select 1 + floor(random()*20000)::bigint as p) x;
vacuum analyze events;

select lab.prove('inserting a year of events created 53 weekly chunks on the fly',
  (select count(*) from timescaledb_information.chunks where hypertable_name = 'events') = 53);
select lab.prove('this image runs the Timescale License build',
  current_setting('timescaledb.license') = 'timescale'
  and exists (select 1 from pg_ls_dir('/usr/local/lib/postgresql') f
               where f = 'timescaledb-tsl-2.30.2.so'));
select lab.prove('and the license can only change in the server configuration, not in a session: 22023',
  lab.try($q$set timescaledb.license = 'apache'$q$) like '22023:%');
SQL
ts -v q="select avg((payload->>'duration_ms')::int) from events where kind = 'deploy' and created_at >= '2026-09-01'" <<'SQL'
select lab.buffers(:'q') as rowstore_buffers \gset
select lab.prove('as plain row-store chunks, a month of deploy durations reads over 3,000 pages',
  :rowstore_buffers > 3000);
create materialized view events_daily with (timescaledb.continuous) as
select time_bucket('1 day', created_at) as day, kind, count(*) as n
from events
group by 1, 2
with no data;
call refresh_continuous_aggregate('events_daily', null, null);
select lab.prove('the continuous aggregate holds one row per day and kind, 1,826 in all, summing to 2,000,000',
  (select count(*) from events_daily) = 1826
  and (select sum(n) from events_daily) = 2000000);

alter table events set (timescaledb.enable_columnstore,
                        timescaledb.segmentby = 'kind',
                        timescaledb.orderby = 'created_at desc');
do $$ declare c regclass;
begin
  for c in select show_chunks('events') loop
    call convert_to_columnstore(c);
  end loop;
end $$;

select lab.prove('the columnstore shrinks the events from about 324 MB to about 30 MB: a ratio over 9',
  (select before_compression_total_bytes::numeric / after_compression_total_bytes > 9
          and before_compression_total_bytes between 300e6 and 360e6
     from hypertable_columnstore_stats('events')));
select 'row store: ' || :rowstore_buffers || ' pages; columnstore: ' || lab.buffers(:'q') || ' pages';
select lab.prove('the same query now reads under a tenth of the pages',
  lab.buffers(:'q') * 10 < :rowstore_buffers);
select lab.prove('and the answer is unchanged',
  (select count(*) from events) = 2000000);

insert into events values (1, 1, 'deploy', '{}', '2026-10-05 12:00');
select lab.prove('continuous aggregates are materialized-only by default: a new event is invisible until a refresh',
  (select materialized_only from timescaledb_information.continuous_aggregates
    where view_name = 'events_daily')
  and (select n from events_daily where day = '2026-10-05' and kind = 'deploy') + 1
    = (select count(*) from events where kind = 'deploy'
         and created_at >= '2026-10-05' and created_at < '2026-10-06'));
call refresh_continuous_aggregate('events_daily', '2026-10-05', '2026-10-06');
select lab.prove('after a refresh of that day, it is there',
  (select n from events_daily where day = '2026-10-05' and kind = 'deploy')
    = (select count(*) from events where kind = 'deploy'
         and created_at >= '2026-10-05' and created_at < '2026-10-06'));
SQL
"${COMPOSE[@]}" exec -T timescaledb psql -X -q -c "create database upgrade_demo template template0" >/dev/null
"${COMPOSE[@]}" exec -T timescaledb psql -X -q -At -d upgrade_demo \
  -c "create extension timescaledb version '2.29.2'" >/dev/null
"${COMPOSE[@]}" exec -T timescaledb psql -X -q -At -d upgrade_demo \
  -c "alter extension timescaledb update" >/dev/null
v=$("${COMPOSE[@]}" exec -T timescaledb psql -X -At -d upgrade_demo \
  -c "select extversion from pg_extension where extname = 'timescaledb'")
prove "the image ships older TimescaleDB libraries too, so 2.29.2 updates in place to 2.30.2" \
  test "$v" = "2.30.2"

section "HypoPG: what would this index buy?"
pg <<'SQL'
create extension hypopg;
\set q 'select * from users where email = ''user4242@example.com'''
select lab.prove('without an index on email, the lookup reads all 1,126 pages of users',
  lab.nodes(:'q') = '{"Seq Scan"}' and lab.buffers(:'q') = 1126
  and pg_relation_size('users') / 8192 = 1126);
select indexrelid as hypo, hypopg_relation_size(indexrelid) as hypo_bytes
from hypopg_create_index('create index on users (email)') \gset
select lab.prove('with a hypothetical index, plain EXPLAIN picks it',
  lab.plan_text(:'q') like '%btree_users_email%');
select lab.prove('EXPLAIN ANALYZE ignores it: the query still reads all 1,126 pages',
  lab.nodes(:'q') = '{"Seq Scan"}' and lab.buffers(:'q') = 1126);
select hypopg_reset();
create index users_email on users (email);
select lab.prove('the real index reads under 5 pages',
  lab.buffers(:'q') < 5);
select lab.prove('and HypoPG''s size estimate was within 25 percent of the real one',
  :hypo_bytes::numeric / pg_relation_size('users_email') between 0.75 and 1.25);
SQL

section "pg_hint_plan: overriding the planner"
plain=$(pg <<'SQL'
load 'pg_hint_plan';
explain (costs off) select count(*) from projects p join users u on u.id = p.owner_id;
SQL
)
hinted=$(pg <<'SQL'
load 'pg_hint_plan';
explain (costs off) /*+ NestLoop(p u) */ select count(*) from projects p join users u on u.id = p.owner_id;
SQL
)
prove "left alone, the planner hash-joins projects to users" has "Hash Join" "$plain"
prove "a /*+ NestLoop(p u) */ comment forces a nested loop" has "Nested Loop" "$hinted"

section "pg_cron: jobs on a schedule"
pg <<'SQL'
create extension pg_cron;
create table heartbeats (at timestamptz not null default now());
select cron.schedule('heartbeat', '1 seconds', 'insert into heartbeats default values') \g /dev/null
select pg_sleep(6);
select cron.unschedule('heartbeat') \g /dev/null
select lab.prove('a job scheduled every second ran at least twice in six seconds, and each run is recorded',
  (select count(*) from heartbeats) >= 2
  and (select count(*) from cron.job_run_details where status = 'succeeded') >= 2);
SQL

section "pgaudit: who changed what"
pg <<'SQL'
create extension pgaudit;
create table audited (id int);
set pgaudit.log = 'write';
insert into audited values (4242);
reset pgaudit.log;
SQL
logs=$("${COMPOSE[@]}" logs postgres 2>&1)
prove "pgaudit logs the insert as a SESSION entry of class WRITE, with the statement text" \
  grep -qE "AUDIT: SESSION,[0-9]+,[0-9]+,WRITE,INSERT,,,insert into audited values \(4242\)" <<<"$logs"

section "Bloat: VACUUM FULL, pg_repack, and pg_squeeze"
pg <<'SQL'
-- Three identical tables, each updated twice, so two thirds of every one is dead space.
create table vf (id bigint primary key, n int not null, pad text not null);
insert into vf select g, 0, repeat('x', 100) from generate_series(1, 200000) g;
update vf set n = n + 1;
update vf set n = n + 1;
create table rp (like vf including all);
insert into rp select * from vf; update rp set n = n + 1; update rp set n = n + 1;
create table sq (like vf including all);
insert into sq select * from vf; update sq set n = n + 1; update sq set n = n + 1;
vacuum vf, rp, sq;
create table sizes as
  select relname::text as t, pg_table_size(oid) as bloated
  from pg_class where relname in ('vf', 'rp', 'sq');
select string_agg(t || ' ' || pg_size_pretty(bloated), ', ' order by t) from sizes;
select lab.prove('after two updates and a vacuum, each table is about 85 MB, three times its live data',
  (select bool_and(bloated between 70e6 and 100e6) from sizes));
SQL
# VACUUM FULL in the background; a reader with a short lock_timeout tries the table.
"${COMPOSE[@]}" exec -T postgres psql -X -q -d lab -c "vacuum full vf" >/dev/null &
vfpid=$!
pg <<'SQL'
create temp table seen (what text, outcome text);
do $$
declare t0 timestamptz := clock_timestamp();
begin
  loop
    -- wait until VACUUM FULL holds its lock (pg_locks is read fresh on every call)
    exit when exists (select 1 from pg_locks
                       where relation = 'vf'::regclass and mode = 'AccessExclusiveLock' and granted);
    if clock_timestamp() - t0 > interval '60 seconds' then
      raise exception 'vacuum full never started';
    end if;
    perform pg_sleep(0.005);
  end loop;
  perform set_config('lock_timeout', '1ms', true);  -- any wait at all counts
  begin
    perform count(*) from vf;
    insert into seen values ('vacuum full', 'read');
  exception when lock_not_available then
    insert into seen values ('vacuum full', 'blocked');
  end;
end $$;
select lab.prove('while VACUUM FULL runs, even a plain select waits: lock_timeout fires (55P03)',
  (select outcome from seen) = 'blocked');
SQL
wait $vfpid
pg <<'SQL'
select lab.prove('VACUUM FULL shrank the table to about a third',
  pg_table_size('vf') * 2.5 < (select bloated from sizes where t = 'vf'));
create extension pg_repack;
SQL
# pg_repack in the background. Each poll below is its own short transaction:
# pg_repack waits for every transaction older than its own to finish, so a
# session that waited for it inside one long transaction would wait forever.
"${COMPOSE[@]}" exec -T postgres pg_repack --dbname=lab --table=rp >/dev/null 2>&1 &
rppid=$!
for _ in $(seq 1 300); do
  [ "$(pg -c "select count(*) from pg_tables where schemaname = 'repack' and tablename like 'log_%'")" = 1 ] && break
  sleep 0.1
done
written=$(pg -c "set lock_timeout = '1s'" \
  -c "insert into rp values (999999, 0, 'written during the repack') returning 'written'")
prove "while pg_repack rebuilds the table, a write goes through within a 1 s lock_timeout" \
  test "$written" = "written"
wait $rppid
pg <<'SQL'
select lab.prove('pg_repack also shrank it to about a third, and kept the row written mid-copy',
  pg_table_size('rp') * 2.5 < (select bloated from sizes where t = 'rp')
  and (select pad from rp where id = 999999) = 'written during the repack'
  and (select count(*) from rp) = 200001);
create extension pg_squeeze;
select squeeze.squeeze_table('public', 'sq') \g /dev/null
select lab.prove('pg_squeeze, using logical decoding instead of triggers, gets the same result',
  pg_table_size('sq') * 2.5 < (select bloated from sizes where t = 'sq')
  and (select count(*) from sq) = 200000);
SQL

section "pg_partman: partitions made ahead of time"
pg <<'SQL'
create schema partman;
create extension pg_partman schema partman;
create table metrics (id bigint generated always as identity, at timestamptz not null, v int)
  partition by range (at);
select partman.create_parent(p_parent_table => 'public.metrics', p_control => 'at',
                             p_interval => '1 day') \g /dev/null
select lab.prove('create_parent made 4 days back, today, 4 days ahead (premake = 4), and a default partition',
  (select count(*) from pg_inherits where inhparent = 'metrics'::regclass) = 10
  and (select premake from partman.part_config where parent_table = 'public.metrics') = 4
  and exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
               where i.inhparent = 'metrics'::regclass and c.relname = 'metrics_default'));
SQL

section "Apache AGE: openCypher on Postgres tables"
pg <<'SQL'
create extension age;
load 'age';
set search_path = ag_catalog, "$user", public;
select create_graph('org') \g /dev/null
select * from cypher('org', $$
  create (:Team {name: 'Engineering'})-[:PARENT_OF]->(:Team {name: 'Platform'})
         -[:PARENT_OF]->(:Team {name: 'Databases'})-[:PARENT_OF]->(:Team {name: 'Postgres'})
$$) as (v agtype) \g /dev/null
select lab.prove('a variable-length Cypher match finds the three teams under Engineering',
  (select array_agg(name::text order by name::text) from cypher('org', $$
     match (:Team {name: 'Engineering'})-[:PARENT_OF*1..]->(t:Team) return t.name
   $$) as (name agtype)) = '{Databases,Platform,Postgres}');
select lab.prove('and the graph is stored in ordinary tables, one per label',
  exists (select 1 from pg_tables where schemaname = 'org' and tablename = 'Team')
  and exists (select 1 from pg_tables where schemaname = 'org' and tablename = 'PARENT_OF'));
SQL

echo
echo "== every claim proved ($((SECONDS - started)) s)"
