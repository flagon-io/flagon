#!/usr/bin/env bash
# Lab for "Where Postgres loses"
# https://www.flagon.io/books/eight-kilobytes/limits
#
# Run: ./lab 40          (from this folder; Linux, macOS, or Git Bash)
#      KEEP=1 ./lab 40   (leave everything up to explore; then
#        docker compose -f 40-limits.compose.yml exec postgres psql -d limits
#        docker compose -f 40-limits.compose.yml exec clickhouse clickhouse-client
#        docker compose -f 40-limits.compose.yml run --rm duckdb /duckdb /xfer/events.duckdb
#        and docker compose -f 40-limits.compose.yml down -v when done)
#
# Starts PostgreSQL 18 (with the book's seed), a second PostgreSQL 18 with the
# pg_duckdb extension, ClickHouse 26.8, and the DuckDB 1.5 command-line client
# from 40-limits.compose.yml. Exports the two
# million events from Postgres with COPY, loads the same rows into both column
# stores, checks that all three return the same answers, then compares bytes
# on disk, bytes read, and time for three analytical queries, and finally
# what the column stores give up. Every claim prints PROVED; the first one
# that doesn't hold stops the run, and everything is torn down again,
# volumes included. Timings are printed for you to compare; the checks on
# them are deliberately loose, because your machine is not ours.
#
# Memory: each service is capped at 3 GB. The heavy steps run one at a time.
LAB_COMPOSE=40-limits.compose.yml
. "$(dirname "$0")/lib.sh"
HOLDER=ek-limits-duckdb-holder
# The container that holds the DuckDB file open goes on every exit, KEEP or not.
tidy() { docker rm -f "$HOLDER" >/dev/null 2>&1 || true; }
cleanup() { tidy; "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }

has() { grep -qF -- "$1" <<<"$2"; }
# awk does the arithmetic: holds 'a < b / 5' is true or false.
holds() { awk "BEGIN { exit !($1) }"; }

# pg [psql args]: psql in the lab database, quiet and unaligned, UTC.
pg() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning -c timezone=UTC" postgres \
    psql -X -q -At -v ON_ERROR_STOP=1 -d limits "$@"
}
# pgd [psql args]: the second Postgres server, the one with pg_duckdb.
pgd() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning -c timezone=UTC" pgduckdb \
    psql -X -q -At -v ON_ERROR_STOP=1 "$@"
}
# ch [clickhouse-client args]: one query, or several on stdin with -n.
ch() { "${COMPOSE[@]}" exec -T clickhouse clickhouse-client "$@"; }
# duck [duckdb args]: the DuckDB CLI against the database file on the shared volume.
duck() { "${COMPOSE[@]}" run --rm -T duckdb /duckdb "$@" 2>/dev/null; }

echo "starting PostgreSQL 18, ClickHouse 26.8, and DuckDB 1.5 (the first run pulls the images"
echo "and seeds two million events; allow a few minutes)"
start

section "Loading the same rows into three systems"
"${COMPOSE[@]}" exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -c "create database limits template book" >/dev/null
# The postgres user writes the export; the ClickHouse server reads it.
"${COMPOSE[@]}" exec -T -u root postgres chmod 777 /xfer
pg >/dev/null <<'SQL'
-- The events as the book stores them, plus the same rows with the payload
-- fields as typed columns: the fair row-store baseline for a column store.
create table events_flat as
select id, account_id, project_id, user_id, kind,
       payload->>'status'              as status,
       (payload->>'duration_ms')::int  as duration_ms,
       payload->>'region'              as region,
       created_at
from events order by id;
alter table events_flat add primary key (id);
vacuum analyze events_flat;
copy (select * from events_flat order by id) to '/xfer/events.csv' with (format csv, header);
-- Best-of-n wall-clock time of a statement, in milliseconds.
create function lab.ms(query text, runs int default 3) returns numeric
language plpgsql as $$
declare best numeric; t0 timestamptz; el numeric;
begin
  for i in 1 .. runs loop
    t0 := clock_timestamp();
    execute query;
    el := extract(epoch from clock_timestamp() - t0) * 1000;
    if best is null or el < best then best := el; end if;
  end loop;
  return round(best);
