#!/usr/bin/env bash
# Lab for "Copies of the truth"
# https://www.flagon.io/books/eight-kilobytes/replication
#
# Run: ./lab 37   (from the lab folder; Linux, macOS, or Git Bash)
#
# Starts a PostgreSQL 18 primary, clones a streaming replica from it with
# pg_basebackup -R, starts a logical subscriber (37-replication.compose.yml),
# and checks the chapter's claims: read-only replicas, lag, slots,
# synchronous commit, replay conflicts, read-your-writes, logical
# replication, and promotion. Each claim prints PROVED or stops the script
# with NOT PROVED. All three servers and their volumes are removed when the
# script exits, pass or fail. Takes about five minutes.
# KEEP=1 ./lab 37 leaves the servers running afterwards (then:
# docker compose -f 37-replication.compose.yml down -v).
#
# One thing it does not reproduce: the chapter's synchronous-commit table was
# measured with 5 ms of network delay added by tc/netem, which needs extra
# privileges and packages. Here the three servers share one machine, so the
# lab proves that off skips the flush, then the mechanism (an `on` commit
# waits for the standby's flush, remote_apply for its replay), not the 5 ms
# numbers.
LAB_COMPOSE=37-replication.compose.yml
. "$(dirname "$0")/lib.sh"
tmp=$(mktemp -d)
# Stop any background psql still running, and remove the scratch files.
tidy() {
  local pids
  pids=$(jobs -p) && [ -n "$pids" ] && kill $pids 2>/dev/null || true
  rm -rf "${tmp:-}"
}

# on <server> [psql args]: run psql against database app on primary, replica,
# or subscriber. Unaligned output, stops on error.
on() { local s="$1"; shift; compose exec -T "$s" psql -X -q -At -v ON_ERROR_STOP=1 -d app "$@" | tr -d '\r'; }
# err <server> <sql>: run SQL that should fail; print the error text with its SQLSTATE.
err() { compose exec -T "$1" psql -X -q -At -v VERBOSITY=verbose -d app -c "$2" 2>&1 | tr -d '\r' || true; }
# bg <file> <server> [psql args]: run psql in the background, output to a file.
bg() { local f="$1" s="$2"; shift 2; compose exec -T "$s" psql -X -At -v VERBOSITY=verbose -d app "$@" >"$f" 2>&1 & }
# wait_for <seconds> <server> <sql>: poll until the query returns t.
wait_for() {
  local i
  for i in $(seq 1 $(( $1 * 2 ))); do
    [ "$(on "$2" -c "$3" 2>/dev/null)" = "t" ] && return 0
    sleep 0.5
  done
  return 1
}

has() { grep -qF -- "$2" <<<"$1"; }
is() { [ "$1" = "$2" ]; }
gt() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a > b) }'; }

# Wait until the replica has replayed everything the primary has written.
caught_up() {
  local lsn; lsn=$(on primary -c "select pg_current_wal_lsn()")
  wait_for 120 replica "select pg_last_wal_replay_lsn() >= '$lsn'"
}

echo "== starting the primary"
start primary
# Replication connections match the database name "replication" in pg_hba.conf.
compose exec -T primary bash -c 'echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"'
on primary >/dev/null <<'SQL'
create role replicator with replication login password 'replpw';
select pg_reload_conf();

create table accounts (
  id bigint generated always as identity primary key,
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now());
create table users (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts (id),
  email text not null, name text not null,
  created_at timestamptz not null default now());
create table projects (
  id bigint generated always as identity primary key,
  account_id bigint not null references accounts (id),
  owner_id bigint not null references users (id),
  name text not null, archived_at timestamptz,
  created_at timestamptz not null default now());
create table commit_test (
  id bigint generated always as identity primary key,
  n int not null default 0,
  filler text not null default repeat('x', 100));

insert into accounts (name, plan)
select 'Account ' || g, (array['free', 'team', 'enterprise'])[1 + g % 3] from generate_series(1, 1000) g;
insert into users (account_id, email, name)
select 1 + g % 1000, 'user' || g || '@example.com', 'User ' || g from generate_series(1, 10000) g;
insert into projects (account_id, owner_id, name)
select account_id, id, 'Project ' || id from users where id <= 2000;
insert into commit_test (n) select 0 from generate_series(1, 400000);
vacuum analyze;
SQL

