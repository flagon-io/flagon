#!/usr/bin/env bash
# Lab for "Shard last"
# https://www.flagon.io/books/eight-kilobytes/sharding
#
# Run: ./lab 39                  (from this folder; Linux, macOS, or Git Bash)
#      EVENTS=2000000 ./lab 39   (the chapter's full-size events table)
#      KEEP=1 ./lab 39           (leave the cluster up to explore; then
#        docker compose -f 39-sharding.compose.yml exec citus-coord psql
#        and docker compose -f 39-sharding.compose.yml down -v when done)
#
# Starts a Citus 14.2 cluster (coordinator plus two workers) and a plain
# PostgreSQL 18 server from 39-sharding.compose.yml, proves the chapter's
# claims, and always tears everything down again, volumes included.
# Every claim prints PROVED; the first one that doesn't hold stops the run.

# Events loaded into the cluster. The chapter used 2,000,000; a tenth keeps
# the run short, and every check below holds at either size.
EVENTS="${EVENTS:-200000}"
LAB_COMPOSE=39-sharding.compose.yml
. "$(dirname "$0")/lib.sh"

# on <service> [psql args]: run psql on one node, unaligned, quiet.
on() {
  local svc="$1"; shift
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" "$svc" \
    psql -X -q -At -v ON_ERROR_STOP=1 "$@"
}
coord() { on citus-coord "$@"; }
# holds <service> <sql>: the query returns true.
holds() { [ "$(on "$1" -c "$2")" = "t" ]; }
# has <needle> <haystack>: plain substring match.
has() { grep -qF -- "$1" <<<"$2"; }
# fails_with <needle> <service> <sql>: the statement errors, mentioning needle.
fails_with() {
  local needle="$1" svc="$2" sql="$3" out
  if out=$(on "$svc" -c "$sql" 2>&1); then return 1; fi
  has "$needle" "$out"
}

# A repartition join opens a fresh connection for every fetch between nodes:
# about 900 new backends per join here, each one a fork of that node's
# postmaster. Some hosts can't take that. On Docker Desktop for Windows (WSL2
# kernel 6.6), a just-forked backend occasionally dies with SIGSEGV on a
# perfectly good instruction, more often while the VM reclaims page cache
# (autoMemoryReclaim). Plain postgres:18.6 does it too under the same fork
# storm, with or without SSL, so it's the host, not Citus. Postgres then
# restarts that whole node, which shows up as "cannot connect to citus-w2:5432
# to fetch intermediate results" and a flood of "SSL error: unexpected eof"
# from the connections it cut. The repartitioned queries only read, so when
# that happens we wait for the nodes and run the query again.
node_restarted() {
  grep -qE 'server closed the connection unexpectedly|crash of another server process|in recovery mode|not yet accepting connections|to fetch intermediate results' <<<"$1"
}
# coord_again [psql args]: coord, run up to three times if a node restarts under it.
coord_again() {
  local out try svc
  for try in 1 2 3; do
    if out=$(coord "$@" 2>&1); then printf '%s\n' "$out"; return 0; fi
    if [ "$try" = 3 ] || ! node_restarted "$out"; then printf '%s\n' "$out" >&2; return 1; fi
    echo "   (a node restarted mid-query, a host problem rather than a result; running it again)" >&2
    for svc in citus-coord citus-w1 citus-w2; do
      until on "$svc" -c "select 1" >/dev/null 2>&1; do sleep 1; done
    done
  done
}

echo "starting the cluster (first run pulls citusdata/citus:14.2.0 and postgres:18.6)"
start

section "Setting up the cluster"
coord <<'SQL' >/dev/null
select citus_set_coordinator_host('citus-coord', 5432);
select citus_add_node('citus-w1', 5432);
select citus_add_node('citus-w2', 5432);
SQL
prove "Citus 14.2 runs on PostgreSQL 18" \
  holds citus-coord "select citus_version() like 'Citus 14.2%' and current_setting('server_version_num')::int / 10000 = 18"