end $$;
SQL
"${COMPOSE[@]}" exec -T -u root postgres chmod a+r /xfer/events.csv

ch -n --date_time_input_format=best_effort <<'SQL'
create table events (
  id          Int64,
  account_id  Int64,
  project_id  Int64,
  user_id     Nullable(Int64),
  kind        LowCardinality(String),
  status      LowCardinality(String),
  duration_ms Int32,
  region      LowCardinality(String),
  created_at  DateTime64(6, 'UTC')
) engine = MergeTree
order by (project_id, created_at);
insert into events select * from file('xfer/events.csv', CSVWithNames);
optimize table events final;
SQL

duck /xfer/events.duckdb >/dev/null <<'SQL'
create table events (
  id          bigint primary key,
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  status      text,
  duration_ms integer,
  region      text,
  created_at  timestamptz not null
);
insert into events
select * from read_csv('/xfer/events.csv', header = true, columns = {
  'id': 'bigint', 'account_id': 'bigint', 'project_id': 'bigint', 'user_id': 'bigint',
  'kind': 'varchar', 'status': 'varchar', 'duration_ms': 'integer', 'region': 'varchar',
  'created_at': 'timestamptz'});
checkpoint;
SQL

pgd >/dev/null <<'SQL'
create table events (
  id          bigint primary key,
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  status      text,
  duration_ms int,
  region      text,
  created_at  timestamptz not null
);
copy events from '/xfer/events.csv' with (format csv, header);
vacuum analyze events;
SQL

pg_n=$(pg -c "select count(*) from events")
ch_n=$(ch -q "select count() from events")
duck_n=$(duck -readonly -csv -noheader /xfer/events.duckdb -c "select count(*) from events" | tr -d '\r')
echo "  rows: postgres $pg_n, clickhouse $ch_n, duckdb $duck_n"
prove "all three hold the same 2,000,000 events" \
  test "$pg_n" = 2000000 -a "$ch_n" = 2000000 -a "$duck_n" = 2000000
echo "  versions: postgres $(pg -c 'show server_version' | cut -d' ' -f1)," \
  "clickhouse $(ch -q 'select version()'), duckdb $(duck -csv -noheader -c 'select version()' | tr -d '\r')"

section "All three give the same answers"
# 1. events per kind per day over the year
# 2. p95 of duration_ms per region (linear interpolation in all three)
# 3. the ten busiest projects, with their average duration
pg_q1=$(pg -A -F, -c "select kind, (created_at at time zone 'UTC')::date, count(*) from events group by 1, 2 order by 1, 2")
ch_q1=$(ch -q "select kind, toDate(created_at) as day, count() from events group by kind, day order by kind, day format CSV" | tr -d '"')
duck_q1=$(duck -readonly -csv -noheader /xfer/events.duckdb -c "set TimeZone = 'UTC'; select kind, created_at::date, count(*) from events group by all order by 1, 2" | tr -d '\r')
prove "kind by day: 1,826 groups, identical in all three" \
  test "$(wc -l <<<"$pg_q1" | tr -d ' ')" = 1826 -a "$pg_q1" = "$ch_q1" -a "$pg_q1" = "$duck_q1"

pg_q2=$(pg -A -F, -c "select payload->>'region', percentile_cont(0.95) within group (order by (payload->>'duration_ms')::int)::int from events group by 1 order by 1")
ch_q2=$(ch -q "select region, toInt32(quantileExactInclusive(0.95)(duration_ms)) from events group by region order by region format CSV" | tr -d '"')
duck_q2=$(duck -readonly -csv -noheader /xfer/events.duckdb -c "select region, quantile_cont(duration_ms, 0.95)::int from events group by region order by region" | tr -d '\r')
echo "$pg_q2" | sed 's/^/  p95 /'
prove "p95 of duration_ms by region is identical in all three" \
  test "$pg_q2" = "$ch_q2" -a "$pg_q2" = "$duck_q2"

