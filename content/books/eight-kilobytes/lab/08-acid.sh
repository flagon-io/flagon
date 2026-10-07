#!/usr/bin/env bash
# Lab for "ACID, honestly": the crash tests
# https://www.flagon.io/books/eight-kilobytes/acid
#
# Run: ./lab 08-acid.sh   (from this folder; Linux, macOS, or Git Bash)
#      ./lab 08           (this script after 08-acid.sql, the single-server lab)
#
# Starts one PostgreSQL 18 server from 08-acid.compose.yml, commits rows in
# different ways, kills the server with SIGKILL (the whole container, so
# shared memory and the WAL buffers in it are gone), restarts it, and proves
# what survived. Tears everything down at the end, volume included.
# Every claim prints PROVED; the first one that doesn't hold stops the run.
#
# What this does NOT test: a power cut. Killing a container leaves the host
# kernel running, so anything Postgres had already handed to the operating
# system (written, not yet fsynced) survives. This lab shows the window
# between "COMMIT returned" and "WAL left Postgres's memory".
LAB_COMPOSE=08-acid.compose.yml
. "$(dirname "$0")/lib.sh"

# sql [psql args]: run psql on the server, unaligned, quiet.
sql() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres \
    psql -X -q -At -v ON_ERROR_STOP=1 "$@"
}
# holds <sql>: the query returns true.
holds() { [ "$(sql -c "$1")" = "t" ]; }
has() { grep -qF -- "$1" <<<"$2"; }
# fails_with <needle> <sql>: the statement errors, mentioning needle.
fails_with() {
  local needle="$1" out
  shift
  if out=$(sql "$@" 2>&1); then return 1; fi
  has "$needle" "$out"
}

# crash: SIGKILL the server (no shutdown checkpoint, shared memory lost),
# start it again, and wait until it accepts connections.
crash() {
  "${COMPOSE[@]}" kill -s SIGKILL postgres >/dev/null 2>&1
  # Wait until Docker has seen the container exit, or `up` finds it "running".
  while [ -n "$("${COMPOSE[@]}" ps -q --status running postgres 2>/dev/null)" ]; do sleep 0.2; done
  "${COMPOSE[@]}" up -d --wait >/dev/null 2>&1
}
# recovery_log: the server's log lines about the most recent crash recovery.
recovery_log() {
  "${COMPOSE[@]}" logs --no-log-prefix postgres 2>/dev/null \
    | grep -E 'not properly shut down|redo starts|redo done|invalid record length|ready to accept' \
    | tail -n 5
}

echo "starting the server (first run pulls postgres:18.6)"
start

# Make the WAL writer wake rarely (default 200ms), so an async commit stays
# in shared memory long enough for a kill to catch it.
sql <<'SQL' >/dev/null
alter system set wal_writer_delay = '10s';
select pg_reload_conf();
create table crash_test (id int primary key, how text not null);
SQL
sleep 1