prove "the coordinator registers two workers" \
  holds citus-coord "select count(*) = 2 from citus_get_active_worker_nodes()"
prove "the default citus.shard_count is 32" \
  holds citus-coord "select current_setting('citus.shard_count') = '32'"

section "One ordering trap: foreign keys before distributing"
coord <<'SQL' >/dev/null
create table trap_accounts (id bigint generated always as identity primary key);
create table trap_users (
  id          bigint generated always as identity,
  account_id  bigint not null references trap_accounts (id),
  primary key (account_id, id)
);
select create_reference_table('trap_accounts');
SQL
prove "with the foreign key in place, distributing users fails on its identity column" \
  fails_with "cannot complete operation on a table with identity column" citus-coord \
  "select create_distributed_table('trap_users', 'account_id')"
coord -c "drop table trap_users, trap_accounts" >/dev/null

section "Loading the tenant-keyed schema ($EVENTS events)"
coord -v events="$EVENTS" <<'SQL' >/dev/null
create table accounts (
  id          bigint generated always as identity primary key,
  name        text not null,
  plan        text not null default 'free' check (plan in ('free', 'team', 'enterprise')),
  created_at  timestamptz not null default now()
);
create table users (
  id          bigint generated always as identity,
  account_id  bigint not null,
  email       text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  primary key (account_id, id),
  unique (account_id, email)
);
create table projects (
  id           bigint generated always as identity,
  account_id   bigint not null,
  owner_id     bigint not null,
  name         text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (account_id, id)
);
create table events (
  id          bigint generated always as identity,
  account_id  bigint not null,
  project_id  bigint not null,
  user_id     bigint,
  kind        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (account_id, id)
);
select setseed(0.42);
insert into accounts (name, plan, created_at)
select 'Account ' || g,
       (array['free','free','free','team','team','enterprise'])[1 + floor(random()*6)::int],
       now() - (random() * interval '1000 days')
from generate_series(1, 1000) g;
insert into users (account_id, email, name, created_at)
select 1 + (g % 1000), 'user' || g || '@example.com', 'User ' || g,
       now() - (random() * interval '900 days')
from generate_series(1, 100000) g;
insert into projects (account_id, owner_id, name, archived_at, created_at)
select u.account_id, u.id, 'Project ' || g,
       case when random() < 0.2 then now() - random() * interval '100 days' end,
       now() - (random() * interval '800 days')
from generate_series(1, 20000) g
join users u on u.id = 1 + ((g * 7) % 100000);
insert into events (account_id, project_id, user_id, kind, payload, created_at)
select p.account_id, p.id, p.owner_id, r.kind,
       jsonb_build_object('status', r.status, 'duration_ms', r.duration_ms, 'region', r.region),
       r.created_at
from (
  select g,
         1 + floor(random()*20000)::bigint as project_id,
         (array['deploy','deploy','build','build','build','comment','alert','login'])[1 + floor(random()*8)::int] as kind,
         (array['ok','ok','ok','failed'])[1 + floor(random()*4)::int] as status,
         floor(random()*5000)::int as duration_ms,
         (array['iad','sfo','ams','fra','syd'])[1 + floor(random()*5)::int] as region,
         now() - interval '365 days' + (g * interval '365 days' / :events) as created_at
  from generate_series(1, :events) g
) r
join projects p on p.id = r.project_id
order by r.g;

select create_reference_table('accounts');
select create_distributed_table('users',    'account_id');
select create_distributed_table('projects', 'account_id', colocate_with => 'users');
select create_distributed_table('events',   'account_id', colocate_with => 'users');
SQL
prove "each distributed table is split into 32 shards" \
  holds citus-coord "select bool_and(shard_count = 32) and count(*) = 3 from citus_tables where citus_table_type = 'distributed'"
prove "colocate_with gives users, projects, and events the same colocation group" \
  holds citus-coord "select count(distinct colocation_id) = 1 from citus_tables where citus_table_type = 'distributed'"
