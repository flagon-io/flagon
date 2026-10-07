#!/usr/bin/env bash
# Lab for "Measure honestly"
# https://www.flagon.io/books/eight-kilobytes/benchmarking
#
# Run: ./lab 28          (from this folder; Linux, macOS, or Git Bash)
#      KEEP=1 ./lab 28   (leave the server up to explore; then
#        docker compose -f 28-benchmarking.compose.yml exec postgres bash
#        and docker compose -f 28-benchmarking.compose.yml down -v when done)
#
# Starts one PostgreSQL 18 server from 28-benchmarking.compose.yml, loads the
# book's seed (about a minute and a half) and pgbench's own tables, runs the
# chapter's benchmarks with the pgbench that ships in the image, and proves
# the relationships the chapter claims. It never asserts a raw speed: those
# belong to your machine. It asserts that A beats B by more than the noise,
# that a spike lines up with a checkpoint, and so on.
# Every claim prints PROVED; the first one that doesn't hold stops the run.
# Takes about five minutes. Close other heavy work first: a noisy neighbor is
# part of any benchmark, which is one of the chapter's points.

LAB_COMPOSE=28-benchmarking.compose.yml
. "$(dirname "$0")/lib.sh"

# sql <db> [psql args]: run psql on the server, unaligned, quiet.
sql() {
  local db="$1"; shift
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres \
    psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" "$@"
}
# sh <script>: run a bash script inside the container, in /tmp.
sh_in() { "${COMPOSE[@]}" exec -T postgres bash -c "cd /tmp && $1"; }
# holds <db> <sql>: the query returns true.
holds() { [ "$(sql "$1" -c "$2")" = "t" ]; }
# is <awk expression>: numeric comparison, e.g. is "3.5 > 2 * 1.1".
is() { awk "BEGIN { exit !($1) }"; }
# tps_of: the tps figure from pgbench's report on stdin.
tps_of() { awk '/^tps = /{ print $3 }'; }

echo "starting the server (first run pulls postgres:18.6)"
start

section "Loading the book's seed and pgbench's tables"
sql postgres -c "create database book" -c "create database bench"
sql book -f /seed.sql >/dev/null
# Scale 5: five branches, 500,000 accounts, about 75 MB. Every TPC-B-like run
# below uses at most 4 clients, so scale is at least the client count.
"${COMPOSE[@]}" exec -T postgres pgbench -i -s 5 -q bench >/dev/null 2>&1
prove "the seed has 2,000,000 events and pgbench made 500,000 accounts" \
  is "$(sql book -c "select count(*) from events") == 2000000 && $(sql bench -c "select count(*) from pgbench_accounts") == 500000"

# ---------------------------------------------------------------------------
section "Read the script before you trust the number"
script=$("${COMPOSE[@]}" exec -T postgres pgbench --show-script=tpcb-like 2>&1)
prove "the default TPC-B-like script updates pgbench_branches, one row per branch" \
  grep -q "UPDATE pgbench_branches" <<<"$script"
tpcb=$("${COMPOSE[@]}" exec -T postgres pgbench -n -M prepared -c 4 -j 4 -T 5 bench 2>&1 | tps_of)
sel=$("${COMPOSE[@]}" exec -T postgres pgbench -n -S -M prepared -c 4 -j 4 -T 5 bench 2>&1 | tps_of)
echo "  tpcb-like: $tpcb tps   select-only: $sel tps"
prove "select-only runs at least 5x the transactions per second of TPC-B-like" \
  is "$sel > 5 * $tpcb"

# ---------------------------------------------------------------------------
section "Query modes: simple, extended, prepared (three rounds, the modes side by side)"
# Settle the TPC-B-like run's aftermath first: its dead rows and dirty pages
# would otherwise hand autovacuum and the next checkpoint to whichever mode
# happens to run while they fire.
sql bench -c "vacuum analyze" -c "checkpoint"
# Each round runs the three modes at the same time, one client each (six
# processes, fewer than the cores), so whatever else the machine is doing hits
# all three equally.
sh_in "cat > modes.sh" <<'EOF'
for m in simple extended prepared; do
  pgbench -n -S -M $m -c 1 -T 8 bench > mode_$m.txt 2>&1 &
