#!/usr/bin/env bash
# Lab for "An untested backup is a rumor"
# https://www.flagon.io/books/eight-kilobytes/backups
#
# Run: ./lab 31             (from this folder; Linux, macOS, or Git Bash)
#      UPGRADE=0 ./lab 31   (skip the pg_upgrade section, which
#                                      downloads the PostgreSQL 17 binaries)
#      KEEP=1 ./lab 31      (leave the containers up to explore; then
#        docker compose -f 31-backups.compose.yml down -v when done)
#
# Starts a PostgreSQL 18 server with WAL archiving from 31-backups.compose.yml,
# then does every backup in the chapter for real and restores it: pg_dump and
# pg_restore, a base backup, an incremental chain stitched with
# pg_combinebackup, point-in-time recovery to just before a mistake, and a
# 17 to 18 pg_upgrade --link. Tears everything down at the end, volumes
# included. Every claim prints PROVED; the first one that doesn't hold stops
# the run.

LAB_COMPOSE=31-backups.compose.yml
. "$(dirname "$0")/lib.sh"

# sh <command>: run a shell command in the server container as postgres.
sh_() { "${COMPOSE[@]}" exec -T -u postgres pg bash -c "$1"; }
# q [-p port] [-d db] <sql>: one query, unaligned, quiet.
q() {
  local port=5432 db=postgres
  while [ "$1" = "-p" ] || [ "$1" = "-d" ]; do
    if [ "$1" = "-p" ]; then port="$2"; else db="$2"; fi
    shift 2
  done
  "${COMPOSE[@]}" exec -T -u postgres -e PGOPTIONS="-c client_min_messages=warning -c lock_timeout=60s" pg \
    psql -X -q -At -v ON_ERROR_STOP=1 -p "$port" -d "$db" -c "$1"
}
holds() { [ "$(q "$@")" = "t" ]; }
has() { grep -qF -- "$1" <<<"$2"; }
# fails_with <needle> <command> [runner]: the shell command fails, mentioning
# needle. It runs in the server container unless another runner is given.
fails_with() {
  local needle="$1" out
  if out=$("${3:-sh_}" "$2" 2>&1); then return 1; fi
  has "$needle" "$out"
}
# wait_for <tries> <sql> [-p port]: poll until the query returns t.
wait_for() {
  local tries="$1" sql="$2" port="${3:-5432}" i
  for ((i = 0; i < tries; i++)); do
    if [ "$(q -p "$port" "$sql" 2>/dev/null || true)" = "t" ]; then return 0; fi
    sleep 1
  done
  return 1
}

section "Starting PostgreSQL 18 with WAL archiving"
start

prove "the server archives WAL with archive_command and summarizes WAL for incremental backups" \
  holds "select current_setting('archive_mode') = 'on' and current_setting('summarize_wal') = 'on'
           and current_setting('wal_level') = 'replica'"
prove "a WAL segment is 16 MB" holds "select current_setting('wal_segment_size') = '16MB'"

# A small version of the book's schema: accounts with a billing address, and
# events with an index.
q "create database app"
q -d app "
  create role app_owner nologin;
  create table accounts (
    id               bigint generated always as identity primary key,
    name             text not null,
    billing_address  text,
    created_at       timestamptz not null default now()
  );
  create table events (
    id          bigint generated always as identity primary key,
    account_id  bigint not null references accounts (id),
    kind        text not null,
    created_at  timestamptz not null default now()
  );
  alter table events owner to app_owner;
  insert into accounts (name, billing_address)
  select 'Account ' || g, g || ' Main St' from generate_series(1, 10000) g;
  insert into events (account_id, kind, created_at)
  select 1 + g % 10000, (array['deploy','build','alert'])[1 + g % 3],
         now() - g * interval '1 second'
  from generate_series(1, 500000) g;
  create index events_account_id_created_at_idx on events (account_id, created_at);
  create statistics events_kind_account (dependencies) on kind, account_id from events;
  analyze;"

section "Logical backups: pg_dump"

sh_ "pg_dump -Fc -f /backups/app.dump app"
sh_ "pg_dump -Fd -j 4 -f /backups/app.dir app"
dump_bytes=$(sh_ "stat -c %s /backups/app.dump")
db_bytes=$(q "select pg_database_size('app')")
prove "the custom-format dump is a fraction of the database's size (it holds no index data)" \
  [ $((dump_bytes * 4)) -lt "$db_bytes" ]

toc=$(sh_ "pg_restore -l /backups/app.dump")
prove "the dump's table of contents says Format: CUSTOM and Compression: gzip" \
  bash -c 'grep -q "Format: CUSTOM" <<<"$1" && grep -q "Compression: gzip" <<<"$1"' _ "$toc"