pg_q3=$(pg -A -F, -c "select project_id, count(*), round(avg((payload->>'duration_ms')::int) * 10) from events group by 1 order by 2 desc, 1 limit 10")
ch_q3=$(ch -q "select project_id, count() as n, round(avg(duration_ms) * 10) from events group by project_id order by n desc, project_id limit 10 format CSV")
duck_q3=$(duck -readonly -csv -noheader /xfer/events.duckdb -c "select project_id, count(*), round(avg(duration_ms) * 10)::bigint from events group by 1 order by 2 desc, 1 limit 10" | tr -d '\r')
prove "the ten busiest of 20,000 projects are identical in all three" \
  test "$pg_q3" = "$ch_q3" -a "$pg_q3" = "$duck_q3"

section "Bytes on disk"
read -r pg_events pg_flat < <(pg -F' ' -c "select pg_total_relation_size('events'), pg_total_relation_size('events_flat')")
ch_bytes=$(ch -q "select sum(bytes_on_disk) from system.parts where database = currentDatabase() and table = 'events' and active")
duck_bytes=$("${COMPOSE[@]}" exec -T postgres stat -c %s /xfer/events.duckdb | tr -d '\r')
mb() { awk "BEGIN { printf \"%.1f MB\", $1 / 1048576 }"; }
echo "  postgres, events as the book stores them (jsonb payload), heap + indexes: $(mb "$pg_events")"
echo "  postgres, the same rows with typed columns, heap + primary key:         $(mb "$pg_flat")"
echo "  clickhouse, compressed parts:                                            $(mb "$ch_bytes")"
echo "  duckdb, database file:                                                   $(mb "$duck_bytes")"
ch -q "select name, data_compressed_bytes, data_uncompressed_bytes from system.columns
       where database = currentDatabase() and table = 'events' order by data_compressed_bytes desc format TSV" |
  awk '{ printf "    %-12s %6.1f MB compressed, %6.1f MB raw\n", $1, $2 / 1048576, $3 / 1048576 }'
prove "ClickHouse stores the events in under a fifth of the bytes of Postgres's typed-column table" \
  holds "$ch_bytes * 5 < $pg_flat"
prove "DuckDB does too" holds "$duck_bytes * 5 < $pg_flat"
prove "against the table as the book stores it (jsonb payload), both column stores are 8 to 12 times smaller" \
  holds "$pg_events / $ch_bytes > 8 && $pg_events / $ch_bytes < 12 && $pg_events / $duck_bytes > 8 && $pg_events / $duck_bytes < 12"

section "Rows and bytes read"
Q1_PG="select kind, date_trunc('day', created_at), count(*) from events group by 1, 2"
Q2_PG="select payload->>'region', percentile_cont(0.95) within group (order by (payload->>'duration_ms')::int) from events group by 1"
Q3_PG="select project_id, count(*), avg((payload->>'duration_ms')::int) from events group by 1 order by 2 desc, 1 limit 10"
Q1_FLAT="select kind, date_trunc('day', created_at), count(*) from events_flat group by 1, 2"
Q2_FLAT="select region, percentile_cont(0.95) within group (order by duration_ms) from events_flat group by 1"
Q3_FLAT="select project_id, count(*), avg(duration_ms) from events_flat group by 1 order by 2 desc, 1 limit 10"
Q1_CH="select kind, toDate(created_at) as day, count() from events group by kind, day"
Q2_CH="select region, quantileExactInclusive(0.95)(duration_ms) from events group by region"
Q3_CH="select project_id, count() as n, avg(duration_ms) from events group by project_id order by n desc, project_id limit 10"
Q1_DUCK="select kind, date_trunc('day', created_at), count(*) from events group by all"
Q2_DUCK="select region, quantile_cont(duration_ms, 0.95) from events group by region"
Q3_DUCK="select project_id, count(*), avg(duration_ms) from events group by 1 order by 2 desc, 1 limit 10"