echo
echo "== On the primary"
settings=$(on primary -c "select string_agg(name || '=' || setting, ' ' order by name) from pg_settings
  where name in ('hot_standby', 'idle_replication_slot_timeout', 'max_replication_slots',
                 'max_slot_wal_keep_size', 'max_wal_senders', 'synchronous_commit',
                 'synchronous_standby_names', 'wal_keep_size', 'wal_level', 'data_checksums')")
prove "defaults: 10 WAL senders, 10 slots, hot_standby on, no slot WAL cap, no idle slot timeout" \
  has "$settings" "hot_standby=on idle_replication_slot_timeout=0 max_replication_slots=10 max_slot_wal_keep_size=-1 max_wal_senders=10"
prove "defaults: synchronous_commit on, no synchronous standbys, wal_keep_size 0" \
  has "$settings" "synchronous_commit=on synchronous_standby_names= wal_keep_size=0"
prove "wal_level is logical here because we set it (the default is replica)" \
  has "$settings" "wal_level=logical"
prove "data checksums are on by default in PostgreSQL 18 (one of pg_rewind's two options)" \
  has "$settings" "data_checksums=on"

echo
echo "== pg_basebackup -R"
compose up -d --wait replica subscriber >/dev/null 2>&1
auto=$(compose exec -T replica bash -c 'test -f "$PGDATA/standby.signal" && echo SIGNAL; cat "$PGDATA/postgresql.auto.conf"' | tr -d '\r')
prove "-R wrote standby.signal" has "$auto" "SIGNAL"
prove "-R wrote primary_conninfo, including application_name=replica1" has "$auto" "application_name=replica1"
prove "--slot with --create-slot recorded primary_slot_name" has "$auto" "primary_slot_name = 'replica1'"
log=$(compose logs replica 2>&1)
prove "the log: entering standby mode" has "$log" "entering standby mode"
prove "the log: consistent recovery state reached, then ready for read-only connections" \
  has "$log" "database system is ready to accept read-only connections"
prove "the log: started streaming WAL from primary" has "$log" "started streaming WAL from primary"

echo
echo "== Hot standby: reads yes, writes no"
prove "the replica is in recovery" is "$(on replica -c 'select pg_is_in_recovery()')" t
prove "a replica can read" is "$(on replica -c 'select count(*) from accounts')" 1000
prove "INSERT on the replica fails with 25006" \
  has "$(err replica "insert into accounts (name) values ('Nope')")" "ERROR:  25006: cannot execute INSERT in a read-only transaction"
prove "not even a temp table" \
  has "$(err replica 'create temp table t (id int)')" "ERROR:  25006: cannot execute CREATE TABLE in a read-only transaction"
prove "ANALYZE fails during recovery" \
  has "$(err replica 'analyze accounts')" "ERROR:  25006: cannot execute ANALYZE during recovery"
prove "txid_current() fails during recovery" \
  has "$(err replica 'select txid_current()')" "cannot execute pg_current_xact_id() during recovery"

echo
echo "== Watching replication"
row=$(on primary -c "select application_name, state, sync_state, sent_lsn >= write_lsn and write_lsn >= flush_lsn and flush_lsn >= replay_lsn from pg_stat_replication")
prove "pg_stat_replication shows replica1 streaming, asynchronous" has "$row" "replica1|streaming|async|"
prove "each LSN is at most the one before it: sent >= write >= flush >= replay" has "$row" "|async|t"
prove "pg_stat_wal_receiver on the replica: streaming, slot replica1, from the primary" \
  is "$(on replica -c 'select status, slot_name, sender_host from pg_stat_wal_receiver')" "streaming|replica1|primary"

echo
echo "== Lag under load"
start=$(on primary -c "select pg_current_wal_lsn()")
bg "$tmp/burst.txt" primary -c "update commit_test set n = n + 1"
burst=$!
maxlag=0
while kill -0 "$burst" 2>/dev/null; do
  lag=$(on primary -c "select coalesce(max(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)), 0)::bigint from pg_stat_replication")
  [ "$lag" -gt "$maxlag" ] && maxlag=$lag
  sleep 0.3
done
wait "$burst" || true
wal=$(on primary -c "select pg_wal_lsn_diff(pg_current_wal_lsn(), '$start')::bigint")
echo "   the burst wrote $(( wal / 1048576 )) MB of WAL; the replica was at most $(( maxlag / 1024 )) kB behind in our samples"
prove "a bulk update makes WAL in a burst (over 30 MB)" gt "$wal" 30000000
prove "during the burst, the replica fell behind" gt "$maxlag" 0
prove "after it, the lag closes: the replica replays to the primary's position" caught_up
on primary -c "vacuum commit_test" >/dev/null

echo
echo "== Replication slots are a promise to keep WAL"
compose stop replica >/dev/null 2>&1
on primary -c "select pg_logical_emit_message(false, 'lab', repeat('x', 1000000)) from generate_series(1, 80)" >/dev/null
slot=$(on primary -c "select active, inactive_since is not null, wal_status, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::bigint > 75e6 from pg_replication_slots where slot_name = 'replica1'")
prove "with its replica stopped, the slot is inactive, has an inactive_since, and holds the WAL written since (80 MB)" \
  is "$slot" "f|t|reserved|t"
compose start replica >/dev/null 2>&1
prove "the replica comes back and catches up from the slot" caught_up

on primary -c "select pg_create_physical_replication_slot('forgotten', true)" >/dev/null
on primary -c "select pg_logical_emit_message(false, 'lab', repeat('x', 1000000)) from generate_series(1, 100)" >/dev/null
caught_up
on primary -c "alter system set max_slot_wal_keep_size = '64MB'" -c "select pg_reload_conf()" >/dev/null
sleep 1
prove "past max_slot_wal_keep_size, the forgotten slot is unreserved, with a negative safe_wal_size" \
  is "$(on primary -c "select wal_status, safe_wal_size < 0 from pg_replication_slots where slot_name = 'forgotten'")" "unreserved|t"
on primary -c "checkpoint" >/dev/null
on primary -c "select pg_logical_emit_message(false, 'lab', repeat('x', 1000000)) from generate_series(1, 20)" -c "checkpoint" >/dev/null
prove "after a checkpoint, the slot is lost: invalidation_reason wal_removed" \
  wait_for 30 primary "select wal_status = 'lost' and invalidation_reason = 'wal_removed' from pg_replication_slots where slot_name = 'forgotten'"
prove "the primary logged it: invalidating obsolete replication slot" \
  has "$(compose logs primary 2>&1)" 'invalidating obsolete replication slot "forgotten"'
prove "the replica's own slot is untouched: active and reserved" \
  is "$(on primary -c "select active, wal_status from pg_replication_slots where slot_name = 'replica1'")" "t|reserved"
on primary -c "select pg_drop_replication_slot('forgotten')" -c "alter system reset max_slot_wal_keep_size" -c "select pg_reload_conf()" >/dev/null

echo
echo "== Synchronous commit costs a round trip"
on primary -c "alter system set synchronous_standby_names = 'FIRST 1 (replica1)'" -c "select pg_reload_conf()" >/dev/null
prove "replica1 becomes synchronous, priority 1" \
  wait_for 10 primary "select sync_priority = 1 and sync_state = 'sync' from pg_stat_replication where application_name = 'replica1'"

# One client inserting single rows, 3 seconds per level, three interleaved rounds.
compose exec -T primary bash -c "echo 'insert into commit_test default values;' > /tmp/one.sql"
: >"$tmp/bench.txt"
for round in 1 2 3; do
  for level in off local remote_write on remote_apply; do
    ms=$(compose exec -T -e PGOPTIONS="-c synchronous_commit=$level" primary \
           pgbench -n -c 1 -T 3 -f /tmp/one.sql app 2>&1 | tr -d '\r' | awk '/latency average/ { print $4 }')
    echo "$level $ms" >>"$tmp/bench.txt"
  done
done
median() { awk -v l="$1" '$1 == l { print $2 }' "$tmp/bench.txt" | sort -g | sed -n 2p; }
echo "   mean commit latency on our machine, median of 3 rounds (no injected network delay):"
for level in off local remote_write on remote_apply; do printf '     %-13s %s ms\n' "$level" "$(median $level)"; done
prove "off is far cheaper than local: no flush at all (over 5 times faster)" gt "$(median local)" "$(awk -v x="$(median off)" 'BEGIN { print 5 * x }')"
# The other steps are milliseconds apart, and on a busy machine the local
# flush alone can vary more than that, so the lab proves what separates local
# from on directly: freeze the standby's WAL receiver (SIGSTOP), so it can't
# write or flush, and see which commits still return.
rcv=$(compose exec -T replica bash -c 'for p in /proc/[0-9]*; do tr "\0" " " <"$p/cmdline" 2>/dev/null | grep -q "^postgres: walreceiver" && echo "${p#/proc/}"; done; true' | tr -d '\r')
[ -n "$rcv" ] || { echo "NOT PROVED: found the replica's WAL receiver process"; exit 1; }
compose exec -T replica bash -c "kill -STOP $rcv"
prove "with the standby's WAL receiver frozen, a local commit still returns"   has "$(on primary -c "set synchronous_commit = local" -c "insert into accounts (name) values ('local') returning name")" "local"
bg "$tmp/on.txt" primary -c "set synchronous_commit = on" -c "insert into accounts (name) values ('waits for the flush')"
onjob=$!
sleep 2
prove "...but an 'on' commit waits for the standby's flush (wait event SyncRep)"   is "$(on primary -c "select count(*) from pg_stat_activity where wait_event = 'SyncRep' and query like '%waits for the flush%'")" 1
compose exec -T replica bash -c "kill -CONT $rcv"
wait "$onjob" || true
prove "once the receiver resumes, the 'on' commit returns" has "$(cat "$tmp/on.txt")" "INSERT 0 1"

# The mechanism, without timing: pause replay on the standby. A remote_apply
# commit waits for replay; an `on` commit only waits for the standby's flush.
on replica -c "select pg_wal_replay_pause()" >/dev/null
bg "$tmp/apply.txt" primary -c "set synchronous_commit = remote_apply" -c "insert into accounts (name) values ('remote_apply')"
apply=$!
sleep 2
prove "with replay paused, an 'on' commit still returns" \
  has "$(on primary -c "set synchronous_commit = on" -c "insert into accounts (name) values ('on') returning name")" "on"
prove "with replay paused, a remote_apply commit waits (wait event SyncRep)" \
  is "$(on primary -c "select count(*) from pg_stat_activity where wait_event = 'SyncRep' and query like '%remote_apply%'")" 1
on replica -c "select pg_wal_replay_resume()" >/dev/null
wait "$apply" || true
prove "once replay resumes, the remote_apply commit returns" has "$(cat "$tmp/apply.txt")" "INSERT 0 1"

echo
echo "== When the synchronous standby goes away, writes stop"
compose stop replica >/dev/null 2>&1
bg "$tmp/hang.txt" primary -c "set statement_timeout = '3s'" -c "insert into accounts (name) values ('Waits for the standby')"
hang=$!
sleep 6
prove "the insert hangs past its 3 s statement_timeout, waiting on SyncRep" \
  is "$(on primary -c "select wait_event_type || ' ' || wait_event, now() - query_start > interval '3 seconds' from pg_stat_activity where wait_event = 'SyncRep'")" "IPC SyncRep|t"
on primary -c "select pg_cancel_backend(pid) from pg_stat_activity where wait_event = 'SyncRep'" >/dev/null
wait "$hang" || true
out=$(cat "$tmp/hang.txt")
prove "cancelling it warns: canceling wait for synchronous replication" has "$out" "canceling wait for synchronous replication due to user request"
prove "...and: the transaction has already committed locally" has "$out" "The transaction has already committed locally, but might not have been replicated to the standby."
prove "the row exists" is "$(on primary -c "select count(*) from accounts where name = 'Waits for the standby'")" 1
on primary -c "alter system reset synchronous_standby_names" -c "select pg_reload_conf()" >/dev/null
compose start replica >/dev/null 2>&1
caught_up

echo
echo "== Read-your-writes"
on replica -c "select pg_wal_replay_pause()" >/dev/null
lsn=$(on primary -c "update users set name = 'Ada Lovelace' where id = 42" -c "select pg_current_wal_lsn()" | tail -1)
prove "with replay paused, the replica still shows the old name" is "$(on replica -c 'select name from users where id = 42')" "User 42"
prove "it has received the write's LSN but not replayed it" \
  is "$(on replica -c "select pg_last_wal_receive_lsn() >= '$lsn', pg_last_wal_replay_lsn() >= '$lsn' as caught_up, pg_is_wal_replay_paused()")" "t|f|t"
on replica -c "select pg_wal_replay_resume()" >/dev/null
prove "after resuming, pg_last_wal_replay_lsn() >= the write's LSN" \
  wait_for 30 replica "select pg_last_wal_replay_lsn() >= '$lsn'"
prove "and then the replica shows the new name" is "$(on replica -c 'select name from users where id = 42')" "Ada Lovelace"

echo
echo "== Replica queries fight replay (max_standby_streaming_delay = 5s in this lab)"
bg "$tmp/conflict.txt" replica -c "begin isolation level repeatable read" -c "select count(*) from commit_test" -c "select pg_sleep(60)" -c "commit"
conflict=$!
sleep 2
on primary -c "delete from commit_test where id % 2 = 0" -c "vacuum commit_test" -c "insert into accounts (name) values ('after the vacuum')" >/dev/null
sleep 2
prove "while replay waits for the query, a row written after the vacuum is invisible on the replica" \
  is "$(on replica -c "select count(*) from accounts where name = 'after the vacuum'")" 0
wait "$conflict" || true
out=$(cat "$tmp/conflict.txt")
prove "the replica cancels the query: 40001 canceling statement due to conflict with recovery" \
  has "$out" "ERROR:  40001: canceling statement due to conflict with recovery"
prove "...User query might have needed to see row versions that must be removed" \
  has "$out" "User query might have needed to see row versions that must be removed."
prove "pg_stat_database_conflicts counts it as confl_snapshot" \
  gt "$(on replica -c "select confl_snapshot from pg_stat_database_conflicts where datname = 'app'")" 0
prove "then replay continues and the row appears" \
  wait_for 30 replica "select count(*) = 1 from accounts where name = 'after the vacuum'"

echo
echo "== hot_standby_feedback"
on replica -c "alter system set hot_standby_feedback = on" -c "select pg_reload_conf()" >/dev/null
sleep 2
bg "$tmp/feedback.txt" replica -c "begin isolation level repeatable read" -c "select count(*) from commit_test" -c "select pg_sleep(15)" -c "commit"
feedback=$!
sleep 3
prove "the feedback lands in the slot's xmin, not backend_xmin" \
  is "$(on primary -c "select s.xmin is not null, r.backend_xmin is null from pg_replication_slots s, pg_stat_replication r where s.slot_name = 'replica1'")" "t|t"
vac=$(on primary -c "delete from commit_test where id % 2 = 1" -c "vacuum (verbose) commit_test" 2>&1 | tr -d '\r' | grep -m1 'tuples:')
echo "   $vac"
prove "vacuum on the primary removes nothing: the dead rows are not yet removable" \
  bash -c "grep -Eq 'tuples: 0 removed, [0-9]+ remain, [1-9][0-9]* are dead but not yet removable' <<<'$vac'"
wait "$feedback" || true
out=$(cat "$tmp/feedback.txt")
prove "the replica's query finishes undisturbed" bash -c "grep -q COMMIT <<<'$out' && ! grep -q ERROR <<<'$out'"
sleep 3
vac=$(on primary -c "vacuum (verbose) commit_test" 2>&1 | tr -d '\r' | grep -m1 'tuples:')
echo "   $vac"
prove "once the replica's snapshot is gone, the next vacuum finishes the job" \
  bash -c "grep -q ' 0 are dead but not yet removable' <<<'$vac'"

echo
echo "== Logical replication"
on primary -c "grant select on accounts, users, projects to replicator" -c "create publication app_pub for table accounts, users, projects" >/dev/null
prove "the publication lists three tables and their columns" \
  has "$(on primary -c "select string_agg(tablename || array_to_string(attnames, ','), ' ' order by tablename) from pg_publication_tables")" \
  "accountsid,name,plan,created_at projectsid,account_id,owner_id,name,archived_at,created_at usersid,account_id,email,name,created_at"
compose exec -T subscriber bash -c "PGPASSWORD=postgres pg_dump -h primary -U postgres -d app --schema-only --no-privileges -t accounts -t users -t projects | psql -X -q -d app" >/dev/null
sub=$(compose exec -T subscriber psql -X -d app -c "create subscription app_sub connection 'host=primary dbname=app user=replicator password=replpw' publication app_pub" 2>&1 | tr -d '\r')
prove "creating the subscription creates a logical slot on the publisher" has "$sub" 'created replication slot "app_sub" on publisher'
prove "every table reaches state r (ready)" \
  wait_for 60 subscriber "select count(*) = 3 and bool_and(srsubstate = 'r') from pg_subscription_rel"
prove "the initial copy brought every row" \
  is "$(on subscriber -c "select (select count(*) from accounts) || '/' || (select count(*) from users)")" \
     "$(on primary -c "select (select count(*) from accounts) || '/' || (select count(*) from users)")"
on primary -c "insert into accounts (name) values ('Hopper LLC')" -c "update accounts set plan = 'team' where id = 1" -c "delete from projects where id = 2000" >/dev/null
prove "an insert, an update, and a delete on the publisher show up on the subscriber" \
  wait_for 20 subscriber "select exists (select from accounts where name = 'Hopper LLC') and (select plan from accounts where id = 1) = 'team' and not exists (select from projects where id = 2000)"
prove "the subscriber takes local DDL of its own" \
  is "$(on subscriber -c "create index accounts_plan_idx on accounts (plan)" -c "create table sub_only_notes (id int)" -c "select 'ok'")" ok
prove "on the publisher, the subscription is a logical pgoutput slot in pg_stat_replication" \
  is "$(on primary -c "select r.state, s.slot_type, s.plugin from pg_stat_replication r join pg_replication_slots s on s.active_pid = r.pid where r.application_name = 'app_sub'")" "streaming|logical|pgoutput"

echo
echo "== What it doesn't replicate"
on primary -c "alter table accounts add column region text" -c "insert into accounts (name, region) values ('Lamarr Inc', 'fra')" >/dev/null
prove "a column added only on the publisher stops the subscription: missing replicated column" \
  bash -c 'for i in $(seq 1 60); do docker compose -f 37-replication.compose.yml logs subscriber 2>&1 | grep -q "is missing replicated column: \"region\"" && exit 0; sleep 0.5; done; exit 1'
prove "pg_stat_subscription_stats counts the apply errors" \
  wait_for 30 subscriber "select apply_error_count > 0 from pg_stat_subscription_stats where subname = 'app_sub'"
on subscriber -c "alter table accounts add column region text" >/dev/null
prove "adding the column on the subscriber fixes it: the row arrives" \
  wait_for 60 subscriber "select exists (select from accounts where name = 'Lamarr Inc' and region = 'fra')"
prove "sequences aren't replicated: an insert on the subscriber collides with id 1 (23505)" \
  has "$(err subscriber "insert into accounts (name) values ('Written on the subscriber')")" "ERROR:  23505: duplicate key value violates unique constraint \"accounts_pkey\""

echo
echo "== Replica identity"
on subscriber -c "create table feature_flags (account_id bigint not null, flag text not null, enabled boolean not null, primary key (account_id, flag))" >/dev/null
on primary -c "create table feature_flags (account_id bigint not null, flag text not null, enabled boolean not null)" \
           -c "insert into feature_flags values (1, 'dark_mode', false)" \
           -c "alter publication app_pub add table feature_flags" >/dev/null
out=$(err primary "update feature_flags set enabled = true where account_id = 1")
prove "on the publisher, updating a published table without a replica identity fails (55000)" \
  has "$out" 'ERROR:  55000: cannot update table "feature_flags" because it does not have a replica identity and publishes updates'
prove "a primary key fixes it" \
  is "$(on primary -c "alter table feature_flags add primary key (account_id, flag)" -c "update feature_flags set enabled = true where account_id = 1" -c "select enabled from feature_flags")" t
on subscriber -c "alter subscription app_sub refresh publication" >/dev/null
prove "without select on the new table, its initial copy fails: permission denied" \
  bash -c 'for i in $(seq 1 60); do docker compose -f 37-replication.compose.yml logs subscriber 2>&1 | grep -q "permission denied for table feature_flags" && exit 0; sleep 0.5; done; exit 1'
on primary -c "grant select on feature_flags to replicator" >/dev/null
prove "after the grant, the table syncs" \
  wait_for 60 subscriber "select exists (select from feature_flags where enabled)"

echo
echo "== Row filters and column lists"
on primary -c "create publication big_accounts for table accounts (id, name, plan) where (plan = 'enterprise')" >/dev/null
prove "a publication can carry a column list and a row filter" \
  is "$(on primary -c "select array_to_string(attnames, ','), rowfilter from pg_publication_tables where pubname = 'big_accounts'")" "id,name,plan|(plan = 'enterprise'::text)"
prove "a row filter on a non-identity column, in a publication that publishes updates, makes updates fail" \
  has "$(err primary "update accounts set name = name where id = 3")" 'cannot update table "accounts"'
on primary -c "alter publication big_accounts set (publish = 'insert')" >/dev/null
prove "publishing only inserts lifts the restriction" \
  is "$(on primary -c "update accounts set name = name where id = 3" -c "select 'ok'")" ok

echo
echo "== Logical decoding on a standby"
bg "$tmp/standby_slot.txt" replica -c "select slot_name from pg_create_logical_replication_slot('standby_decoding', 'test_decoding')"
slotjob=$!
sleep 2
on primary -c "select pg_log_standby_snapshot()" >/dev/null
wait "$slotjob" || true
prove "a logical slot can be created on the replica (pg_log_standby_snapshot() on the primary unblocks it)" \
  has "$(cat "$tmp/standby_slot.txt")" "standby_decoding"
on primary -c "update accounts set name = 'Account Seven' where id = 7" >/dev/null
caught_up
prove "decoding on the replica returns the primary's update" \
  has "$(on replica -c "select string_agg(data, ' ') from pg_logical_slot_get_changes('standby_decoding', null, null)")" \
  "table public.accounts: UPDATE: id[bigint]:7 name[text]:'Account Seven'"
on replica -c "select pg_drop_replication_slot('standby_decoding')" >/dev/null
on replica -c "alter system reset hot_standby_feedback" -c "select pg_reload_conf()" >/dev/null

echo
echo "== Failover: promoting a replica"
caught_up
oldmax=$(on primary -c "select max(id) from accounts")
prove "pg_promote() returns true and the replica leaves recovery" \
  is "$(on replica -c "select pg_promote()" -c "select pg_is_in_recovery()" | tr '\n' ' ')" "t f "
prove "the new primary writes on timeline 2 (WAL file names start 00000002)" \
  is "$(on replica -c "select left(pg_walfile_name(pg_current_wal_lsn()), 8)")" "00000002"
prove "the log: selected new timeline ID: 2" has "$(compose logs replica 2>&1)" "selected new timeline ID: 2"
newid=$(on replica -c "insert into accounts (name) values ('Written to the NEW primary') returning id")
echo "   last id on the old primary: $oldmax; first id on the new one: $newid"
prove "the promoted replica's sequence skips ahead (sequences log values ahead in WAL)" gt "$newid" "$(( oldmax + 1 ))"
prove "split brain: the old primary doesn't know, and still accepts writes" \
  is "$(on primary -c "select pg_is_in_recovery()" -c "insert into accounts (name) values ('Written to the OLD primary') returning 'ok'" | tr '\n' ' ')" "f ok "

echo
echo "== every claim proved"