prove "indexes are in the dump as definitions: the post-data section is a create index statement" \
  has "CREATE INDEX events_account_id_created_at_idx" "$(sh_ "pg_restore --section=post-data -f - /backups/app.dump")"

prove "only the directory format dumps in parallel: -Fc -j 4 is refused" \
  fails_with "parallel backup only supported by the directory format" \
  "pg_dump -Fc -j 4 -f /backups/nope.dump app"

sh_ "pg_dump -Fd -j 4 -Z zstd -f /backups/app.zst app"
prove "-Z accepts zstd (PostgreSQL 16+), and pg_restore -l reports it" \
  has "Compression: zstd" "$(sh_ "pg_restore -l /backups/app.zst")"

sh_ "createdb app_restore && pg_restore -j 4 -d app_restore /backups/app.dir"
prove "a dump and parallel restore round trip preserves every row of both tables" \
  [ "$(q -d app "select (select count(*) from accounts) || '/' || (select count(*) from events)")" \
    = "$(q -d app_restore "select (select count(*) from accounts) || '/' || (select count(*) from events)")" ]
prove "the restore rebuilt the index from its definition" \
  holds -d app_restore "select to_regclass('events_account_id_created_at_idx') is not null"

sh_ "pg_dump -Ft -f /backups/app.tar app"
prove "a tar-format archive can't be restored in parallel" \
  fails_with "parallel restore is not supported with this archive file format" \
  "createdb app_tar && pg_restore -j 4 -d app_tar /backups/app.tar"

prove "--single-transaction (-1) can't be combined with -j" \
  fails_with "cannot specify both --single-transaction and multiple jobs" \
  "createdb app_one && pg_restore -1 -j 4 -d app_one /backups/app.dir"

sh_ "createdb app_one_table 2>/dev/null || true; pg_restore -t accounts -d app_one_table /backups/app.dump"
prove "pg_restore -t restores one table, data and definition, and nothing else" \
  holds -d app_one_table "select (select count(*) from accounts) = 10000
                                 and to_regclass('events') is null"

prove "without --statistics, pg_dump writes no statistics (zero STATISTICS DATA entries)" \
  [ "$(grep -c "STATISTICS DATA" <<<"$toc" || true)" -eq 0 ]
sh_ "pg_dump -Fc --statistics -f /backups/app_stats.dump app"
prove "with --statistics, the dump carries STATISTICS DATA entries" \
  [ "$(sh_ "pg_restore -l /backups/app_stats.dump" | grep -c "STATISTICS DATA")" -gt 0 ]
sh_ "createdb app_stats && pg_restore -d app_stats /backups/app_stats.dump"
prove "restoring a --statistics dump gives the planner column statistics without an analyze" \
  holds -d app_stats "select count(*) > 0 from pg_stats where tablename = 'events'"

globals=$(sh_ "pg_dumpall --globals-only")
# Schema only (-s): the rows aren't needed here, and the full script is too
# big to pass around as a shell argument.
dump_sql=$(sh_ "pg_restore -s -f - /backups/app.dump")
prove "roles are not in pg_dump's output, only referenced by it" \
  bash -c '! grep -q "CREATE ROLE app_owner" <<<"$1" && grep -q "OWNER TO app_owner" <<<"$1"' _ "$dump_sql"
prove "pg_dumpall --globals-only has the roles" has "CREATE ROLE app_owner" "$globals"

section "Physical backups: pg_basebackup"

sh_ "pg_basebackup -D /backups/base -Ft -z -X stream --checkpoint=fast -P >/dev/null 2>&1"
prove "-Ft -z -X stream writes compressed tars of the data and the WAL, plus a manifest" \
  sh_ "test -f /backups/base/base.tar.gz && test -f /backups/base/pg_wal.tar.gz && test -f /backups/base/backup_manifest"
prove "pg_verifybackup checks a tar-format backup against its manifest (-n: WAL parsing is plain-format only)" \
  sh_ "pg_verifybackup -n /backups/base >/dev/null"

# Corrupt a copy: pg_verifybackup must notice.
sh_ "mkdir /backups/plain && pg_basebackup -D /backups/plain -X stream -c fast"
sh_ "cp -a /backups/plain /backups/broken && truncate -s 8192 \$(find /backups/broken/base -type f -size +100k | head -1)"
prove "pg_verifybackup catches a truncated file" \
  fails_with "size" "pg_verifybackup /backups/broken"
sh_ "rm -rf /backups/broken"

section "Point-in-time recovery"

sh_ "pg_basebackup -D /backups/pitr_base -X stream -c fast"
q -d app "insert into accounts (name, billing_address)
          select 'Late ' || g, g || ' Late St' from generate_series(1, 500) g"