prove "every row arrived on the workers" \
  holds citus-coord "select (select count(*) from users) = 100000 and (select count(*) from projects) = 20000 and (select count(*) from events) between $EVENTS * 0.99 and $EVENTS"
prove "account 42's users, projects, and events sit on the same worker" \
  holds citus-coord "select count(distinct nodename) = 1 from citus_shards s join pg_dist_shard d using (shardid) where s.table_name in ('users'::regclass, 'projects'::regclass, 'events'::regclass) and hashint8(42) between d.shardminvalue::int and d.shardmaxvalue::int"

section "Reference or distributed: the accounts table"
prove "accounts is a reference table: one shard" \
  holds citus-coord "select citus_table_type = 'reference' and shard_count = 1 from citus_tables where table_name = 'accounts'::regclass"
prove "with a full copy on every node, coordinator included" \
  holds citus-coord "select count(distinct nodename) = 3 from citus_shards where table_name = 'accounts'::regclass"
prove "each worker's copy holds all 1,000 accounts" \
  holds citus-w1 "select count(*) = 1000 from accounts"

section "Constraints must include the distribution column"
coord <<'SQL' >/dev/null
alter table users    add foreign key (account_id) references accounts (id);
alter table projects add foreign key (account_id) references accounts (id);
alter table events   add foreign key (account_id) references accounts (id);
alter table projects add foreign key (account_id, owner_id) references users (account_id, id);
alter table events   add foreign key (account_id, project_id) references projects (account_id, id);
alter table events   add foreign key (account_id, user_id) references users (account_id, id);
SQL
prove "composite foreign keys and foreign keys to the reference table are accepted" \
  holds citus-coord "select count(*) = 6 from pg_constraint where contype = 'f' and conrelid in ('users'::regclass, 'projects'::regclass, 'events'::regclass)"
coord -c "create table t1 (id bigint generated always as identity primary key, account_id bigint not null)" >/dev/null
prove "a primary key without the distribution column can't be distributed" \
  fails_with "Distributed relations cannot have UNIQUE, EXCLUDE, or PRIMARY KEY constraints that do not include the partition column" \
  citus-coord "select create_distributed_table('t1', 'account_id')"
prove "a globally unique email is rejected the same way" \
  fails_with 'cannot create constraint on "users"' citus-coord \
  "alter table users add constraint users_email_key unique (email)"
prove "a foreign key with the columns swapped is refused" \
  fails_with "cannot create foreign key constraint" citus-coord \
  "alter table projects add constraint projects_owner_bad foreign key (owner_id, account_id) references users (account_id, id)"
coord <<'SQL' >/dev/null
create table project_stars (user_id bigint not null, account_id bigint not null, project_id bigint not null);
select create_distributed_table('project_stars', 'user_id');
SQL
prove "a table distributed by user_id can't reference projects" \
  fails_with "cannot create foreign key constraint" citus-coord \
  "alter table project_stars add foreign key (account_id, project_id) references projects (account_id, id)"
coord -c "drop table t1, project_stars" >/dev/null

