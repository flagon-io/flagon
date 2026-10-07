#!/usr/bin/env bash
# Lab for "Load it fast": the 1,000,000-row comparison, checkpoints during a
# load, and wal_level = minimal
# https://www.flagon.io/books/eight-kilobytes/loading
#
# Run: ./lab 26-loading.sh   (from this folder; Linux, macOS, or Git Bash)
#      ./lab 26              (this script after 26-loading.sql, the single-server lab)
#
# Starts two PostgreSQL 18 servers from 26-loading.compose.yml (one stock, one
# with wal_level = minimal), loads the same events-shaped rows every way the
# chapter compares, prints the table, proves the claims, and tears everything
# down, volumes included. Takes a few minutes; most of it is the slow methods.
# The mechanisms (hint bits, FREEZE, NOT VALID, COPY options, partitions,
# upserts) are proved at smaller scale in 26-loading.sql on the main lab kit.
LAB_COMPOSE=26-loading.compose.yml
. "$(dirname "$0")/lib.sh"

# sql <service> [psql args]: run psql on one server, unaligned, quiet.
sql() {
  local svc="$1"; shift
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" "$svc" \
    psql -X -q -At -v ON_ERROR_STOP=1 "$@"
}
# holds <sql>: the query returns true on the stock server; mholds: on the minimal one.
holds() { [ "$(sql pg -c "$1")" = "t" ]; }
mholds() { [ "$(sql minimal -c "$1")" = "t" ]; }

echo "starting two servers (first run pulls postgres:18.6)"
start

# The same 1,000,000 events-shaped rows on both servers: a source table, the
# same rows as a CSV file in the container, parent tables for the foreign
# keys, and the measuring helpers.
SETUP=$(cat <<'SQL'
select setseed(0.42);
create table accounts (id bigint primary key);
create table users    (id bigint primary key);
create table projects (id bigint primary key);
insert into accounts select generate_series(1, 1000);
insert into users    select generate_series(1, 100000);
insert into projects select generate_series(1, 20000);

create unlogged table src as
select g as n,
       1 + (g % 1000)::bigint               as account_id,
       1 + floor(random() * 20000)::bigint  as project_id,
       1 + floor(random() * 100000)::bigint as user_id,
       (array['deploy','deploy','build','build','build','comment','alert','login'])[1 + floor(random() * 8)::int] as kind,
       jsonb_build_object('status', (array['ok','ok','ok','failed'])[1 + floor(random() * 4)::int],
                          'duration_ms', floor(random() * 5000)::int,
                          'region', (array['iad','sfo','ams','fra','syd'])[1 + floor(random() * 5)::int]) as payload,
       timestamptz '2026-01-01 00:00+00' + g * interval '30 seconds' as created_at
from generate_series(1, 1000000) g;
alter table src add primary key (n);
vacuum analyze src;
\copy (select account_id, project_id, user_id, kind, payload, created_at from src order by n) to '/tmp/events.csv' with (format csv)

-- This session's WAL (lab.my_wal() from helpers.sql) and full-page images
-- (PostgreSQL 18+). Read them between statements, never inside a transaction
-- block.
create function my_fpi() returns bigint language sql
  as $$ select wal_fpi from pg_stat_get_backend_wal(pg_backend_pid()) $$;
create function requested_checkpoints() returns bigint language sql
  as $$ select num_requested from pg_stat_checkpointer $$;
-- A checkpoint the load requested may still be running when the load ends, and
-- the checkpointer reports it only when it finishes: wait (up to 3 minutes)
-- until the checkpointer is idle again.
create function wait_for_checkpointer() returns void language plpgsql as $$
begin
  for i in 1 .. 180 loop
    exit when exists (select 1 from pg_stat_activity
                      where backend_type = 'checkpointer' and wait_event = 'CheckpointerMain');
    perform pg_sleep(1);
  end loop;
  perform pg_sleep(1);
  perform pg_stat_clear_snapshot();
end $$;

create function fresh(name text, persistence text default '', with_pk boolean default true) returns void
language plpgsql as $$
begin
  execute format('drop table if exists %I', name);
  execute format($f$
    create %s table %I (
      id          bigint generated always as identity %s,
      account_id  bigint not null,
      project_id  bigint not null,
      user_id     bigint,
      kind        text not null,
      payload     jsonb not null default '{}',
      created_at  timestamptz not null default now()
    ) with (autovacuum_enabled = false)$f$,
    persistence, name, case when with_pk then 'primary key' else '' end);
end $$;

create unlogged table runs (
  method text primary key, n bigint, ms numeric, wal numeric, fpi bigint,
  heap bigint, idx bigint, checkpoints bigint);
create function record(m text, n bigint, t0 timestamptz, w0 numeric, f0 bigint, c0 bigint, rel regclass)
returns void language sql as $$
  insert into runs
  values (m, n, extract(epoch from clock_timestamp() - t0) * 1000, lab.my_wal() - w0, my_fpi() - f0,
          pg_relation_size(rel), pg_indexes_size(rel), requested_checkpoints() - c0)
$$;
create function rate(m text) returns numeric language sql
  as $$ select n / greatest(ms, 1) * 1000 from runs where method = m $$;
create function wal(m text) returns numeric language sql
  as $$ select wal from runs where method = m $$;
SQL
)