section "On an idle server, every commit is its own fsync"
fsyncs() {
  sql <<SQL
select pg_stat_force_next_flush() as _ \gset
$1
select pg_stat_force_next_flush() as _ \gset
select sum(fsyncs) from pg_stat_get_backend_io(pg_backend_pid()) where object = 'wal' and context = 'normal';
SQL
}
inserts() { for i in $(seq "$1" "$2"); do echo "insert into crash_test values ($i, 'ping');"; done; }
on_count=$(fsyncs "$(inserts 101 110)")
off_count=$(fsyncs "set synchronous_commit = off;
$(inserts 111 120)")
echo "WAL fsyncs by the session: synchronous_commit on: $on_count, off: $off_count (10 commits each)"
prove "10 autocommit inserts, 10 WAL fsyncs by the inserting session" [ "$on_count" -eq 10 ]
prove "with synchronous_commit = off, none" [ "$off_count" -eq 0 ]

section "synchronous_commit = off: an acknowledged commit can vanish"
prove "the WAL writer here wakes every 10 s (wal_writer_delay)" \
  holds "select current_setting('wal_writer_delay') = '10s'"

# Commit three rows asynchronously, then check, before the crash, that the
# WAL holding them has not even been written out of Postgres's memory.
# If the WAL writer happened to wake inside this half second, try again.
lost_ok=false
for attempt in 1 2 3; do
  sql -c "truncate crash_test" >/dev/null
  sql -c "checkpoint" >/dev/null
  out=$(sql <<'SQL'
set synchronous_commit = off;
insert into crash_test values (1, 'async');
insert into crash_test values (2, 'async');
insert into crash_test values (3, 'async');
select count(*) = 3
   and pg_current_wal_lsn() < pg_current_wal_insert_lsn()
from crash_test;
SQL
)
  if [ "$out" = "t" ]; then
    crash
    lost_ok=true
    break
  fi
  echo "(the WAL writer woke during attempt $attempt; retrying)"
  sleep 2
done
prove "three async commits returned, and their WAL was still only in shared memory" $lost_ok
prove "after SIGKILL and restart, all three async-committed rows are gone" \
  holds "select count(*) = 0 from crash_test"
log=$(recovery_log)
echo "$log"
prove "the server logged crash recovery: 'not properly shut down'" has "automatic recovery in progress" "$log"
prove "recovery replayed WAL: 'redo starts at' and 'redo done at'" \
  bash -c 'grep -q "redo starts at" <<<"$1" && grep -q "redo done at" <<<"$1"' _ "$log"

section "synchronous_commit = on: the same rows survive"
out=$(sql <<'SQL'
set synchronous_commit = on;
insert into crash_test values (1, 'sync');
insert into crash_test values (2, 'sync');
insert into crash_test values (3, 'sync');
select pg_current_wal_insert_lsn() as after_commit \gset
select pg_current_wal_flush_lsn() >= :'after_commit';
SQL
)
prove "when a synchronous COMMIT returns, the WAL is already flushed past it" [ "$out" = "t" ]
crash
prove "after SIGKILL and restart, all three sync-committed rows are there" \
  holds "select count(*) = 3 from crash_test where how = 'sync'"

section "The async window is bounded: three times wal_writer_delay"
sql <<'SQL' >/dev/null
alter system set wal_writer_delay = '1s';
select pg_reload_conf();
SQL
sleep 2
out=$(sql <<'SQL'
set synchronous_commit = off;
insert into crash_test values (4, 'async, then waited');
insert into crash_test values (5, 'async, then waited');
select pg_current_wal_insert_lsn() as after_commit \gset
select pg_sleep(4);
select pg_current_wal_flush_lsn() >= :'after_commit';
SQL
)
prove "4 s after two async commits (more than 3 x 1 s), the WAL writer has flushed them" \
  [ "$(tail -n 1 <<<"$out")" = "t" ]
crash
prove "after SIGKILL, async commits older than 3 x wal_writer_delay survive" \
  holds "select count(*) = 2 from crash_test where id in (4, 5)"
sql <<'SQL' >/dev/null
alter system reset wal_writer_delay;
select pg_reload_conf();
SQL

section "A prepared transaction survives a crash, locks and all"
sql <<'SQL' >/dev/null
begin;
insert into crash_test values (6, 'prepared');
update crash_test set how = 'sync, locked by a prepared transaction' where id = 1;
prepare transaction 'transfer-42';
SQL
crash
prove "after SIGKILL and restart, the prepared transaction is still in pg_prepared_xacts" \
  holds "select count(*) = 1 from pg_prepared_xacts where gid = 'transfer-42'"
prove "its insert is still invisible: it is neither committed nor rolled back" \
  holds "select count(*) = 0 from crash_test where id = 6"
prove "it still holds its row lock: an update of row 1 gives up waiting" \
  fails_with "lock timeout" -c "set lock_timeout = '500ms'" -c "update crash_test set how = 'x' where id = 1"
sql <<'SQL' >/dev/null
create extension pgstattuple;
delete from crash_test where id = 2;
vacuum crash_test;
SQL
prove "it holds back vacuum: a row deleted after it was prepared stays dead, not removed" \
  holds "select dead_tuple_count >= 1 from pgstattuple('crash_test')"
sql -c "commit prepared 'transfer-42'" >/dev/null
prove "commit prepared, after the crash, makes its insert visible" \
  holds "select count(*) = 1 from crash_test where id = 6"
sql -c "vacuum crash_test" >/dev/null
prove "once it is resolved, vacuum removes the dead row" \
  holds "select dead_tuple_count = 0 from pgstattuple('crash_test')"

echo
echo "== 08-acid.sh: all claims proved in $((SECONDS - started)) s"