done
wait
for m in simple extended prepared; do awk '/^tps = /{ printf "%s ", $3 }' mode_$m.txt; done
EOF
runs_simple=""; runs_extended=""; runs_prepared=""   # plain variables: macOS ships bash 3.2
for round in 1 2 3; do
  read -r ts te tp <<<"$(sh_in "bash modes.sh")"
  runs_simple="$runs_simple $ts"; runs_extended="$runs_extended $te"; runs_prepared="$runs_prepared $tp"
done
stats() { tr ' ' '\n' <<<"$1" | awk 'NF { n++; s += $1; if (min == "" || $1 < min) min = $1; if ($1 > max) max = $1 }
  END { printf "%.0f %.0f %.0f %.1f", min, max, s / n, 100 * (max - min) / min }'; }
for mode in simple extended prepared; do
  eval "these=\$runs_$mode";read -r mn mx av sp <<<"$(stats "$these")"
  echo "  $mode: min $mn  max $mx  mean $av tps  spread $sp%"
done
read -r smin smax savg _ <<<"$(stats "$runs_simple")"
read -r pmin pmax pavg _ <<<"$(stats "$runs_prepared")"
prove "the slowest prepared run beats the fastest simple run" is "$pmin > $smax"
prove "prepared is at least 15% faster than simple for a one-row lookup (mean of 3)" \
  is "$pavg > 1.15 * $savg"

# ---------------------------------------------------------------------------
section "Clients and threads: -c 8 with -j 1 versus -j 8"
j1=$("${COMPOSE[@]}" exec -T postgres pgbench -n -S -M prepared -c 8 -j 1 -T 5 bench 2>&1 | tps_of)
j8=$("${COMPOSE[@]}" exec -T postgres pgbench -n -S -M prepared -c 8 -j 8 -T 5 bench 2>&1 | tps_of)
echo "  -j 1: $j1 tps   -j 8: $j8 tps"
prove "with 8 clients on one pgbench thread, pgbench itself is the bottleneck (-j 8 is 1.2x+ faster)" \
  is "$j8 > 1.2 * $j1"

# ---------------------------------------------------------------------------
section "Cold and warm cache"
sh_in "cat > lookup.sql" <<'PGB'
\set id random(1, 100000)
select id, email, name from users where id = :id;
PGB
blocks_read() { sql book -c "select coalesce(sum(shared_blks_read), 0) from pg_stat_statements
                             where query like 'select id, email, name from users%'"; }
sql book -c "select pg_buffercache_evict_relation('users'), pg_buffercache_evict_relation('users_pkey')" >/dev/null
sql book -c "select pg_stat_statements_reset()" >/dev/null
cold=$("${COMPOSE[@]}" exec -T postgres pgbench -n -M prepared -c 4 -j 4 -T 5 -f /tmp/lookup.sql book 2>&1 | tps_of)
cold_read=$(blocks_read)
sql book -c "select pg_stat_statements_reset()" >/dev/null
warm=$("${COMPOSE[@]}" exec -T postgres pgbench -n -M prepared -c 4 -j 4 -T 5 -f /tmp/lookup.sql book 2>&1 | tps_of)
warm_read=$(blocks_read)
echo "  cold: $cold tps, $cold_read blocks read   warm: $warm tps, $warm_read blocks read"
prove "the cold run reads over 1,000 blocks from outside shared buffers" is "$cold_read > 1000"
prove "the warm run of the same command reads under a tenth of that" is "$warm_read * 10 < $cold_read"

# ---------------------------------------------------------------------------
section "Distributions: zipfian, exponential, gaussian"
sql book -c "create table picks (z int, e int, g int)"
sh_in "cat > picks.sql" <<'PGB'
\set z random_zipfian(1, 20000, 1.1)
\set e random_exponential(1, 20000, 5)
\set g random_gaussian(1, 20000, 4)
insert into picks values (:z, :e, :g);
PGB
"${COMPOSE[@]}" exec -T -e PGOPTIONS="-c synchronous_commit=off" postgres \
  pgbench -n -c 4 -j 4 -t 10000 -f /tmp/picks.sql book >/dev/null 2>&1
sql book -c "select round(100.0 * count(*) filter (where z <= 200) / count(*), 1) as zipf_top1,
                    round(100.0 * count(*) filter (where e <= 200) / count(*), 1) as exp_top1,
                    round(100.0 * count(*) filter (where g between 7501 and 12500) / count(*), 1) as gauss_mid
             from picks" | awk -F'|' '{ printf "  zipfian top 1%%: %s%%  exponential top 1%%: %s%%  gaussian middle quarter: %s%%\n", $1, $2, $3 }'
prove "random_zipfian(1, 20000, 1.1) sends 55 to 80% of picks to the first 1% of ids" \
  holds book "select count(*) filter (where z <= 200) * 1.0 / count(*) between 0.55 and 0.80 from picks"
prove "random_exponential(1, 20000, 5) sends about 5% to the first 1% (3 to 7%)" \
  holds book "select count(*) filter (where e <= 200) * 1.0 / count(*) between 0.03 and 0.07 from picks"
prove "random_gaussian(1, 20000, 4) puts about 67% in the middle quarter (62 to 72%)" \
  holds book "select count(*) filter (where g between 7501 and 12500) * 1.0 / count(*) between 0.62 and 0.72 from picks"

# ---------------------------------------------------------------------------
section "Uniform keys hide your cache: events lookups, uniform versus zipfian"
sh_in "cat > uniform.sql" <<'PGB'
\set id random(1, 2000000)
select * from events where id = :id;
PGB
sh_in "cat > zipf.sql" <<'PGB'
\set id random_zipfian(1, 2000000, 1.1)
select * from events where id = :id;
PGB
skew_run() {
  sql book -c "select pg_buffercache_evict_relation('events'), pg_buffercache_evict_relation('events_pkey')" \
              -c "select pg_stat_statements_reset()" >/dev/null
  local t
  t=$("${COMPOSE[@]}" exec -T postgres pgbench -n -M prepared -c 4 -j 4 -T 8 -f "/tmp/$1.sql" book 2>&1 | tps_of)
  sql book -c "select '$t', calls, shared_blks_hit, shared_blks_read,
                      round(100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read), 1),
                      round(shared_blks_read * 1.0 / calls, 3)
               from pg_stat_statements where query like 'select * from events where id%'"
}
IFS='|' read -r u_tps u_calls u_hit u_read u_ratio u_rpc <<<"$(skew_run uniform)"
IFS='|' read -r z_tps z_calls z_hit z_read z_ratio z_rpc <<<"$(skew_run zipf)"
echo "  uniform: $u_tps tps, hit ratio $u_ratio%, $u_rpc blocks read per call"
echo "  zipfian: $z_tps tps, hit ratio $z_ratio%, $z_rpc blocks read per call"
prove "zipfian lookups hit shared buffers at least 10 points more often than uniform ones" \
  is "$z_ratio > $u_ratio + 10"
prove "uniform lookups read at least 5x more blocks per call than zipfian ones" \
  is "$u_rpc > 5 * $z_rpc"

# ---------------------------------------------------------------------------
section "Per-statement latency (-r) and one change, measured end to end"
sh_in "cat > endpoint.sql" <<'PGB'
\set u random(1, 100000)
\set p random_exponential(1, 20000, 5)
select id, email, name from users where id = :u;
select kind, count(*) from events where project_id = :p group by kind;
PGB
# stmt_lat <pgbench -r output> <statement prefix>: that statement's average latency.
stmt_lat() { awk -v pfx="$2" 'index($0, pfx) { print $(1) }' <<<"$1" | head -n 1; }
pss() { sql book -c "select round(mean_exec_time::numeric, 3), round((shared_blks_hit + shared_blks_read) * 1.0 / calls, 1)
                     from pg_stat_statements where query like '$1%'"; }
sql book -c "select pg_stat_statements_reset()" >/dev/null
before=$("${COMPOSE[@]}" exec -T postgres pgbench -n -M prepared -c 4 -j 4 -T 10 -r -f /tmp/endpoint.sql book 2>&1)
IFS='|' read -r rep_ms_b rep_blk_b <<<"$(pss 'select kind, count(*) from events')"
IFS='|' read -r usr_ms_b usr_blk_b <<<"$(pss 'select id, email, name from users')"
sql book -c "create index events_project_id_idx on events (project_id)"
sql book -c "select pg_stat_statements_reset()" >/dev/null
after=$("${COMPOSE[@]}" exec -T postgres pgbench -n -M prepared -c 4 -j 4 -T 10 -r -f /tmp/endpoint.sql book 2>&1)
IFS='|' read -r rep_ms_a rep_blk_a <<<"$(pss 'select kind, count(*) from events')"
IFS='|' read -r usr_ms_a usr_blk_a <<<"$(pss 'select id, email, name from users')"
echo "$before" | sed -n '/^tps/p;/statement latencies/,$p' | sed 's/^/  before: /'
echo "$after"  | sed -n '/^tps/p;/statement latencies/,$p' | sed 's/^/  after:  /'
echo "  pg_stat_statements report:  ${rep_ms_b} ms, ${rep_blk_b} blocks/call -> ${rep_ms_a} ms, ${rep_blk_a} blocks/call"
echo "  pg_stat_statements lookup:  ${usr_ms_b} ms, ${usr_blk_b} blocks/call -> ${usr_ms_a} ms, ${usr_blk_a} blocks/call"
lk_b=$(stmt_lat "$before" "select id, email, name from users")
lk_a=$(stmt_lat "$after" "select id, email, name from users")
rp_b=$(stmt_lat "$before" "select kind, count(*) from events")
prove "-r shows the report, not the lookup, owns the endpoint's time before the index" \
  is "$rp_b > 2 * $lk_b"
prove "before the index the report reads over 30,000 blocks per call (the whole table)" \
  is "$rep_blk_b > 30000"
prove "after the index it reads under 1,000 blocks per call" is "$rep_blk_a < 1000"
prove "the report's mean time in pg_stat_statements fell more than 20x" \
  is "$rep_ms_b > 20 * $rep_ms_a"
prove "the untouched lookup does the same 3 blocks of work before and after" \
  is "$usr_blk_b == $usr_blk_a && $usr_blk_a == 3"
prove "yet its client-side latency (-r) fell over 1.5x, because the box stopped being saturated" \
  is "$lk_b > 1.5 * $lk_a"
sql book -c "drop index events_project_id_idx"

# ---------------------------------------------------------------------------
section "Coordinated omission: closed loop versus -R at 80% of its throughput, same 2 s stall"
# Each run: 4 clients of select-only for 15 s. At 5 s, another session locks
# pgbench_accounts for 2 s, a stand-in for any stall (a lock, a failover, a
# GC pause in the app). Every transaction goes to the log; percentiles come
# from sorting it.
sh_in "cat > co.sh" <<'EOF'
name=$1; shift
rm -f "co_$name".*
(sleep 5; psql -X -q -d bench -c "begin; lock table pgbench_accounts in access exclusive mode; select pg_sleep(2); commit;" >/dev/null) &
pgbench -n -S -M prepared -c 4 -j 4 -T 15 --log --log-prefix="co_$name" "$@" bench 2>&1 | awk '/^tps = /{ print $3 }'
wait
# p50 p95 p99 max of the time column (microseconds -> ms); with -R, also
# the same percentiles of time minus schedule_lag (field 7).
cat "co_$name".* | awk '{ print $3 }' | sort -n | awk '{ a[NR] = $1 } END {
  printf "%.2f %.2f %.2f %.1f\n", a[int(NR*.50)]/1000, a[int(NR*.95)]/1000, a[int(NR*.99)]/1000, a[NR]/1000 }'
if [ $# -gt 0 ]; then
  cat "co_$name".* | awk '{ print $3 - $7 }' | sort -n | awk '{ a[NR] = $1 } END {
    printf "%.2f %.2f %.2f %.1f\n", a[int(NR*.50)]/1000, a[int(NR*.95)]/1000, a[int(NR*.99)]/1000, a[NR]/1000 }'
  cat "co_$name".* | awk '$3 < $7 { bad++ } END { print bad + 0 }'
fi
EOF
closed=$(sh_in "bash co.sh closed")
c_tps=$(sed -n 1p <<<"$closed"); read -r c50 c95 c99 cmax <<<"$(sed -n 2p <<<"$closed")"
# The open-loop run asks for 80% of what the closed loop achieved: a lighter
# load, with headroom to work off the stall's backlog. At 100% a busy machine
# can fall behind the schedule and never catch up.
rate=$(awk -v t="$c_tps" 'BEGIN { printf "%d", t * 0.8 }')
open=$(sh_in "bash co.sh open -R $rate")
o_tps=$(sed -n 1p <<<"$open"); read -r o50 o95 o99 omax <<<"$(sed -n 2p <<<"$open")"
read -r s50 s95 s99 smax <<<"$(sed -n 3p <<<"$open")"; bad=$(sed -n 4p <<<"$open")
printf "  %-28s %10s %8s %8s %8s %9s\n" "" tps p50 p95 p99 max
printf "  %-28s %10.0f %8s %8s %8s %9s\n" "closed loop" "$c_tps" "$c50" "$c95" "$c99" "$cmax"
printf "  %-28s %10.0f %8s %8s %8s %9s\n" "-R $rate, from schedule" "$o_tps" "$o50" "$o95" "$o99" "$omax"
printf "  %-28s %10s %8s %8s %8s %9s\n" "-R $rate, minus lag" "" "$s50" "$s95" "$s99" "$smax"
prove "the -R run delivered the rate it was asked for (within 10%), 80% of the closed loop's" \
  is "$o_tps > 0.9 * $rate && $o_tps < 1.1 * $rate"
prove "both runs saw the 2 s stall (max latency over 1.5 s)" is "$cmax > 1500 && $omax > 1500"
prove "with -R, p99 is more than 10x the closed-loop p99" is "$o99 > 10 * $c99"
prove "with -R, p99 is over 500 ms: the stall reached real users' requests" is "$o99 > 500"
prove "in the -R log, every transaction's time includes its schedule lag (time >= lag)" is "$bad == 0"
prove "subtracting the lag gives back a closed-loop-sized p99 (within 5x)" is "$s99 < 5 * $c99 + 0.5"

# ---------------------------------------------------------------------------
section "A minute with a checkpoint and autovacuum in it"
# TPC-B-like, 4 clients, 60 s, one log line per second. synchronous_commit=off
# keeps commit fsyncs out of the picture, so what remains is the checkpoint.
# A sampler records pg_stat_wal and pg_stat_checkpointer once a second.
av_before=$(sql bench -c "select autovacuum_count from pg_stat_user_tables where relname = 'pgbench_tellers'")
sh_in "cat > ck.sh" <<'EOF'
rm -f ck_* samples.txt done.flag
( until [ -f done.flag ]; do
    psql -X -At -F ' ' -d bench -c "select extract(epoch from now())::bigint, w.wal_bytes, w.wal_fpi, c.num_timed + c.num_requested
                                    from pg_stat_wal w, pg_stat_checkpointer c" >> samples.txt
    sleep 1
  done ) &
PGOPTIONS="-c synchronous_commit=off" pgbench -n -M prepared -c 4 -j 4 -T 60 -P 10 \
  --log --log-prefix=ck_ --aggregate-interval=1 bench 2>&1 | grep -E '^progress|^tps'
touch done.flag
wait
EOF
sh_in "bash ck.sh" | sed 's/^/  /'
# Per second: transactions, average latency (ms), FPIs, whether a checkpoint
# began in that second, and WAL bytes.
sh_in "cat ck_* | awk '{ n[\$1] += \$2; s[\$1] += \$3 } END { for (t in n) if (n[t]) printf \"%d %d %.3f\n\", t, n[t], s[t] / n[t] / 1000 }' | sort -n > lat.txt
       awk 'NR > 1 { printf \"%d %d %d %d\n\", \$1, \$3 - pf, (\$4 > pc), \$2 - pw } { pf = \$3; pc = \$4; pw = \$2 }' samples.txt > wal.txt
       join lat.txt wal.txt > sec.txt"
sec=$(sh_in "cat sec.txt")
first=$(head -n 1 <<<"$sec" | awk '{ print $1 }'); last=$(tail -n 1 <<<"$sec" | awk '{ print $1 }')
# Checkpoint starts with at least 5 s of run on both sides.
starts=$(awk -v f="$first" -v l="$last" '$5 == 1 && $1 >= f + 5 && $1 <= l - 5 { print $1 }' <<<"$sec")
echo "  per second around each checkpoint start (time, tps, avg ms, FPIs, WAL bytes per transaction):"
for s in $starts; do
  awk -v s="$s" '$1 >= s - 4 && $1 <= s + 5 { printf "    %+3d s  %6d tps  %7.3f ms  %6d fpi  %6d B/tx%s\n", $1 - s, $2, $3, $4, $6 / $2, ($1 == s ? "   <- checkpoint starts" : "") }' <<<"$sec"
done
prove "a checkpoint started inside the one-minute run" test -n "$starts"
median_lat=$(awk '{ print $3 }' <<<"$sec" | sort -n | awk '{ a[NR] = $1 } END { print a[int((NR + 1) / 2)] }')
for s in $starts; do
  fpi_before=$(awk -v s="$s" '$1 >= s - 5 && $1 < s { f += $4 } END { print f + 0 }' <<<"$sec")
  fpi_after=$(awk -v s="$s" '$1 >= s && $1 < s + 5 { f += $4 } END { print f + 0 }' <<<"$sec")
  wal_before=$(awk -v s="$s" '$1 >= s - 5 && $1 < s { w += $6; n += $2 } END { printf "%d", w / n }' <<<"$sec")
  wal_after=$(awk -v s="$s" '$1 >= s && $1 < s + 5 { w += $6; n += $2 } END { printf "%d", w / n }' <<<"$sec")
  lat_after=$(awk -v s="$s" '$1 >= s && $1 < s + 5 { l += $3; n++ } END { printf "%.3f", l / n }' <<<"$sec")
  echo "  checkpoint at +$((s - first)) s: FPIs 5 s before $fpi_before, 5 s after $fpi_after;" \
       "WAL per transaction $wal_before -> $wal_after bytes; latency 5 s after ${lat_after} ms, run median ${median_lat} ms"
  prove "full-page images jump after the checkpoint starts (5 s after > 5x the 5 s before)" \
    is "$fpi_after > 5 * $fpi_before + 100"
  prove "the same transactions write more than twice the WAL each in the 5 s after it starts" \
    is "$wal_after > 2 * $wal_before"
done
av_after=$(sql bench -c "select autovacuum_count from pg_stat_user_tables where relname = 'pgbench_tellers'")
prove "autovacuum processed pgbench_tellers during the run" is "$av_after > $av_before"

# ---------------------------------------------------------------------------
section "Production-shaped data: the seed is uniform on purpose"
prove "in the seed, the busiest 1% of projects hold under 2% of events" \
  holds book "select sum(c) * 1.0 / 2000000 < 0.02
              from (select count(*) as c from events group by project_id order by c desc limit 200) t"
sql book <<'SQL' >/dev/null
create table ev_uniform as select * from events where id <= 500000;
create table ev_skewed  as select * from events where id <= 500000;
-- Log-uniform project ids: a few huge projects, a long tail of small ones.
select setseed(0.42);
update ev_skewed set project_id = floor(exp(random() * ln(20000)))::bigint;
vacuum full ev_skewed;
create index on ev_uniform (project_id);
create index on ev_skewed (project_id);
create index on ev_uniform (created_at);
create index on ev_skewed (created_at);
analyze ev_uniform, ev_skewed;
SQL
prove "in the skewed copy, the busiest 1% of projects hold over 40% of events" \
  holds book "select sum(c) * 1.0 / 500000 > 0.40
              from (select count(*) as c from ev_skewed group by project_id order by c desc limit 200) t"
# The project dashboard's query: the newest 20 events of one project.
u_plan=$(sql book -c "explain select * from ev_uniform where project_id = 1 order by created_at desc limit 20")
s_plan=$(sql book -c "explain select * from ev_skewed where project_id = 1 order by created_at desc limit 20")
echo "$u_plan" | sed 's/^/  uniform: /'
echo "$s_plan" | sed 's/^/  skewed:  /'
prove "on uniform data, project 1 plans a scan of the project_id index and a sort (about 25 rows)" \
  grep -q "Index Scan on ev_uniform_project_id_idx" <<<"$u_plan"
prove "on skewed data, the same query walks the created_at index backward and filters (about 35,000 rows)" \
  grep -q "Index Scan Backward using ev_skewed_created_at_idx" <<<"$s_plan"

section "A month of updates: dead tuples and bloat"
sql book <<'SQL' >/dev/null
create table projects_fresh as select * from projects;
create table projects_aged  as select * from projects;
alter table projects_aged set (autovacuum_enabled = off);
-- Thirty "days": each day updates a third of the rows; vacuum runs once a
-- week. VACUUM can't run inside a function or DO block, so psql's \gexec
-- runs the generated statements one at a time.
select format('update projects_aged set name = name || %L where id %% 3 = %s', '', d % 3),
       case when d % 7 = 0 then 'vacuum projects_aged' end
from generate_series(1, 30) d
order by d
\gexec
vacuum projects_aged;
SQL
fresh=$(sql book -c "select pg_relation_size('projects_fresh') / 8192")
aged=$(sql book -c "select pg_relation_size('projects_aged') / 8192")
free=$(sql book -c "select round(free_percent) from pgstattuple('projects_aged')")
echo "  fresh copy: $fresh pages   after a month of updates: $aged pages, ${free}% free space"
prove "the aged table holds the same rows in at least 1.5x the pages" is "$aged >= 1.5 * $fresh"
prove "and over 25% of it is free space a fresh load doesn't have" is "$free > 25"

section "Copy production safely: mask in a clone, dump the clone"
sql postgres -c "create database staging template book"
sql staging <<'SQL' >/dev/null
create extension pgcrypto;
update users
   set email = encode(hmac(email, 'a-secret-that-stays-on-the-server', 'sha256'), 'hex') || '@example.invalid',
       name  = 'User ' || id;
SQL
prove "masking kept every email distinct (100,000), so unique constraints and joins still work" \
  holds staging "select count(distinct email) = 100000 from users"
prove "the masked clone still has the original email in a dead row version on disk" \
  holds staging "select exists (select 1 from generate_series(0, (pg_relation_size('users') / 8192)::int - 1) b
                            where position(convert_to('user1000@example.com', 'UTF8') in get_raw_page('users', 'main', b)) > 0)"