section "One tenant, one task"
plan=$(coord -c "explain (analyze, costs off, timing off)
  select kind, count(*) from events
  where account_id = 42 and created_at >= now() - interval '7 days'
  group by kind")
prove "a query with account_id = 42 is a single task" has "Task Count: 1" "$plan"
prove "that task runs on a worker, against one physical shard of events" \
  bash -c 'grep -qE "Node: host=citus-w[12] " <<<"$1" && grep -qE "on events_[0-9]+ events" <<<"$1"' _ "$plan"
prove "the aggregate runs inside the task, on the worker" \
  bash -c 'awk "/->  Task/{t=1} t && /Aggregate/{f=1} END{exit !f}" <<<"$1"' _ "$plan"

section "Cross-tenant aggregates fan out"
plan=$(coord -c "explain (analyze, costs off, timing off, buffers off)
  select payload->>'region' as region, count(*) from events
  where kind = 'deploy' and payload->>'status' = 'failed'
  group by 1 order by 2 desc")
prove "without a tenant filter, the query becomes 32 tasks" has "Task Count: 32" "$plan"
prove "the coordinator receives 160 partial rows (32 shards times 5 regions)" \
  has "Custom Scan (Citus Adaptive) (actual rows=160.00" "$plan"
plan=$(coord -c "explain (costs off) select id from users where email = 'user4242@example.com'")
prove "a lookup by email alone fans out to all 32 shards, without an error" has "Task Count: 32" "$plan"

section "Colocated joins push down, others repartition or fail"
plan=$(coord -c "explain (costs off)
  select p.name, count(*) as alerts
  from events e
  join projects p on p.account_id = e.account_id and p.id = e.project_id
  where e.kind = 'alert'
  group by p.name order by alerts desc limit 5")
prove "the colocated join runs as 32 tasks" has "Task Count: 32" "$plan"
prove "with the Hash Join inside each task, between matching shards" \
  bash -c 'grep -q "Hash Join" <<<"$1" && grep -qE "events_[0-9]+ e" <<<"$1" && grep -qE "projects_[0-9]+ p" <<<"$1" && ! grep -q MapMergeJob <<<"$1"' _ "$plan"
plan=$(coord -c "explain (costs off)
  select a.plan, count(*) from events e join accounts a on a.id = e.account_id
  where e.kind = 'deploy' group by a.plan")
prove "a join with the reference table also runs inside each task" \
  bash -c 'grep -q "Task Count: 32" <<<"$1" && grep -qE "accounts_[0-9]+ a" <<<"$1"' _ "$plan"

section "Non-colocated joins: refused, then repartitioned"
join_sql="select u.email, count(*) from projects p join users u on u.id = p.owner_id group by u.email order by 2 desc limit 3"
prove "a join without account_id is refused by default" \
  fails_with "the query contains a join that requires repartitioning" citus-coord "$join_sql"
plan=$(coord -c "set citus.enable_repartition_joins = on" -c "explain (costs off) $join_sql")
prove "with repartitioning on, two MapMergeJobs reshuffle both tables" \
  bash -c '[ "$(grep -c MapMergeJob <<<"$1")" = 2 ] && grep -q "Map Task Count: 32" <<<"$1"' _ "$plan"
prove "and the merged join runs as 12 tasks" \
  bash -c 'grep -q "Merge Task Count: 12" <<<"$1" && grep -q "Task Count: 12" <<<"$1"' _ "$plan"
# Execution time of a query, best of three, in milliseconds.
best_ms() {
  coord_again -c "set citus.enable_repartition_joins = on" -c "
    do \$\$ declare p json; best numeric := 1e9; begin
      for i in 1..3 loop
        execute 'explain (analyze, format json) $1' into p;
        best := least(best, (p->0->>'Execution Time')::numeric);
      end loop;
      raise warning '%', round(best, 1);
    end \$\$" | sed -n 's/.*WARNING: *//p'
}
slow=$(best_ms "select count(*) from projects p join users u on u.id = p.owner_id")
fast=$(best_ms "select count(*) from projects p join users u on u.account_id = p.account_id and u.id = p.owner_id")
echo "   repartition join: ${slow} ms; with account_id in the join: ${fast} ms (your numbers will differ)"
prove "adding account_id to the join makes it at least 5 times faster" \
  awk -v s="$slow" -v f="$fast" 'BEGIN { exit !(s > 5 * f) }'
agree() { [ "$(coord_again -c "$1")" = "t" ]; }
prove "and both joins agree on the answer" \
  agree "set citus.enable_repartition_joins = on; select (select count(*) from projects p join users u on u.id = p.owner_id) = (select count(*) from projects p join users u on u.account_id = p.account_id and u.id = p.owner_id)"

section "What stays on the coordinator, and cross-shard transactions need two-phase commit"
plan=$(coord -c "explain (verbose, costs off) select count(distinct user_id) from events")
prove "count(distinct user_id) asks every shard for its distinct user_ids" \
  bash -c 'grep -q "Task Count: 32" <<<"$1" && grep -qi "GROUP BY user_id" <<<"$1"' _ "$plan"
plan=$(coord -c "explain (analyze, costs off, timing off, buffers off)
  select id, rank() over (order by created_at desc) from projects")
prove "a window over all tenants pulls all 20,000 projects to the coordinator" \
  bash -c 'grep -q "Custom Scan (Citus Adaptive) (actual rows=20000.00" <<<"$1" && awk "/->  Task/{t=1} t && /WindowAgg/{f=1} END{exit f}" <<<"$1"' _ "$plan"
plan=$(coord -c "explain (costs off)
  select id, rank() over (partition by account_id order by created_at desc) from projects")
prove "partitioned by account_id, the WindowAgg runs on the workers" \
  bash -c 'awk "/->  Task/{t=1} t && /WindowAgg/{f=1} END{exit !f}" <<<"$1"' _ "$plan"
out=$(coord -c "set citus.log_remote_commands = on" -c "set client_min_messages = notice" \
  -c "update events set kind = kind where kind = 'alert'" 2>&1)
prove "an update with no tenant filter commits with two-phase commit on both workers" \
  bash -c 'grep -q "PREPARE TRANSACTION" <<<"$1" && grep -q "COMMIT PREPARED" <<<"$1" && grep -q "citus-w1" <<<"$1" && grep -q "citus-w2" <<<"$1"' _ "$out"

section "Metadata, DDL, and moving a hot tenant"
prove "the workers carry the shard metadata too (Citus 11+)" \
  holds citus-w1 "select count(*) >= 4 from pg_dist_partition"
prove "every node is marked as having metadata" \
  holds citus-coord "select bool_and(hasmetadata and metadatasynced) from pg_dist_node"
coord -c "alter table events add column note text" >/dev/null
note_cols() {
  on "$1" -c "set citus.override_table_visibility = off" -c "select count(*) from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    where c.relname ~ '^events_[0-9]+$' and a.attname = 'note' and not a.attisdropped"
}
prove "alter table on the coordinator reaches all 32 events shards on the workers" \
  [ $(( $(note_cols citus-w1) + $(note_cols citus-w2) )) -eq 32 ]
coord -c "alter table events drop column note" >/dev/null

section "Global ids"
id_sql="insert into events (account_id, project_id, kind)
  select 42, id, 'login' from projects where account_id = 42 order by id limit 1
  returning id >> 48"
c_bits=$(coord -c "$id_sql"); w1_bits=$(on citus-w1 -c "$id_sql"); w2_bits=$(on citus-w2 -c "$id_sql")
echo "   node bits: coordinator $c_bits, citus-w1 $w1_bits, citus-w2 $w2_bits"
prove "the same insert accepted on every node, ids carry the node's group in the top 16 bits" \
  [ "$c_bits $w1_bits $w2_bits" = "0 1 2" ]
prove "48 low bits allow 281 trillion ids per node, 16 high bits 65,536 nodes" \
  [ "$(( (1 << 48) / 1000000000000 )) $(( 1 << 16 ))" = "281 65536" ]

section "Hot tenants and skew"
coord <<SQL >/dev/null
insert into events (account_id, project_id, user_id, kind, created_at)
select 7, p.id, p.owner_id, 'build', now() - (g * interval '1 second')
from generate_series(1, $EVENTS / 5) g
cross join lateral (select id, owner_id from projects where account_id = 7 order by id limit 1) p;
SQL
prove "account 7's shard is now the largest, over 3 times the median events shard" \
  holds citus-coord "with s as (select shardid, shard_size from citus_shards where table_name = 'events'::regclass),
    seven as (select shardid from pg_dist_shard where logicalrelid = 'events'::regclass and hashint8(7) between shardminvalue::int and shardmaxvalue::int)
    select (select shardid from s order by shard_size desc limit 1) = (select shardid from seven)
       and (select max(shard_size) from s) > 3 * (select percentile_cont(0.5) within group (order by shard_size) from s)"

section "Moving a hot tenant: isolate and move"
new_shard=$(coord -c "select isolate_tenant_to_new_shard('events', 7, cascade_option => 'CASCADE', shard_transfer_mode => 'block_writes')")
echo "   account 7's new events shard: $new_shard"
prove "isolate_tenant_to_new_shard gives account 7 a shard whose hash range is a single value" \
  holds citus-coord "select shardminvalue = shardmaxvalue and shardminvalue::int = hashint8(7) from pg_dist_shard where shardid = $new_shard"
prove "CASCADE splits the colocated users and projects shards the same way" \
  holds citus-coord "select count(*) = 3 and count(distinct logicalrelid) = 3 from pg_dist_shard where shardminvalue = shardmaxvalue and shardminvalue::int = hashint8(7)"
prove "the old shard became three, so events now has 34 shards" \
  holds citus-coord "select count(*) = 34 from pg_dist_shard where logicalrelid = 'events'::regclass"
from=$(coord -c "select nodename from citus_shards where shardid = $new_shard")
to=$([ "$from" = citus-w1 ] && echo citus-w2 || echo citus-w1)
coord -c "select citus_move_shard_placement($new_shard, '$from', 5432, '$to', 5432, shard_transfer_mode => 'force_logical')" >/dev/null
prove "citus_move_shard_placement moves account 7's three shards to the other worker" \
  holds citus-coord "select count(*) = 3 and bool_and(nodename = '$to') from citus_shards s join pg_dist_shard d using (shardid) where d.shardminvalue = d.shardmaxvalue and d.shardminvalue::int = hashint8(7)"
prove "and account 7's rows are all still there" \
  holds citus-coord "select count(*) > $EVENTS / 5 from events where account_id = 7"
new42=$(coord -c "select isolate_tenant_to_new_shard('events', 42, cascade_option => 'CASCADE', shard_transfer_mode => 'force_logical')")
prove "the online (force_logical) split works too, here for account 42" \
  holds citus-coord "select shardminvalue = shardmaxvalue and shardminvalue::int = hashint8(42) from pg_dist_shard where shardid = $new42"
prove "citus_cleanup_orphaned_resources() exists to clean up after a failed split" \
  holds citus-coord "select count(*) = 1 from pg_proc where proname = 'citus_cleanup_orphaned_resources' and prokind = 'p'"
prove "the rebalancer ships in the open-source extension" \
  holds citus-coord "select count(*) = 2 from pg_proc where proname in ('citus_rebalance_start', 'citus_rebalance_status')"

section "Schema-based sharding"
coord <<'SQL' >/dev/null
set citus.enable_schema_based_sharding to on;
create schema tenant_acme;
create table tenant_acme.events (
  id bigint generated always as identity primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
create table tenant_acme.projects (
  id bigint generated always as identity primary key,
  name text not null
);
create schema tenant_globex;
create table tenant_globex.events (
  id bigint generated always as identity primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
SQL
prove "tables in a tenant schema become schema-sharded, with no distribution column" \
  holds citus-coord "select count(*) = 3 and bool_and(citus_table_type = 'schema' and distribution_column = '<none>') from citus_tables where table_name::text like 'tenant_%'"
prove "each schema is its own colocation group" \
  holds citus-coord "select count(distinct colocation_id) = 2 and count(distinct colocation_id) filter (where table_name::text like 'tenant_acme.%') = 1 from citus_tables where table_name::text like 'tenant_%'"
prove "each schema lives whole on one worker" \
  holds citus-coord "select bool_and(n = 1) from (select count(distinct nodename) as n from citus_shards where table_name::text like 'tenant_%' and nodename like 'citus-w%' group by split_part(table_name::text, '.', 1)) x"
plan=$(coord -c "explain (costs off) select p.name, count(*) from tenant_acme.events e join tenant_acme.projects p on p.id = e.id group by p.name")
prove "a join inside one schema is a single task" has "Task Count: 1" "$plan"

section "postgres_fdw is a building block (plain PostgreSQL 18)"
for w in citus-w1 citus-w2; do
  on "$w" -c "create database fdwshard" >/dev/null
  on "$w" -d fdwshard -c "create table events (account_id bigint not null, id bigint not null, kind text not null, primary key (account_id, id))" >/dev/null
done
on pg -c "create database router" >/dev/null
on pg -d router <<'SQL' >/dev/null
create extension postgres_fdw;
create server shard1 foreign data wrapper postgres_fdw
  options (host 'citus-w1', dbname 'fdwshard', async_capable 'true');
create server shard2 foreign data wrapper postgres_fdw
  options (host 'citus-w2', dbname 'fdwshard', async_capable 'true');
create user mapping for current_user server shard1 options (user 'postgres');
create user mapping for current_user server shard2 options (user 'postgres');

create table events (
  account_id  bigint not null,
  id          bigint not null,
  kind        text   not null
) partition by hash (account_id);

create foreign table events_s1 partition of events
  for values with (modulus 2, remainder 0) server shard1 options (table_name 'events');
create foreign table events_s2 partition of events
  for values with (modulus 2, remainder 1) server shard2 options (table_name 'events');

insert into events (account_id, id, kind)
select 1 + g % 100, g, (array['deploy','build','comment','alert','login'])[1 + g % 5]
from generate_series(1, 50000) g;
SQL
prove "50,000 rows for 100 accounts route 26,000 to one server and 24,000 to the other" \
  [ "$(on citus-w1 -d fdwshard -c 'select count(*) from events') $(on citus-w2 -d fdwshard -c 'select count(*) from events')" = "26000 24000" ]
plan=$(on pg -d router -c "explain (verbose, costs off) select kind, count(*) from events where account_id = 42 group by kind")
prove "a tenant-scoped query prunes to one remote table and sends its filter along" \
  bash -c '[ "$(grep -c "Foreign Scan on" <<<"$1")" = 1 ] && grep -qF "Remote SQL: SELECT kind FROM public.events WHERE ((account_id = 42))" <<<"$1"' _ "$plan"
plan=$(on pg -d router -c "set enable_partitionwise_aggregate = on" -c "explain (verbose, costs off) select account_id, count(*) from events group by account_id")
prove "grouping by the partition key pushes the aggregate to both servers, run asynchronously" \
  bash -c '[ "$(grep -c "Async Foreign Scan" <<<"$1")" = 2 ] && [ "$(grep -c "Relations: Aggregate on" <<<"$1")" = 2 ]' _ "$plan"
plan=$(on pg -d router -c "set enable_partitionwise_aggregate = on" -c "explain (verbose, costs off) select kind, count(*) from events group by kind")
prove "grouping by anything else pulls the rows back and counts locally" \
  bash -c 'grep -qF "Remote SQL: SELECT kind FROM public.events" <<<"$1" && ! grep -q "Relations: Aggregate on" <<<"$1"' _ "$plan"

prove "plain PostgreSQL ships with two-phase commit off (max_prepared_transactions = 0)"   holds pg "select current_setting('max_prepared_transactions') = '0'"

section "Resharding means moving tenants (row-filtered logical replication)"
on citus-w1 -d fdwshard -c "create publication move_acct_42 for table events where (account_id = 42)" >/dev/null
on pg -c "create database dest" >/dev/null
on pg -d dest <<'SQL' >/dev/null
create table events (account_id bigint not null, id bigint not null, kind text not null, primary key (account_id, id));
create subscription move_acct_42
  connection 'host=citus-w1 dbname=fdwshard user=postgres'
  publication move_acct_42;
SQL
wait_for() { local svc="$1" db="$2" sql="$3" i; for i in $(seq 1 60); do holds_db "$svc" "$db" "$sql" && return 0; sleep 0.5; done; return 1; }
holds_db() { [ "$(on "$1" -d "$2" -c "$3")" = "t" ]; }
prove "the subscription copies account 42's 500 existing rows, and only those" \
  wait_for pg dest "select count(*) = 500 and min(account_id) = 42 and max(account_id) = 42 from events"
on pg -d router -c "insert into events values (42, 50001, 'login')" >/dev/null
prove "a new row for account 42 streams to the destination within seconds" \
  wait_for pg dest "select count(*) = 501 and max(id) = 50001 from events"
prove "and the source's replication slot shows zero bytes of lag" \
  wait_for citus-w1 fdwshard "select pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) = 0 from pg_replication_slots where slot_name = 'move_acct_42'"
on pg -d dest -c "drop subscription move_acct_42" >/dev/null

section "Schema-per-tenant: the catalog grows with every tenant"
on pg -c "create database tenants" >/dev/null
measure() {
  on pg -d tenants -F ' ' -c "select (select count(*) from pg_class),
    (select count(*) from pg_attribute),
    (select sum(pg_total_relation_size(oid)) from pg_class where relnamespace = 'pg_catalog'::regnamespace and relkind in ('r', 'm')),
    pg_database_size(current_database())"
}
read -r rel0 att0 cat0 db0 <<<"$(measure)"
on pg -d tenants <<'SQL' >/dev/null
do $$
begin
  for t in 1..1000 loop
    execute format($f$
      create schema tenant_%1$s;
      create table tenant_%1$s.users (
        id          bigint generated always as identity primary key,
        email       text not null unique,
        name        text not null,
        created_at  timestamptz not null default now()
      );
      create table tenant_%1$s.projects (
        id           bigint generated always as identity primary key,
        owner_id     bigint not null references tenant_%1$s.users (id),
        name         text not null,
        archived_at  timestamptz,
        created_at   timestamptz not null default now()
      );
      create table tenant_%1$s.events (
        id          bigint generated always as identity primary key,
        project_id  bigint not null references tenant_%1$s.projects (id),
        user_id     bigint references tenant_%1$s.users (id),
        kind        text not null,
        payload     jsonb not null default '{}',
        created_at  timestamptz not null default now()
      );
    $f$, t);
    if t % 50 = 0 then commit; end if;  -- 50 tenants per transaction
  end loop;
end $$;
SQL
read -r rel1 att1 cat1 db1 <<<"$(measure)"
mb() { awk -v b="$1" 'BEGIN { printf "%.1f MB", b / 1048576 }'; }
echo "   relations $rel0 -> $rel1, pg_attribute $att0 -> $att1, catalog $(mb "$cat0") -> $(mb "$cat1"), database $(mb "$db0") -> $(mb "$db1")"
prove "1,000 tenants with three empty tables add exactly 16,000 relations" [ $((rel1 - rel0)) -eq 16000 ]
prove "and 97,000 pg_attribute rows" [ $((att1 - att0)) -eq 97000 ]
prove "the system catalogs grow by more than 40 MB before storing a row" [ $(( (cat1 - cat0) / 1048576 )) -gt 40 ]
prove "the database grows by more than 100 MB with no rows at all" [ $(( (db1 - db0) / 1048576 )) -gt 100 ]
ms=$(on pg -d tenants <<'SQL' 2>&1 | sed -n 's/.*WARNING: *//p'
do $$
declare t0 timestamptz := clock_timestamp();
begin
  for t in 1..1000 loop
    execute format('alter table tenant_%s.events add column note text', t);
  end loop;
  raise warning '%', round(extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
SQL
)
echo "   adding a column to events in all 1,000 schemas, one transaction: ${ms} ms (your numbers will differ)"
prove "the 1,000-schema migration completes in one transaction" holds_db pg tenants "select count(*) = 1000 from pg_attribute where attname = 'note' and not attisdropped"

echo
echo "== 39-sharding: all claims proved in $((SECONDS - started)) s (plus cluster start-up)"