pg_pages=$(pg -F' ' -c "select lab.buffers(\$q\$$Q1_PG\$q\$), lab.buffers(\$q\$$Q2_PG\$q\$), lab.buffers(\$q\$$Q3_PG\$q\$),
                                 lab.buffers(\$q\$$Q1_FLAT\$q\$), (select relpages from pg_class where relname = 'events'),
                                 (select relpages from pg_class where relname = 'events_flat')")
read -r pg_p1 pg_p2 pg_p3 flat_p1 events_relpages flat_relpages <<<"$pg_pages"
echo "  postgres reads $pg_p1, $pg_p2, and $pg_p3 pages for the three queries (the table has $events_relpages);"
echo "  the typed-column table: $flat_p1 of $flat_relpages pages"
# Parallel workers each count a few pages of their own, so allow 1 percent over.
prove "Postgres reads every page of events, 35,173 pages (275 MB), for each of the three queries" \
  holds "$events_relpages == 35173 && $pg_p1 >= 35173 && $pg_p2 >= 35173 && $pg_p3 >= 35173 && $pg_p1 < 35173 * 1.01 && $pg_p2 < 35173 * 1.01 && $pg_p3 < 35173 * 1.01"
prove "typed columns shrink the heap to 22,784 pages, and every query still reads all of them" \
  test "$flat_p1" = 22784 -a "$flat_relpages" = 22784

# Run each ClickHouse query three times, tagged, at its default thread
# count, then three more times on one thread; the query log has the rest.
for q in 1 2 3; do
  var="Q${q}_CH"
  for i in 1 2 3; do ch -q "${!var} settings log_comment = 'ek_q$q' format Null"; done
  for i in 1 2 3; do ch -q "${!var} settings log_comment = 'ek_s$q', max_threads = 1 format Null"; done
done
ch -q "system flush logs"
chlog() {
  ch -q "select $1 from system.query_log where type = 'QueryFinish' and log_comment = '$2' order by event_time_microseconds desc limit 1"
}
for q in 1 2 3; do
  rows=$(chlog read_rows "ek_q$q"); raw=$(chlog read_bytes "ek_q$q")
  comp=$(chlog "ProfileEvents['ReadCompressedBytes']" "ek_q$q")
  printf -v "ch_rows$q" %s "$rows"; printf -v "ch_raw$q" %s "$raw"; printf -v "ch_comp$q" %s "$comp"
  echo "  clickhouse q$q: $rows rows, $(mb "$raw") of column data, $(mb "$comp") compressed read from disk"
done
prove "ClickHouse also reads all 2,000,000 rows for each query, but only the columns it needs: 5 bytes a row for region and duration_ms" \
  test "$ch_rows1" = 2000000 -a "$ch_rows2" = 2000000 -a "$ch_rows3" = 2000000 -a "$ch_raw2" = 10000000
prove "for every query, ClickHouse reads under a tenth of the bytes Postgres reads" \
  holds "$ch_comp1 * 10 < $pg_p1 * 8192 && $ch_comp2 * 10 < $pg_p2 * 8192 && $ch_comp3 * 10 < $pg_p3 * 8192"

section "Time on this machine (best of three, warm cache)"
read -r pg_t1 pg_t2 pg_t3 < <(pg -F' ' -c "select lab.ms(\$q\$$Q1_PG\$q\$), lab.ms(\$q\$$Q2_PG\$q\$), lab.ms(\$q\$$Q3_PG\$q\$)")
read -r flat_t1 flat_t2 flat_t3 < <(pg -F' ' -c "select lab.ms(\$q\$$Q1_FLAT\$q\$), lab.ms(\$q\$$Q2_FLAT\$q\$), lab.ms(\$q\$$Q3_FLAT\$q\$)")
read -r pg_s1 pg_s2 pg_s3 < <(pg -F' ' -c "set max_parallel_workers_per_gather = 0" \
  -c "select lab.ms(\$q\$$Q1_PG\$q\$), lab.ms(\$q\$$Q2_PG\$q\$), lab.ms(\$q\$$Q3_PG\$q\$)")
# Stock Postgres is deliberately conservative: 4 MB of work_mem (the p95 sort
# spills to disk) and at most two parallel workers. So the typed table also
# runs with 256 MB of work_mem and up to 8 workers, and on one core with the
# same work_mem: the fairest row-store baseline we could give it.
TUNED="set work_mem = '256MB'"
read -r flat_s1 flat_s2 flat_s3 < <(pg -F' ' -c "set max_parallel_workers_per_gather = 0" \
  -c "select lab.ms(\$q\$$Q1_FLAT\$q\$), lab.ms(\$q\$$Q2_FLAT\$q\$), lab.ms(\$q\$$Q3_FLAT\$q\$)")
read -r tuned_t1 tuned_t2 tuned_t3 < <(pg -F' ' -c "$TUNED" -c "set max_parallel_workers_per_gather = 8" \
  -c "select lab.ms(\$q\$$Q1_FLAT\$q\$), lab.ms(\$q\$$Q2_FLAT\$q\$), lab.ms(\$q\$$Q3_FLAT\$q\$)")
read -r tuned_s1 tuned_s2 tuned_s3 < <(pg -F' ' -c "$TUNED" -c "set max_parallel_workers_per_gather = 0" \
  -c "select lab.ms(\$q\$$Q1_FLAT\$q\$), lab.ms(\$q\$$Q2_FLAT\$q\$), lab.ms(\$q\$$Q3_FLAT\$q\$)")
spill=$(pg -c "explain (analyze, costs off, timing off, summary off) $Q2_FLAT" | grep -c "Disk:" || true)
spill_tuned=$(pg -c "$TUNED" -c "explain (analyze, costs off, timing off, summary off) $Q2_FLAT" | grep -c "Disk:" || true)
echo "  p95 sort nodes that spilled to disk: $spill with stock work_mem, $spill_tuned with 256 MB"
for q in 1 2 3; do
  printf -v "ch_t$q" %s "$(ch -q "select min(query_duration_ms) from system.query_log where type = 'QueryFinish' and log_comment = 'ek_q$q'")"
  printf -v "ch_s$q" %s "$(ch -q "select min(query_duration_ms) from system.query_log where type = 'QueryFinish' and log_comment = 'ek_s$q'")"
done
# duck_times <threads>: best-of-three milliseconds for the three queries.
duck_times() {
  {
    echo "set TimeZone = 'UTC';"
    [ "$1" = default ] || echo "set threads = $1;"
    echo ".timer on"
    for q in 1 2 3; do var="Q${q}_DUCK"; for i in 1 2 3; do echo "${!var};"; done; done
  } | duck -readonly /xfer/events.duckdb |
    awk '/^Run Time/ { t[n++] = $5 * 1000 }
         END { for (q = 0; q < 3; q++) { b = t[3*q]; for (i = 1; i < 3; i++) if (t[3*q+i] < b) b = t[3*q+i]; printf "%d ", b + 0.5 } }'
}
read -r duck_t1 duck_t2 duck_t3 <<<"$(duck_times default)"
read -r duck_s1 duck_s2 duck_s3 <<<"$(duck_times 1)"
cores=$("${COMPOSE[@]}" exec -T clickhouse nproc | tr -d '\r')
echo "  milliseconds        kind by day   p95 by region   top projects"
printf '  %-18s %11s %15s %14s\n' \
  "postgres (jsonb)" "$pg_t1" "$pg_t2" "$pg_t3" \
  "postgres (typed)" "$flat_t1" "$flat_t2" "$flat_t3" \
  "postgres (tuned)" "$tuned_t1" "$tuned_t2" "$tuned_t3" \
  "clickhouse" "$ch_t1" "$ch_t2" "$ch_t3" \
  "duckdb" "$duck_t1" "$duck_t2" "$duck_t3"
echo "  one core each (postgres without parallel workers, max_threads = 1, threads = 1):"
printf '  %-18s %11s %15s %14s\n' \
  "postgres (jsonb)" "$pg_s1" "$pg_s2" "$pg_s3" \
  "postgres (typed)" "$flat_s1" "$flat_s2" "$flat_s3" \
  "postgres (tuned)" "$tuned_s1" "$tuned_s2" "$tuned_s3" \
  "clickhouse" "$ch_s1" "$ch_s2" "$ch_s3" \
  "duckdb" "$duck_s1" "$duck_s2" "$duck_s3"
echo "  ($cores cores visible to the containers)"
pg_sum=$((pg_t1 + pg_t2 + pg_t3)); ch_sum=$((ch_t1 + ch_t2 + ch_t3)); duck_sum=$((duck_t1 + duck_t2 + duck_t3))
tuned_sum=$((tuned_t1 + tuned_t2 + tuned_t3)); tuned_one=$((tuned_s1 + tuned_s2 + tuned_s3))
pg_one=$((pg_s1 + pg_s2 + pg_s3)); ch_one=$((ch_s1 + ch_s2 + ch_s3)); duck_one=$((duck_s1 + duck_s2 + duck_s3))
echo "  three-query totals: postgres jsonb $pg_sum, tuned $tuned_sum; clickhouse $ch_sum; duckdb $duck_sum"
echo "  on one core: postgres jsonb $pg_one, tuned $tuned_one; clickhouse $ch_one; duckdb $duck_one"
prove "with stock work_mem, the p95 sort spills to disk; with 256 MB it doesn't" \
  test "$spill" -gt 0 -a "$spill_tuned" = 0
prove "against tuned, typed Postgres, both column stores answer the three queries at least 3 times faster" \
  holds "$ch_sum * 3 < $tuned_sum && $duck_sum * 3 < $tuned_sum"
prove "on one core each, against the same tuned, typed table, they are still at least twice as fast" \
  holds "$ch_one * 2 < $tuned_one && $duck_one * 2 < $tuned_one"

section "What the column stores give up"
# The first lookup in a session also reads some catalog pages; count the second.
pg_point=$(pg -c "select lab.buffers('select * from events where id = 4242')" \
              -c "select lab.buffers('select * from events where id = 4242')" | tail -n 1)
ch -q "select * from events where id = 4242 settings log_comment = 'ek_p1' format Null"
ch -q "select * from events where project_id = 4242 and created_at >= '2026-06-01' and created_at < '2026-06-02' settings log_comment = 'ek_p2' format Null"
ch -q "system flush logs"
ch_point=$(chlog read_rows ek_p1); ch_key=$(chlog read_rows ek_p2)
echo "  one event by id: postgres $pg_point pages; clickhouse $ch_point rows"
echo "  one project's day, which is ClickHouse's sort key: $ch_key rows"
prove "Postgres finds one event by id in 4 pages through its primary key index" test "$pg_point" = 4
prove "ClickHouse has no index on id (its sort key is project_id, created_at), so it reads all 2,000,000 rows" \
  test "$ch_point" = 2000000
prove "even on its sort key, ClickHouse reads a whole granule: 8,192 rows to find a handful" \
  test "$ch_key" = 8192

out=$(pg -c "insert into events_flat values (1, 1, 1, 1, 'deploy', 'ok', 1, 'iad', '2026-10-01 12:00:00+00')" 2>&1 || true)
prove "Postgres rejects a second event with id 1" has "duplicate key value violates unique constraint" "$out"
ch -q "insert into events values (1, 1, 1, 1, 'deploy', 'ok', 1, 'iad', '2026-10-01 12:00:00')"
prove "ClickHouse accepts it: a MergeTree primary key is a sort order, not a constraint" \
  test "$(ch -q "select count() from events where id = 1")" = 2
out=$(echo "insert into events values (1, 1, 1, 1, 'deploy', 'ok', 1, 'iad', '2026-10-01 12:00:00+00');" |
  "${COMPOSE[@]}" run --rm -T duckdb /duckdb /xfer/events.duckdb 2>&1 || true)
prove "DuckDB rejects it: it enforces primary keys" has "violates primary key constraint" "$out"

pg_wal=$(pg -c "select lab.wal_bytes('update events_flat set status = ''ok'' where id = 2')")
ch -q "alter table events update status = 'ok' where id = 2 settings mutations_sync = 1"
ch -q "system flush logs"
ch_mut=$(ch -q "select max(rows) from system.part_log where table = 'events' and event_type = 'MutatePart'")
echo "  updating one row: postgres writes $pg_wal bytes of WAL; clickhouse's mutation rewrote a part of $ch_mut rows"
prove "Postgres updates one row with under 1 KB of WAL" holds "$pg_wal < 1024"
prove "a ClickHouse ALTER TABLE ... UPDATE of one row rewrites a part of 2,000,000 rows" test "$ch_mut" = 2000000
out=$(ch -q "begin transaction" 2>&1 || true)
prove "ClickHouse has no multi-statement transactions at its default settings" has "Transactions are not supported" "$out"

# One process holds the DuckDB file open for writing; a second can't open it.
"${COMPOSE[@]}" run -d -i --name "$HOLDER" duckdb /duckdb /xfer/events.duckdb >/dev/null 2>&1
sleep 3
out=$("${COMPOSE[@]}" run --rm -T duckdb /duckdb /xfer/events.duckdb -c "select 1" 2>&1 || true)
docker rm -f "$HOLDER" >/dev/null 2>&1
prove "DuckDB is one process: while one has the file open for writing, a second can't open it" \
  has "Could not set lock on file" "$out"

section "The middle ground: DuckDB's executor inside Postgres (pg_duckdb)"
echo "  pg_duckdb extension version $(pgd -c "select extversion from pg_extension where extname = 'pg_duckdb'") on PostgreSQL $(pgd -c 'show server_version' | cut -d' ' -f1), typed-column events"
pgd_q2=$(pgd -A -F, -c "set duckdb.force_execution = true" \
  -c "select region, (percentile_cont(0.95) within group (order by duration_ms))::int from events group by 1 order by 1")
prove "with duckdb.force_execution on, pg_duckdb returns the same p95s" test "$pgd_q2" = "$pg_q2"
# pgd_times <on|off>: best-of-three milliseconds for the three queries, from psql's \timing.
pgd_times() {
  {
    echo "set duckdb.force_execution = $1;"
    echo "\timing on"
    for q in 1 2 3; do var="Q${q}_FLAT"; for i in 1 2 3; do echo "${!var//events_flat/events} \g /dev/null"; done; done
  } | pgd |
    awk '/^Time:/ { t[n++] = $2 }
         END { for (q = 0; q < 3; q++) { b = t[3*q]; for (i = 1; i < 3; i++) if (t[3*q+i] < b) b = t[3*q+i]; printf "%d ", b + 0.5 } }'
}
read -r pgd_off1 pgd_off2 pgd_off3 <<<"$(pgd_times off)"
read -r pgd_on1 pgd_on2 pgd_on3 <<<"$(pgd_times on)"
echo "  milliseconds        kind by day   p95 by region   top projects"
printf '  %-18s %11s %15s %14s\n' \
  "postgres executor" "$pgd_off1" "$pgd_off2" "$pgd_off3" \
  "duckdb executor" "$pgd_on1" "$pgd_on2" "$pgd_on3" \
  "duckdb, own file" "$duck_t1" "$duck_t2" "$duck_t3"
prove "on the same server and table, pg_duckdb computes the p95s at least twice as fast as Postgres's executor" \
  holds "$pgd_on2 * 2 < $pgd_off2"
pgd_pages=$(pgd <<'SQL'
select pg_stat_force_next_flush() \g /dev/null
select heap_blks_hit + heap_blks_read as before from pg_statio_user_tables where relname = 'events' \gset
set duckdb.force_execution = true;
select region, percentile_cont(0.95) within group (order by duration_ms) from events group by 1 \g /dev/null
reset duckdb.force_execution;
select pg_stat_force_next_flush() \g /dev/null
select pg_sleep(1) \g /dev/null
select heap_blks_hit + heap_blks_read - :before, relpages
from pg_statio_user_tables s join pg_class c on c.oid = s.relid where s.relname = 'events';
SQL
)
read -r pgd_read pgd_relpages <<<"${pgd_pages//|/ }"
echo "  pg_duckdb read $pgd_read heap pages for the p95 query; the table has $pgd_relpages"
prove "but it still reads every 8 KB page of the row-store heap" holds "$pgd_read >= $pgd_relpages && $pgd_relpages > 22000"
prove "so DuckDB on its own columnar file answers the three queries at least 3 times faster than pg_duckdb over a heap" \
  holds "$duck_sum * 3 < $pgd_on1 + $pgd_on2 + $pgd_on3"

section "The middle ground: a rollup in Postgres"
pg >/dev/null <<'SQL'
create table events_daily as
select kind, (created_at at time zone 'UTC')::date as day, count(*) as n
from events group by 1, 2;
vacuum analyze events_daily;
SQL
roll_pages=$(pg -c "select lab.buffers('select kind, day, n from events_daily')")
echo "  the kind-by-day rollup: $(pg -c 'select count(*) from events_daily') rows on $roll_pages pages"
prove "a daily rollup answers kind by day from under 20 pages instead of 35,173" holds "$roll_pages < 20"
prove "and gives the same answer" \
  test "$(pg -A -F, -c "select kind, day, n from events_daily order by 1, 2")" = "$pg_q1"

echo
echo "done in $((SECONDS - started)) s"