hits=$("${COMPOSE[@]}" exec -T postgres bash -c "pg_dump -t users staging | grep -c '@example.com' || true")
prove "but a pg_dump of the clone contains no original email address" is "$hits == 0"
sql postgres -c "drop database staging"

section "Statistics alone don't make an empty table big"
sh_in "createdb shape && pg_dump --schema-only book | psql -X -q -d shape >/dev/null 2>&1 \
       && pg_dump --statistics-only book | psql -X -q -d shape >/dev/null 2>&1"
prove "pg_dump --statistics-only carried relpages and reltuples into the empty copy" \
  holds shape "select relpages = $(sql book -c "select relpages from pg_class where relname = 'events'")
               and reltuples > 1900000 from pg_class where relname = 'events'"
est_book=$(sql book -c "explain (format json) select * from events where kind = 'alert'" | grep -o '"Plan Rows": [0-9]*' | head -n 1 | grep -o '[0-9]*$')
est_shape=$(sql shape -c "explain (format json) select * from events where kind = 'alert'" | grep -o '"Plan Rows": [0-9]*' | head -n 1 | grep -o '[0-9]*$')
echo "  estimated rows for kind = 'alert': book $est_book, empty copy with restored stats $est_shape"
prove "the full database estimates over 200,000 alert rows" is "$est_book > 200000"
prove "the empty copy with the same statistics estimates fewer than 10" is "$est_shape < 10"

echo
echo "all claims proved in $((SECONDS - started)) s"