echo "generating 1,000,000 rows on each server"
# The shared lab helpers first: SETUP's record() calls lab.my_wal().
sql pg < helpers.sql >/dev/null
sql minimal < helpers.sql >/dev/null
sql pg <<<"$SETUP" >/dev/null
sql minimal <<<"$SETUP" >/dev/null

section "The comparison, on stock settings"
prove "the pg server runs stock WAL settings: wal_level replica, max_wal_size 1GB, checksums on" \
  holds "select current_setting('wal_level') = 'replica' and current_setting('max_wal_size') = '1GB'
                and current_setting('data_checksums') = 'on'"

sql pg <<'SQL'
\o /dev/null

-- 1. One INSERT per row, autocommit: 1,000 rows.
select fresh('l_autocommit');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
select format('insert into l_autocommit (account_id, project_id, user_id, kind, payload, created_at) values (%L, %L, %L, %L, %L, %L)',
              account_id, project_id, user_id, kind, payload, created_at)
from src where n <= 1000 order by n \gexec
select pg_stat_force_next_flush() as flushed \gset
select record('1. single-row INSERT, autocommit', 1000, :'t0', :w0, :f0, :c0, 'l_autocommit');

-- 2. The same, inside one transaction.
select fresh('l_one_tx');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
begin;
select format('insert into l_one_tx (account_id, project_id, user_id, kind, payload, created_at) values (%L, %L, %L, %L, %L, %L)',
              account_id, project_id, user_id, kind, payload, created_at)
from src where n <= 1000 order by n \gexec
commit;
select pg_stat_force_next_flush() as flushed \gset
select record('2. single-row INSERT, one transaction', 1000, :'t0', :w0, :f0, :c0, 'l_one_tx');

-- 3. Multi-row VALUES, 1,000 rows per statement.
select fresh('l_values');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
select 'insert into l_values (account_id, project_id, user_id, kind, payload, created_at) values '
       || string_agg(format('(%s, %s, %s, %L, %L::jsonb, %L::timestamptz)',
                            account_id, project_id, coalesce(user_id::text, 'null'), kind, payload, created_at), ', ' order by n)
from src group by (n - 1) / 1000 order by min(n) \gexec
select pg_stat_force_next_flush() as flushed \gset
select record('3. multi-row VALUES, 1,000 rows each', 1000000, :'t0', :w0, :f0, :c0, 'l_values');

-- 4. One prepared INSERT ... SELECT from unnest, six array parameters.
select fresh('l_unnest');
prepare load_unnest (bigint[], bigint[], bigint[], text[], jsonb[], timestamptz[]) as
  insert into l_unnest (account_id, project_id, user_id, kind, payload, created_at)
  select * from unnest($1, $2, $3, $4, $5, $6);
select array_agg(account_id order by n) as a_account, array_agg(project_id order by n) as a_project,
       array_agg(user_id order by n) as a_user, array_agg(kind order by n) as a_kind,
       array_agg(payload order by n) as a_payload, array_agg(created_at order by n) as a_created