q -d app "select pg_create_restore_point('before_billing_migration')" >/dev/null
sleep 1
target=$(q "select now()")
before=$(q -d app "select count(*) from accounts")
sleep 1
# Ordinary traffic after the target, then the mistake, then life goes on.
# Replay stops before the first commit after the target, which is this
# insert, so nothing of the mistake is replayed at all.
q -d app "insert into events (account_id, kind) values (1, 'deploy')"
q -d app "alter table accounts drop column billing_address"
q -d app "insert into accounts (name) select 'After ' || g from generate_series(1, 300) g"
seg=$(q "select pg_walfile_name(pg_current_wal_lsn())")
q "select pg_switch_wal()" >/dev/null
prove "the archiver picks up the switched segment" \
  wait_for 30 "select last_archived_wal >= '$seg' from pg_stat_archiver"
prove "pg_stat_archiver shows archived segments and no failures" \
  holds "select archived_count > 0 and failed_count = 0 from pg_stat_archiver"

# Restore: base backup + restore_command + target + recovery.signal.
restore() {
  local dir="$1" port="$2" target_setting="$3"
  sh_ "cp -a /backups/pitr_base $dir && chmod 700 $dir
       cat >> $dir/postgresql.auto.conf <<EOF
restore_command = 'cp /archive/%f %p'
$target_setting
recovery_target_action = 'pause'
archive_mode = 'on'
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
EOF
       touch $dir/recovery.signal
       pg_ctl -D $dir -o '-p $port' -l /backups/restore_$port.log -w start >/dev/null"
}
restore /backups/pitr_time 5433 "recovery_target_time = '$target'"

prove "replay stops at the target and pauses, read-only" \
  wait_for 60 "select pg_is_in_recovery() and pg_get_wal_replay_pause_state() = 'paused'" 5433
prove "the paused server has the dropped column back" \
  holds -p 5433 -d app "select count(*) > 0 from information_schema.columns
                        where table_name = 'accounts' and column_name = 'billing_address'"
prove "and every row committed before the target time, none after" \
  [ "$(q -p 5433 -d app "select count(*) from accounts")" = "$before" ]
prove "while paused, writes are refused" \
  fails_with "read-only transaction" "psql -X -p 5433 -d app -c \"insert into accounts (name) values ('x')\""

q -p 5433 "select pg_wal_replay_resume()" >/dev/null
prove "pg_wal_replay_resume() finishes recovery and opens the server read-write" \
  wait_for 60 "select not pg_is_in_recovery()" 5433
q -p 5433 -d app "insert into accounts (name) values ('written after recovery')"
prove "recovery started a new timeline, with a .history file" \
  holds -p 5433 "select count(*) = 1 from pg_ls_waldir() where name = '00000002.history'"
prove "and the restored server archived its .history file next to the old timeline's WAL" \
  wait_for 30 "select (select count(*) from pg_ls_dir('/archive') f where f = '00000002.history') = 1"
sh_ "pg_ctl -D /backups/pitr_time -m fast stop >/dev/null"

restore /backups/pitr_name 5434 "recovery_target_name = 'before_billing_migration'"
prove "recovery_target_name stops at a named restore point, before the mistake" \
  wait_for 60 "select pg_get_wal_replay_pause_state() = 'paused'" 5434
prove "the column is there at the restore point too" \
  holds -p 5434 -d app "select count(*) = 1 from information_schema.columns
                        where table_name = 'accounts' and column_name = 'billing_address'"
sh_ "pg_ctl -D /backups/pitr_name -m immediate stop >/dev/null"

section "Incremental backups (PostgreSQL 17+)"

sh_ "pg_basebackup -D /backups/full -X stream -c fast"
q -d app "insert into events (account_id, kind) select 1 + g % 10000, 'deploy' from generate_series(1, 20000) g"
sh_ "pg_basebackup -D /backups/incr1 -X stream -c fast --incremental=/backups/full/backup_manifest"
q -d app "update accounts set name = name || '!' where id <= 100"
sh_ "pg_basebackup -D /backups/incr2 -X stream -c fast --incremental=/backups/incr1/backup_manifest"
expected=$(q -d app "select (select count(*) from events) || '/' || (select count(*) from accounts where name like '%!')")

full_kb=$(sh_ "du -sk /backups/full | cut -f1")
incr_kb=$(sh_ "du -sk /backups/incr1 | cut -f1")
prove "an incremental backup copies only changed blocks: incr1 is under half the size of the full backup" \
  [ $((incr_kb * 2)) -lt "$full_kb" ]

sh_ "pg_combinebackup /backups/full /backups/incr1 /backups/incr2 -o /backups/combined"
prove "pg_combinebackup's output verifies against its own manifest" \
  sh_ "pg_verifybackup -n /backups/combined >/dev/null"