from src \gset
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
execute load_unnest(:'a_account', :'a_project', :'a_user', :'a_kind', :'a_payload', :'a_created');
select pg_stat_force_next_flush() as flushed \gset
select record('4. INSERT ... SELECT from unnest', 1000000, :'t0', :w0, :f0, :c0, 'l_unnest');
\unset a_account
\unset a_project
\unset a_user
\unset a_kind
\unset a_payload
\unset a_created

-- 5. COPY FROM STDIN, the way psql's \copy and every driver send it.
select fresh('l_copy');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
\copy l_copy (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select record('5. COPY', 1000000, :'t0', :w0, :f0, :c0, 'l_copy');

-- 6. COPY FREEZE into a table truncated in the same transaction.
select fresh('l_freeze');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
begin;
truncate l_freeze;
\copy l_freeze (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv, freeze)
commit;
select pg_stat_force_next_flush() as flushed \gset
select record('6. COPY FREEZE', 1000000, :'t0', :w0, :f0, :c0, 'l_freeze');

-- 7. COPY into a table created in the same transaction (saves WAL only
--    under wal_level = minimal; this server is replica).
drop table if exists l_same_tx;
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
begin;
select fresh('l_same_tx');
\copy l_same_tx (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
commit;
select pg_stat_force_next_flush() as flushed \gset
select record('7. COPY, table created in the same transaction', 1000000, :'t0', :w0, :f0, :c0, 'l_same_tx');

-- 8. COPY into an unlogged table, then SET LOGGED.
select fresh('l_unlogged', 'unlogged');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
\copy l_unlogged (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select record('8a. COPY into an unlogged table', 1000000, :'t0', :w0, :f0, :c0, 'l_unlogged');
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
alter table l_unlogged set logged;
select pg_stat_force_next_flush() as flushed \gset
select record('8b. ... then ALTER TABLE SET LOGGED', 1000000, :'t0', :w0, :f0, :c0, 'l_unlogged');

-- 9. Indexes and foreign keys in place during the load.
select fresh('l_before');
create index l_before_project_created_idx on l_before (project_id, created_at);
create index l_before_account_idx on l_before (account_id);
alter table l_before
  add foreign key (account_id) references accounts (id),
  add foreign key (project_id) references projects (id),
  add foreign key (user_id) references users (id);
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
\copy l_before (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select record('9. COPY with 3 indexes and 3 FKs in place', 1000000, :'t0', :w0, :f0, :c0, 'l_before');

-- 10. Bare table, then the indexes, then the FKs NOT VALID + VALIDATE.
select fresh('l_after', '', false);
checkpoint;
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
\copy l_after (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
set maintenance_work_mem = '1GB';
alter table l_after add primary key (id);
create index l_after_project_created_idx on l_after (project_id, created_at);
create index l_after_account_idx on l_after (account_id);
reset maintenance_work_mem;
alter table l_after
  add constraint l_after_account_fk foreign key (account_id) references accounts (id) not valid,
  add constraint l_after_project_fk foreign key (project_id) references projects (id) not valid,
  add constraint l_after_user_fk    foreign key (user_id)    references users (id)    not valid;
alter table l_after validate constraint l_after_account_fk;
alter table l_after validate constraint l_after_project_fk;
alter table l_after validate constraint l_after_user_fk;
select pg_stat_force_next_flush() as flushed \gset
select record('10. COPY bare, then indexes, then FKs', 1000000, :'t0', :w0, :f0, :c0, 'l_after');

\o
select (select sum(checkpoints) from runs) as bench_checkpoints, (select sum(wal) from runs) as bench_wal,
       (select pg_size_pretty(sum(wal)) from runs) as bench_wal_pretty \gset
\pset tuples_only off
\pset format aligned
\pset footer off
select method, n as rows, round(ms) as ms, round(n / greatest(ms, 1) * 1000) as rows_per_s,
       pg_size_pretty(wal) as wal, round(wal / n) as "wal/row",
       pg_size_pretty(heap) as table, pg_size_pretty(idx) as indexes
from runs order by (regexp_match(method, '^\d+'))[1]::int, method;
\echo
\echo WAL written by all ten methods together: :bench_wal_pretty
\echo (a checkpoint ran before each method, so none of them started with a backlog)
create unlogged table bench_totals as select :bench_checkpoints::bigint as checkpoints, :bench_wal::numeric as wal;
SQL

prove "one transaction is at least 1.5x the rows per second of autocommit" \
  holds "select rate('2. single-row INSERT, one transaction') > 1.5 * rate('1. single-row INSERT, autocommit')"
prove "unnest loads at least as many rows per second as multi-row VALUES of literals (within 10%)" \
  holds "select rate('4. INSERT ... SELECT from unnest') > 0.9 * rate('3. multi-row VALUES, 1,000 rows each')"
prove "unnest is at least 2x the rows per second of single-row inserts in one transaction" \
  holds "select rate('4. INSERT ... SELECT from unnest') > 2 * rate('2. single-row INSERT, one transaction')"
prove "COPY loads more rows per second than multi-row VALUES" \
  holds "select rate('5. COPY') > rate('3. multi-row VALUES, 1,000 rows each')"
prove "COPY writes less WAL than multi-row VALUES" \
  holds "select wal('5. COPY') < wal('3. multi-row VALUES, 1,000 rows each')"
prove "COPY FREEZE writes about the same WAL as COPY (within 25%)" \
  holds "select wal('6. COPY FREEZE') < 1.25 * wal('5. COPY')"
prove "at wal_level replica, creating the table in the same transaction saves no WAL (at least 90% of COPY)" \
  holds "select wal('7. COPY, table created in the same transaction') > 0.9 * wal('5. COPY')"
prove "COPY into an unlogged table writes under 1% of the WAL of a logged COPY" \
  holds "select wal('8a. COPY into an unlogged table') < 0.01 * wal('5. COPY')"
prove "SET LOGGED writes WAL about the size of the table and its index (0.7x to 1.3x)" \
  holds "select wal between 0.7 * (heap + idx) and 1.3 * (heap + idx) from runs where method = '8b. ... then ALTER TABLE SET LOGGED'"
prove "loading bare and building indexes and FKs afterwards takes less total time" \
  holds "select (select ms from runs where method like '10.%') < (select ms from runs where method like '9.%')"
prove "and writes less WAL" \
  holds "select wal('10. COPY bare, then indexes, then FKs') < wal('9. COPY with 3 indexes and 3 FKs in place')"
prove "the (project_id, created_at) index is at least 15% bigger when it grew during the load" \
  holds "select pg_relation_size('l_before_project_created_idx') > 1.15 * pg_relation_size('l_after_project_created_idx')"
prove "the whole benchmark wrote more WAL than max_wal_size (1GB), enough to force checkpoints by volume" \
  holds "select wal > pg_size_bytes(current_setting('max_wal_size')) from bench_totals"

section "max_wal_size: checkpoints during a load"
# The same 500,000-row load (primary key plus two indexes) twice: once with a
# small max_wal_size, once with a large one. checkpoint_timeout goes to 1h so
# no timed checkpoint lands in either window.
load_with_indexes() {
  sql pg <<SQL
alter system set max_wal_size = '$1';
alter system set checkpoint_timeout = '1h';
select pg_reload_conf();
select pg_sleep(1);
checkpoint;
select fresh('l_ckpt');
create index on l_ckpt (project_id, created_at);
create index on l_ckpt (account_id);
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
insert into l_ckpt (account_id, project_id, user_id, kind, payload, created_at)
select account_id, project_id, user_id, kind, payload, created_at from src where n <= 500000 order by n;
select wait_for_checkpointer();
select pg_stat_force_next_flush() as flushed \gset
select record('max_wal_size = $1', 500000, :'t0', :w0, :f0, :c0, 'l_ckpt');
SQL
}
load_with_indexes 128MB >/dev/null
load_with_indexes 16GB >/dev/null
sql pg -c "alter system reset max_wal_size" -c "alter system reset checkpoint_timeout" -c "select pg_reload_conf()" >/dev/null

sql pg -P tuples_only=off -P format=aligned -P footer=off -c "
select method, round(ms) as ms, pg_size_pretty(wal) as wal, fpi as full_page_images,
       checkpoints as requested_checkpoints
from runs where method like 'max_wal_size%' order by method"

prove "with max_wal_size = 128MB the load forced at least one checkpoint" \
  holds "select checkpoints >= 1 from runs where method = 'max_wal_size = 128MB'"
prove "with max_wal_size = 16GB it forced none" \
  holds "select checkpoints = 0 from runs where method = 'max_wal_size = 16GB'"
prove "the extra checkpoints cost full-page images: at least 5x as many as the run without them" \
  holds "select (select fpi from runs where method = 'max_wal_size = 128MB')
                > 5 * ((select fpi from runs where method = 'max_wal_size = 16GB') + 100)"

section "wal_level = minimal: create (or truncate) and load in one transaction"
prove "the minimal server runs wal_level minimal with max_wal_senders 0" \
  mholds "select current_setting('wal_level') = 'minimal' and current_setting('max_wal_senders') = '0'"

sql minimal <<'SQL' >/dev/null
-- A table that already existed before the loading transaction.
select fresh('m_existing');
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
\copy m_existing (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
select pg_stat_force_next_flush() as flushed \gset
select record('minimal: COPY into an existing table', 1000000, :'t0', :w0, :f0, :c0, 'm_existing');

-- Created in the same transaction, primary key included.
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
begin;
select fresh('m_new');
\copy m_new (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
commit;
select pg_stat_force_next_flush() as flushed \gset
select record('minimal: CREATE TABLE + COPY in one transaction', 1000000, :'t0', :w0, :f0, :c0, 'm_new');

-- Truncated in the same transaction.
select pg_stat_force_next_flush() as flushed \gset
select clock_timestamp() as t0, lab.my_wal() as w0, my_fpi() as f0, requested_checkpoints() as c0 \gset
begin;
truncate m_existing;
\copy m_existing (account_id, project_id, user_id, kind, payload, created_at) from '/tmp/events.csv' with (format csv)
commit;
select pg_stat_force_next_flush() as flushed \gset
select record('minimal: TRUNCATE + COPY in one transaction', 1000000, :'t0', :w0, :f0, :c0, 'm_existing');
SQL

sql minimal -P tuples_only=off -P format=aligned -P footer=off -c "
select method, round(ms) as ms, round(n / greatest(ms, 1) * 1000) as rows_per_s,
       pg_size_pretty(wal) as wal, pg_size_pretty(heap) as table
from runs where method like 'minimal%' order by method"

prove "at wal_level minimal, a COPY into a table that already existed still writes full WAL (over 100 MB)" \
  mholds "select wal > 100 * 1024 * 1024 from runs where method = 'minimal: COPY into an existing table'"
prove "created in the same transaction: under 1% of that WAL" \
  mholds "select (select wal from runs where method = 'minimal: CREATE TABLE + COPY in one transaction')
                < 0.01 * (select wal from runs where method = 'minimal: COPY into an existing table')"
prove "truncated in the same transaction: under 2% (a few MB, not 184)" \
  mholds "select (select wal from runs where method = 'minimal: TRUNCATE + COPY in one transaction')
                < 0.02 * (select wal from runs where method = 'minimal: COPY into an existing table')"

# Skipping WAL is still crash-safe: the commit fsyncs the new files instead.
"${COMPOSE[@]}" kill -s SIGKILL minimal >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d minimal >/dev/null 2>&1 || true
# Crash recovery can take a while on a busy machine: wait until it answers.
for _ in $(seq 1 180); do
  if sql minimal -c "select 1" >/dev/null 2>&1; then break; fi
  sleep 1
done
prove "the minimal server went through crash recovery (its log says it was not properly shut down)" \
  grep -q "not properly shut down" <<<"$("${COMPOSE[@]}" logs --no-log-prefix minimal 2>/dev/null)"
prove "after SIGKILL and crash recovery, both WAL-skipping loads are intact: 1,000,000 rows each" \
  mholds "select (select count(*) from m_new) = 1000000 and (select count(*) from m_existing) = 1000000"

echo
echo "== 26-loading.sh: all claims proved in $((SECONDS - started)) s"