sh_ "chmod 700 /backups/combined && pg_ctl -D /backups/combined -o '-p 5435 -c archive_mode=off' -l /backups/combined.log -w start >/dev/null"
prove "the combined backup starts and has every change from the whole chain" \
  [ "$(q -p 5435 -d app "select (select count(*) from events) || '/' || (select count(*) from accounts where name like '%!')")" = "$expected" ]
sh_ "pg_ctl -D /backups/combined -m fast stop >/dev/null"

prove "you can't start a server from an incremental backup" \
  fails_with "incremental" "chmod 700 /backups/incr2 && pg_ctl -D /backups/incr2 -o '-p 5436' -l /backups/incr2.log -w -t 20 start; s=\$?; cat /backups/incr2.log; exit \$s"
prove "lose a link and the chain is useless: full + incr2 without incr1 is refused" \
  fails_with "but expected" "pg_combinebackup /backups/full /backups/incr2 -o /backups/nope"

if [ "${UPGRADE:-1}" = "0" ]; then
  echo; echo "== Upgrades: skipped (UPGRADE=0)"; exit 0
fi

section "Upgrades: pg_upgrade --link from 17 to 18 (installing PostgreSQL 17 binaries first)"

up() { "${COMPOSE[@]}" exec -T upgrade bash -c "$1"; }
upg() { "${COMPOSE[@]}" exec -T -u postgres -w /tmp upgrade bash -c "$1"; }
up "apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq postgresql-17 >/dev/null 2>&1"
OLD=/usr/lib/postgresql/17/bin
NEW=/usr/lib/postgresql/18/bin
upg "$OLD/initdb -D /tmp/old -U postgres >/dev/null 2>&1 && $OLD/pg_ctl -D /tmp/old -l /tmp/old.log -w start >/dev/null"
upg "$OLD/psql -X -q -c \"
  create table events as
    select g as id, 1 + g % 1000 as account_id, (array['deploy','build'])[1 + g % 2] as kind
    from generate_series(1, 100000) g;
  create index on events (account_id);
  create statistics events_kind_account (dependencies) on kind, account_id from events;
  analyze events;\""
events_file=$(upg "$OLD/psql -X -At -c \"select pg_relation_filepath('events')\"")
upg "$OLD/pg_ctl -D /tmp/old -m fast stop >/dev/null"

# PostgreSQL 18's initdb turns data checksums on by default; 17's didn't.
upg "$NEW/initdb -D /tmp/new18 -U postgres >/dev/null 2>&1"
prove "a default 18 cluster can't take a 17 cluster without checksums: pg_upgrade --check refuses" \
  fails_with "checksum" "$NEW/pg_upgrade --check -b $OLD -B $NEW -d /tmp/old -D /tmp/new18" upg
upg "rm -rf /tmp/new18 && $NEW/initdb --no-data-checksums -D /tmp/new -U postgres >/dev/null 2>&1"

prove "pg_upgrade --check finds the clusters compatible and changes nothing" \
  upg "$NEW/pg_upgrade --check -b $OLD -B $NEW -d /tmp/old -D /tmp/new >/dev/null"
# The events table's data file (user tables keep their file names across
# pg_upgrade; the catalogs are rebuilt).
inode_before=$(upg "stat -c %i /tmp/old/$events_file")
upg "$NEW/pg_upgrade --link --jobs 4 -b $OLD -B $NEW -d /tmp/old -D /tmp/new >/tmp/upgrade.out 2>&1"
prove "--link hard-links the data files: the new cluster shares the old file's inode" \
  upg "find /tmp/new/base -inum $inode_before | grep -q ."
upg "$NEW/pg_ctl -D /tmp/new -l /tmp/new.log -w start >/dev/null"
prove "the upgraded server is PostgreSQL 18 with every row" \
  upg "[ \"\$($NEW/psql -X -At -c \"select current_setting('server_version_num')::int / 10000 || '/' || count(*) from events\")\" = 18/100000 ]"
prove "PostgreSQL 18's pg_upgrade carried the planner statistics over: pg_stats is filled before any analyze" \
  upg "[ \"\$($NEW/psql -X -At -c \"select count(*) > 0 from pg_stats where tablename = 'events'\")\" = t ]"
prove "extended statistics are not carried over: the object exists but has no data until analyze" \
  upg "[ \"\$($NEW/psql -X -At -c \"select count(*) = 1 from pg_statistic_ext where stxname = 'events_kind_account'
        and not exists (select 1 from pg_statistic_ext_data)\")\" = t ]"
upgrade_help=$(upg "$NEW/pg_upgrade --help")
prove "pg_upgrade --help lists --link, --clone, --copy, --swap (PostgreSQL 18+), and --no-statistics" \
  bash -c 'for f in --link --clone --copy --swap --no-statistics; do grep -q -- "$f" <<<"$1" || exit 1; done' _ "$upgrade_help"

echo
echo "== 31-backups: all claims proved ($((SECONDS - started)) s)"
