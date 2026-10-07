#!/usr/bin/env bash
# Lab for "Postgres is not MySQL"
# https://www.flagon.io/books/eight-kilobytes/not-mysql
#
# Run: ./lab 10   (from the lab folder; Linux, macOS, or Git Bash)
#
# Starts PostgreSQL 18 and MySQL 8.4 side by side (10-not-mysql.compose.yml,
# default settings on both), loads the same 1,000 accounts and 100,000 users
# into each, and checks every side-by-side claim the chapter makes. Each
# claim prints PROVED or stops the script with NOT PROVED. Both servers and
# their volumes are removed when the script exits, pass or fail.
# Takes a few minutes. KEEP=1 ./lab 10 leaves both servers
# running afterwards so you can poke around (then: docker compose -f
# 10-not-mysql.compose.yml down -v).
LAB_COMPOSE=10-not-mysql.compose.yml
. "$(dirname "$0")/lib.sh"
tidy() { rm -f "${tmp:-}"; }

# pg [psql args]: run psql in database $PGDB (default: book), unaligned output.
pg() { compose exec -T postgres psql -X -q -At -v ON_ERROR_STOP=1 -d "${PGDB:-book}" "$@" | tr -d '\r'; }
# my [mysql args]: run the mysql client in database book, tab-separated output.
my() { compose exec -T -e MYSQL_PWD=mysql mysql mysql --default-character-set=utf8mb4 -uroot -N -B book "$@" | tr -d '\r'; }
# pg_err / my_err: run SQL that should fail and print the error text.
pg_err() { compose exec -T postgres psql -X -q -At -d "${PGDB:-book}" -c "$1" 2>&1 | tr -d '\r' || true; }
my_err() { compose exec -T -e MYSQL_PWD=mysql mysql mysql --default-character-set=utf8mb4 -uroot -N -B book -e "$1" 2>&1 | tr -d '\r' || true; }

between() { [ "$1" -ge "$2" ] && [ "$1" -le "$3" ]; }
has() { grep -qF -- "$2" <<<"$1"; }
clone() { PGDB=postgres pg -c "create database $1 template book"; }

# Innodb_buffer_pool_read_requests is a server-wide counter of page requests.
# Take the difference around a query, three times, and keep the smallest.
my_pages() {
  local best=999999 n i
  for i in 1 2 3; do
    n=$(my -e "select variable_value into @a from performance_schema.global_status
                 where variable_name = 'Innodb_buffer_pool_read_requests';
               $1;
               select variable_value - @a from performance_schema.global_status
                 where variable_name = 'Innodb_buffer_pool_read_requests';" | tail -1)
    [ "$n" -lt "$best" ] && best=$n
  done
  echo "$best"
}
my_binlog_pos() { my -e "show binary log status" | cut -f2; }
# Wait (up to 30 s) until a MySQL query returns a row: lets a background
# session reach the point we want before the next step runs.
my_wait_for() {
  local i
  for i in $(seq 1 60); do
    [ -n "$(my -e "$1")" ] && return 0
    sleep 0.5
  done
  echo "timed out waiting for: $1" >&2; return 1
}

echo "== starting PostgreSQL 18 and MySQL 8.4"
start
tmp=$(mktemp)

echo "== loading the same accounts and users into both"
PGDB=postgres pg -c "create database book"
pg >/dev/null <<'SQL'
create table accounts (
  id          bigint generated always as identity primary key,
  name        text not null,
  plan        text not null default 'free' check (plan in ('free', 'team', 'enterprise')),
  created_at  timestamptz not null default now()
);
create table users (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id),
  email       text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (account_id, email)
);
create table projects (
  id           bigint generated always as identity primary key,
  account_id   bigint not null references accounts (id),
  owner_id     bigint not null references users (id),
  name         text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
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
vacuum analyze;
SQL
pg >/dev/null < helpers.sql
PGDB=postgres pg -c "alter database book is_template true"

# The MySQL port of the same schema. text columns become varchar(255), the
# usual port (a TEXT column also turns off InnoDB's row prefetch, which would
# change the page counts). Foreign keys get MySQL's automatic indexes.
my <<'SQL'
create table accounts (
  id          bigint not null auto_increment primary key,
  name        varchar(255) not null,
  plan        varchar(20) not null default 'free' check (plan in ('free', 'team', 'enterprise')),
  created_at  datetime(6) not null default current_timestamp(6)
);
create table users (
  id          bigint not null auto_increment primary key,
  account_id  bigint not null,
  email       varchar(255) not null,
  name        varchar(255) not null,
  created_at  datetime(6) not null default current_timestamp(6),
  constraint users_account_id_email_key unique (account_id, email),
  constraint users_account_id_fkey foreign key (account_id) references accounts (id)
);
create table projects (
  id           bigint not null auto_increment primary key,
  account_id   bigint not null,
  owner_id     bigint not null,
  name         varchar(255) not null,
  archived_at  datetime(6),
  created_at   datetime(6) not null default current_timestamp(6),
  constraint account_id foreign key (account_id) references accounts (id),
  constraint owner_id foreign key (owner_id) references users (id)
);
set session cte_max_recursion_depth = 200000;
insert into accounts (name, plan, created_at)
with recursive g(n) as (select 1 union all select n + 1 from g where n < 1000)
select concat('Account ', n),
       elt(1 + floor(rand(42) * 6), 'free', 'free', 'free', 'team', 'team', 'enterprise'),
       now(6) - interval floor(rand() * 86400000) second
from g;
insert into users (account_id, email, name, created_at)
with recursive g(n) as (select 1 union all select n + 1 from g where n < 100000)
select 1 + (n % 1000), concat('user', n, '@example.com'), concat('User ', n),
       now(6) - interval floor(rand() * 77760000) second
from g;
analyze table accounts, users;
SQL
prove 'both servers hold 100,000 users' \
  [ "$(pg -c 'select count(*) from users')" = 100000 -a "$(my -e 'select count(*) from users')" = 100000 ]

# Most Postgres checks run in `main`, a copy of the data that follows the
# chapter's order. Physical demos (CLUSTER, WAL, vacuum, locks) get their own
# fresh copies so they can't disturb each other.
clone main
export PGDB=main

echo
echo "== The opening transaction: a duplicate in the middle"
# --force keeps the client going after an error, like an app that catches it.
# (It only applies to statements read from stdin, not -e.)
my_out=$(compose exec -T -e MYSQL_PWD=mysql mysql mysql -uroot --force book 2>&1 <<'SQL' | tr -d '
' || true
start transaction;
insert into users (account_id, email, name) values (1, 'new1@example.com', 'New One');
insert into users (account_id, email, name) values (1, 'user1000@example.com', 'Dup');
insert into users (account_id, email, name) values (1, 'new2@example.com', 'New Two');
commit;
SQL
)
prove 'MySQL rejects the duplicate with error 1062' has "$my_out" "ERROR 1062 (23000)"
prove 'MySQL 8.4 keeps two rows (the duplicate rolled back only itself)' \
  [ "$(my -e "select count(*) from users where email like 'new%'")" = 2 ]
pg_out=$(compose exec -T postgres psql -X -d main 2>&1 <<'SQL' | tr -d '\r' || true
begin;
insert into users (account_id, email, name) values (1, 'new1@example.com', 'New One');
insert into users (account_id, email, name) values (1, 'user1000@example.com', 'Dup');
insert into users (account_id, email, name) values (1, 'new2@example.com', 'New Two');
commit;
SQL
)
prove 'Postgres refuses statements after the error: "current transaction is aborted"' \
  has "$pg_out" "current transaction is aborted, commands ignored until end of transaction block"
prove 'Postgres turns the commit into a rollback' has "$pg_out" "ROLLBACK"
prove 'PostgreSQL 18 keeps none' [ "$(pg -c "select count(*) from users where email like 'new%'")" = 0 ]

echo
echo "== Two bets"
prove 'Postgres pages are 8 KB' [ "$(pg -c 'show block_size')" = 8192 ]
prove 'InnoDB pages are 16 KB' [ "$(my -e 'select @@innodb_page_size')" = 16384 ]

echo
echo "== The table is the primary key in InnoDB"
my -e "create table nopk (a int); create table uqnn (a int not null, unique key uqnn_a (a));"
prove 'with no key at all, InnoDB clusters on a hidden GEN_CLUST_INDEX' \
  [ "$(my -e "select i.name from information_schema.innodb_indexes i
               join information_schema.innodb_tables t using (table_id)
               where t.name = 'book/nopk'")" = GEN_CLUST_INDEX ]
prove 'with no primary key, InnoDB clusters on the first unique not-null index' \
  [ "$(my -e "select i.name from information_schema.innodb_indexes i
               join information_schema.innodb_tables t using (table_id)
               where t.name = 'book/uqnn' and i.type & 1 = 1")" = uqnn_a ]
my -e "drop table nopk, uqnn"

my_range=$(my_pages "select * from users where id between 5000 and 5099")
pg_range=$(pg -c "select lab.buffers('select * from users where id between 5000 and 5099')")
echo "   page requests for id 5000..5099: MySQL $my_range, Postgres buffers $pg_range"
prove 'InnoDB primary key range scan of 100 rows: about 15 page requests' between "$my_range" 8 30
prove 'Postgres primary key range scan of 100 rows: about 7 buffers' between "$pg_range" 4 12
my -e "create table users_text like users; alter table users_text modify name text not null;
       insert into users_text select * from users; analyze table users_text" >/dev/null
my_text=$(my_pages "select * from users_text where id between 5000 and 5099")
my -e "drop table users_text"
prove "with name as TEXT, the same InnoDB range scan costs about one page request per row (got $my_text)" between "$my_text" 90 130
prove 'Postgres users.id has correlation 1 (inserted in id order)' \
  [ "$(pg -c "select correlation from pg_stats where tablename = 'users' and attname = 'id'")" = 1 ]
prove 'Postgres users.account_id and created_at have correlation near 0' \
  [ "$(pg -c "select count(*) from pg_stats where tablename = 'users'
              and attname in ('account_id', 'created_at') and abs(correlation) < 0.1")" = 2 ]

prove 'a Postgres index entry points at a 6-byte ctid' [ "$(pg -c "select typlen from pg_type where typname = 'tid'")" = 6 ]

echo
echo "== CLUSTER is a one-off (fresh copy: cl)"
clone cl
cl_before=$(PGDB=cl pg -c "select lab.buffers('select * from users where account_id = 7')")
prove 'before CLUSTER, the 100 users of account 7 are on 100 heap pages (Bitmap Heap Scan)' \
  [ "$(PGDB=cl pg -c "select (lab.plan('select * from users where account_id = 7') -> 'Plan' ->> 'Exact Heap Blocks')")" = 100 ]
prove 'before CLUSTER, account 7 costs about 106 buffers' between "$cl_before" 95 115
PGDB=cl pg -c "cluster users using users_account_id_email_key" -c "analyze users"
prove 'after CLUSTER, account_id has correlation 1' \
  [ "$(PGDB=cl pg -c "select correlation from pg_stats where tablename = 'users' and attname = 'account_id'")" = 1 ]
prove 'after CLUSTER, id has correlation near 0' \
  [ "$(PGDB=cl pg -c "select (abs(correlation) < 0.1)::text from pg_stats where tablename = 'users' and attname = 'id'")" = true ]
cl_after=$(PGDB=cl pg -c "select lab.buffers('select * from users where account_id = 7')")
cl_range=$(PGDB=cl pg -c "select lab.buffers('select * from users where id between 5000 and 5099')")
echo "   account 7: $cl_before -> $cl_after buffers; id range: $pg_range -> $cl_range buffers"
prove 'after CLUSTER, account 7 costs a handful of buffers (from about 106)' between "$cl_after" 4 15
prove 'after CLUSTER, the primary key range scan costs about 102 buffers (from 7)' between "$cl_range" 95 115
PGDB=cl pg -c "insert into users (account_id, email, name)
               select 7, 'late' || g || '@example.com', 'Late ' || g from generate_series(1, 5) g"
prove 'new rows for account 7 land at the end of the heap, far from their neighbors' \
  [ "$(PGDB=cl pg -c "select (min((ctid::text::point)[0]) filter (where email like 'late%')
                         >= pg_relation_size('users') / 8192 - 2
                       and max((ctid::text::point)[0]) filter (where email not like 'late%') < 20)::text
                       from users where account_id = 7")" = true ]

echo
echo "== Secondary lookups cost two descents in InnoDB"
my_sec=$(my_pages "select * from users where account_id = 7")
pg_sec=$(pg -c "select lab.buffers('select * from users where account_id = 7')")
echo "   account 7 through (account_id, email): MySQL $my_sec page requests, Postgres $pg_sec buffers"
prove 'InnoDB secondary lookup of 100 rows: about 307 page requests, about 3 per row' between "$my_sec" 250 400
prove 'InnoDB pays far more through the secondary index than through the primary key (over 10x)' \
  [ "$my_sec" -gt $((my_range * 10)) ]
prove 'Postgres pays roughly one buffer per row (about 106)' between "$pg_sec" 95 115
my_cov=$(my_pages "select id, email from users where account_id = 7")
prove 'MySQL reads id and email from the secondary index alone ("Covering index lookup")' \
  has "$(my -e "explain analyze select id, email from users where account_id = 7")" "Covering index lookup"
prove 'the covering lookup costs about 15 page requests' between "$my_cov" 8 30

clone cov
PGDB=cov pg -c "create index users_account_cover on users (account_id) include (id, email)" -c "vacuum (analyze) users"
cov_q='select id, email from users where account_id = 7'
prove 'with INCLUDE and a vacuumed table, Postgres uses an Index Only Scan' \
  [ "$(PGDB=cov pg -c "select (lab.plan('$cov_q') -> 'Plan' ->> 'Node Type')")" = "Index Only Scan" ]
prove 'and fetches nothing from the heap (Heap Fetches: 0)' \
  [ "$(PGDB=cov pg -c "select (lab.plan('$cov_q') -> 'Plan' ->> 'Heap Fetches')")" = 0 ]
cov_buf=$(PGDB=cov pg -c "select lab.buffers('$cov_q')")
prove "the index-only scan reads a handful of buffers instead of 106 (got $cov_buf)" between "$cov_buf" 2 10

echo
echo "== An update writes one row, or every index (fresh copy: w)"
clone w
# Rows 99999 and 100000 sit on the table's last page, which has free space.
# (Every other page of a freshly loaded table is full, and an update that
# can't fit its new version on the same page can't be HOT.)
w_out=$(PGDB=w pg <<'SQL'
create extension pg_walinspect;
select pg_relation_filenode('users') u, pg_relation_filenode('users_pkey') pk,
       pg_relation_filenode('users_account_id_email_key') uk \gset
select pg_current_wal_insert_lsn() as s1 \gset
update users set name = 'Renamed' where id = 99999;
select pg_current_wal_insert_lsn() as e1 \gset
update users set email = 'moved100000@example.com' where id = 100000;
select pg_current_wal_insert_lsn() as e2 \gset
with r as (
  select 'name' as upd, resource_manager, record_type
  from pg_get_wal_records_info(:'s1', :'e1')
  where block_ref ~ ('/(' || :u || '|' || :pk || '|' || :uk || ') ')
  union all
  select 'email', resource_manager, record_type
  from pg_get_wal_records_info(:'e1', :'e2')
  where block_ref ~ ('/(' || :u || '|' || :pk || '|' || :uk || ') ')
)
select count(*) filter (where upd = 'name' and record_type = 'HOT_UPDATE'),
       count(*) filter (where upd = 'name' and resource_manager = 'Btree'),
       count(*) filter (where upd = 'email' and resource_manager = 'Heap' and record_type = 'UPDATE'),
       count(*) filter (where upd = 'email' and resource_manager = 'Btree' and record_type = 'INSERT_LEAF')
from r;
SQL
)
prove 'the name change is one HOT_UPDATE record' [ "$(cut -d'|' -f1 <<<"$w_out")" = 1 ]
prove 'the name change touches no index' [ "$(cut -d'|' -f2 <<<"$w_out")" = 0 ]
prove 'the email change is a heap UPDATE' [ "$(cut -d'|' -f3 <<<"$w_out")" = 1 ]
prove 'plus two index inserts: the unique index and users_pkey, whose column did not change' \
  [ "$(cut -d'|' -f4 <<<"$w_out")" = 2 ]

fpi=$(PGDB=w pg <<'SQL'
checkpoint;
select pg_current_wal_insert_lsn() as s \gset
update users set name = 'Again' where id = 99998;
select pg_current_wal_insert_lsn() as e \gset
select max(fpi_length) from pg_get_wal_records_info(:'s', :'e') where record_type = 'HOT_UPDATE';
SQL
)
prove "right after a checkpoint, the first change to a page carries a full-page image (got $fpi bytes)" between "$fpi" 1000 8192

b0=$(my_binlog_pos); my -e "update users set name = 'Renamed' where id = 99999"
b1=$(my_binlog_pos); my -e "update users set email = 'moved100000@example.com' where id = 100000"
b2=$(my_binlog_pos)
echo "   MySQL binlog growth: name update $((b1 - b0)) bytes, email update $((b2 - b1)) bytes"
prove 'the MySQL binlog grows by roughly 410 bytes for the name update' between $((b1 - b0)) 370 450
prove 'and roughly 410 bytes for the email update' between $((b2 - b1)) 370 450

echo
echo "== Long transactions hurt both"
my_hll() { my -e "select count from information_schema.innodb_metrics where name = 'trx_rseg_history_len'"; }
my <<'SQL'
delimiter //
create procedure churn(n int)
begin
  declare i int default 0;
  while i < n do
    update users set name = concat('User ', 20000 + i % 100, ' v', i) where id = 20000 + i % 100;
    set i = i + 1;
  end while;
end//
delimiter ;
SQL
# 5,000 single-row commits take minutes on some Docker disks with the default
# fsync-per-commit settings. Relax them for this step only (the history list
# counts transactions, not fsyncs), and restore the defaults right after.
my -e "set global innodb_flush_log_at_trx_commit = 2, global sync_binlog = 0"
hll_base=$(my_hll)
my -e "start transaction with consistent snapshot;
       select count(*) into @x from users where id = 1;
       do sleep(120); rollback;" >/dev/null 2>&1 &
snap_pid=$!
my_wait_for "select id from information_schema.processlist where info like 'do sleep(120)%'"
my -e "call churn(5000)"
hll_open=$(my_hll)
my -e "kill query $(my -e "select id from information_schema.processlist where info like 'do sleep(120)%'")"
wait "$snap_pid" || true
my -e "set global innodb_flush_log_at_trx_commit = 1, global sync_binlog = 1"
hll_after=$hll_open
for i in $(seq 1 120); do
  sleep 1
  hll_after=$(my_hll)
  [ "$hll_after" -lt 100 ] && break
done
echo "   InnoDB history list length: baseline $hll_base, snapshot open $hll_open, after ${i}s $hll_after"
prove 'with a snapshot open, 5,000 updates leave about 5,000 undo logs waiting for purge' between "$hll_open" 4900 5100
prove 'once the snapshot ends, purge starts clearing them: under half are left within two minutes' [ "$hll_after" -lt $((hll_open / 2)) ]

clone v
v_out=$(compose exec -T postgres psql -X -q -d v 2>&1 <<'SQL' | tr -d '\r'
create extension dblink;
select dblink_connect('old', 'dbname=v user=postgres') \g /dev/null
select dblink_exec('old', 'begin isolation level repeatable read') \g /dev/null
select * from dblink('old', 'select count(*) from users where id = 1') t(n bigint) \g /dev/null
update users set name = name || ' v2' where id between 20000 and 24999;
vacuum (verbose) users;
select dblink_exec('old', 'rollback') \g /dev/null
SQL
)
prove 'Postgres vacuum reports the 5,000 old versions as "dead but not yet removable"' \
  has "$v_out" "5000 are dead but not yet removable"
v_out2=$(compose exec -T postgres psql -X -q -d v -c "vacuum (verbose) users" 2>&1 | tr -d '\r')
prove 'after the old transaction ends, vacuum removes them' has "$v_out2" "tuples: 5000 removed"

echo
echo "== Wraparound is a Postgres-only risk"
prove 'Postgres transaction IDs are 32 bits (xid is 4 bytes)' \
  [ "$(pg -c "select typlen from pg_type where typname = 'xid'")" = 4 ]

echo
echo "== Default isolation is different"
prove 'MySQL 8.4 defaults to REPEATABLE-READ' [ "$(my -e 'select @@transaction_isolation')" = REPEATABLE-READ ]
prove 'Postgres defaults to read committed' [ "$(pg -c 'show transaction_isolation')" = "read committed" ]

clone lk
lk_out=$(PGDB=lk pg <<'SQL'
create extension dblink;
select dblink_connect('b', 'dbname=lk user=postgres') \g /dev/null
begin;
select name from users where id = 10;
select dblink_exec('b', $$update users set name = 'Changed' where id = 10$$) \g /dev/null
select name from users where id = 10;
commit;
SQL
)
prove 'Postgres read committed: the second read sees the rename' [ "$(tr '\n' '|' <<<"$lk_out")" = "User 10|Changed|" ]

my -e "start transaction;
       select name from users where id = 10;
       do sleep(3);
       select name from users where id = 10;
       commit;" > "$tmp" 2>&1 &
a_pid=$!
my_wait_for "select id from information_schema.processlist where info like 'do sleep(3)%'"
my -e "update users set name = 'Changed' where id = 10"
wait "$a_pid"
prove 'MySQL repeatable read: both reads see the old name' \
  [ "$(tr -d '\r' < "$tmp" | tr '\n' '|')" = "User 10|User 10|" ]

rr_out=$(compose exec -T postgres psql -X -q -d lk 2>&1 <<'SQL' | tr -d '\r' || true
select dblink_connect('b', 'dbname=lk user=postgres') \g /dev/null
begin isolation level repeatable read;
select name from users where id = 11 \g /dev/null
select dblink_exec('b', $$update users set name = 'B' where id = 11$$) \g /dev/null
update users set name = 'A' where id = 11;
rollback;
SQL
)
prove 'Postgres repeatable read: the second writer fails with a serialization error' \
  has "$rr_out" "could not serialize access due to concurrent update"

my -e "start transaction;
       select name into @n from users where id = 11;
       do sleep(3);
       update users set name = concat(@n, ' +A') where id = 11;
       commit;" > "$tmp" 2>&1 &
a_pid=$!
my_wait_for "select id from information_schema.processlist where info like 'do sleep(3)%'"
my -e "update users set name = 'B' where id = 11"
a_ok=0; wait "$a_pid" || a_ok=$?
prove 'MySQL repeatable read: the second writer proceeds, no error' [ "$a_ok" = 0 ]
prove "and B's committed update is lost (the row ends up 'User 11 +A')" \
  [ "$(my -e 'select name from users where id = 11')" = "User 11 +A" ]

echo
echo "== No gap locks"
my -e "start transaction;
       select id from users where account_id = 7 and email = 'zzz@example.com' for update;
       do sleep(10); rollback;" >/dev/null 2>&1 &
a_pid=$!
my_wait_for "select 1 from performance_schema.data_locks where lock_mode = 'X,GAP'"
gap=$(my -e "select index_name, lock_mode, lock_data from performance_schema.data_locks where lock_type = 'RECORD'")
prove "session A holds a gap lock before the next real entry, (8, 'user10007@example.com', 10007)" \
  [ "$gap" = "$(printf "users_account_id_email_key\tX,GAP\t8, 'user10007@example.com', 10007")" ]
gap_err=$(my_err "set innodb_lock_wait_timeout = 2;
                  insert into users (account_id, email, name) values (7, 'yyy@example.com', 'Gap');")
prove 'MySQL session B waits for a different, nonexistent row and times out (1205)' \
  has "$gap_err" "ERROR 1205 (HY000)"
my -e "kill query $(my -e "select id from information_schema.processlist where info like 'do sleep(10)%'")"
wait "$a_pid" || true
gap_pg=$(PGDB=lk pg <<'SQL'
select dblink_connect('a', 'dbname=lk user=postgres') \g /dev/null
select dblink_exec('a', 'begin') \g /dev/null
select count(*) from dblink('a', $$select id from users where account_id = 7
                                    and email = 'zzz@example.com' for update$$) t(id bigint) \g /dev/null
set lock_timeout = '2s';
insert into users (account_id, email, name) values (7, 'yyy@example.com', 'Gap');
select dblink_exec('a', 'rollback') \g /dev/null
select count(*) from users where email = 'yyy@example.com';
SQL
)
prove 'on Postgres the same insert succeeds at once: no gap locks' [ "$gap_pg" = 1 ]

echo
echo "== A process per connection"
prove 'Postgres max_connections defaults to 100' [ "$(pg -c 'show max_connections')" = 100 ]
prove 'MySQL max_connections defaults to 151' [ "$(my -e 'select @@max_connections')" = 151 ]
cpus=$(compose exec -T mysql nproc | tr -d '\r')
prove "innodb_purge_threads defaults to 1 on 16 or fewer logical CPUs, else 4 (this box: $cpus)" \
  [ "$(my -e 'select @@innodb_purge_threads')" = "$([ "$cpus" -le 16 ] && echo 1 || echo 4)" ]

echo
echo "== One log, not two"
prove 'MySQL 8.4 defaults: binary log on, sync_binlog 1, flush at commit 1, ROW, FULL, doublewrite on' \
  [ "$(my -e 'select concat_ws(",", @@log_bin, @@sync_binlog, @@innodb_flush_log_at_trx_commit,
                               @@binlog_format, @@binlog_row_image, @@innodb_doublewrite)')" = "1,1,1,ROW,FULL,ON" ]

echo
echo "== DDL is transactional"
ddl=$(pg <<'SQL'
begin;
insert into accounts (name) values ('Before DDL');
create table scratch (id int);
alter table users add column last_seen_at timestamptz;
rollback;
select count(*) from accounts where name = 'Before DDL';
select coalesce(to_regclass('scratch')::text, 'null');
select count(*) from information_schema.columns where table_name = 'users' and column_name = 'last_seen_at';
SQL
)
prove 'Postgres rolls back the insert, the new table, and the new column' [ "$(tr '\n' '|' <<<"$ddl")" = "0|null|0|" ]
prove 'create index concurrently refuses to run inside a transaction block' \
  has "$(pg_err "begin; create index concurrently on accounts (name); commit;")" "cannot run inside a transaction block"
my -e "start transaction;
       insert into accounts (name) values ('Before DDL');
       create table scratch (id int);
       rollback;"
prove "MySQL's create table committed the insert; rollback rolled back nothing (id 1024)" \
  [ "$(my -e "select id from accounts where name = 'Before DDL'")" = 1024 ]
prove 'and the table exists' [ "$(my -e "select count(*) from information_schema.tables where table_schema = 'book' and table_name = 'scratch'")" = 1 ]

echo
echo "== Strings compare exactly"
prove "MySQL 8.4's default collation is utf8mb4_0900_ai_ci" [ "$(my -e 'select @@collation_server')" = utf8mb4_0900_ai_ci ]
prove "MySQL: 'abc' = 'ABC', 'Bob@x.com' = 'bob@x.com', 'resume' = 'résumé' are all true" \
  [ "$(my -e "select concat_ws(',', 'abc' = 'ABC', 'Bob@x.com' = 'bob@x.com', 'resume' = 'résumé')")" = "1,1,1" ]
prove 'Postgres: all three are false' \
  [ "$(pg -c "select concat_ws(',', 'abc' = 'ABC', 'Bob@x.com' = 'bob@x.com', 'resume' = 'résumé')")" = "f,f,f" ]
prove "MySQL's unique index rejects a case variant of an existing email" \
  has "$(my_err "insert into users (account_id, email, name) values (1, 'USER1000@Example.com', 'Shouty')")" \
      "Duplicate entry '1-USER1000@Example.com' for key 'users.users_account_id_email_key'"
prove 'Postgres accepts it, and the opening transaction burned 100,001 and 100,002 (it gets 100,003)' \
  [ "$(pg -c "insert into users (account_id, email, name) values (1, 'USER1000@Example.com', 'Shouty') returning id")" = 100003 ]
prove 'now account 1 has two users with the "same" email' \
  [ "$(pg -c "select count(*) from users where account_id = 1 and lower(email) = 'user1000@example.com'")" = 2 ]

echo
echo "== Identifiers fold to lower case"
prove 'MySQL treats double quotes as string quotes' \
  [ "$(my -e 'select "hello" as double_quoted, `name` from accounts order by id limit 1')" = "$(printf 'hello\tAccount 1')" ]
prove 'Postgres reads "hello" as a column name' has "$(pg_err 'select "hello"')" 'column "hello" does not exist'
pg -c 'create table "Users" (id int)'
prove 'unquoted Users folds to users, the real table (100,001 rows by now)' [ "$(pg -c 'select count(*) from Users')" = 100001 ]
prove 'quoted "Users" is the new, empty one' [ "$(pg -c 'select count(*) from "Users"')" = 0 ]
prove 'MySQL lower_case_table_names is 0 on Linux' [ "$(my -e 'select @@lower_case_table_names')" = 0 ]

echo
echo "== Identity, not auto_increment"
prove 'MySQL: the bulk load left the counter at 131,071, the duplicate burned 131,072' \
  [ "$(my -e "select group_concat(id order by id) from users where email like 'new%'")" = "131071,131073" ]
prove 'MySQL interleaved auto-increment locking (mode 2) is the default' [ "$(my -e 'select @@innodb_autoinc_lock_mode')" = 2 ]

echo
echo "== Upserts name their conflict"
my_up() { my -e "insert into users (account_id, email, name) values (1, '$1', '$2') as new
                 on duplicate key update name = new.name; select row_count();"; }
prove 'MySQL upsert affected rows: 2 when it updates' [ "$(my_up user1000@example.com Renamed)" = 2 ]
prove 'MySQL upsert affected rows: 0 when the values are unchanged' [ "$(my_up user1000@example.com Renamed)" = 0 ]
prove 'MySQL upsert affected rows: 1 when it inserts' [ "$(my_up upsert-new@example.com 'Upsert New')" = 1 ]
prove 'MySQL warns that VALUES() in ON DUPLICATE KEY UPDATE is deprecated (1287)' \
  has "$(my -e "insert into users (account_id, email, name) values (1, 'user1000@example.com', 'Renamed')
                on duplicate key update name = values(name); show warnings;")" "1287"
prove 'Postgres on conflict updates user 1000 and xmax shows it was an update' \
  [ "$(pg -c "insert into users (account_id, email, name)
              values (1, 'user1000@example.com', 'Renamed')
              on conflict (account_id, email)
              do update set name = excluded.name
              returning id, name, (xmax <> 0) as updated")" = "1000|Renamed|t" ]
prove 'leave out the conflict target and Postgres refuses' \
  has "$(pg_err "insert into users (account_id, email, name) values (1, 'user1000@example.com', 'X')
                 on conflict do update set name = excluded.name")" \
      "ON CONFLICT DO UPDATE requires inference specification or constraint name"
merge=$(pg <<'SQL'
merge into users u
using (values (1::bigint, 'user1000@example.com', 'Merged'),
              (1, 'merge-new@example.com', 'Merge New')) as s(account_id, email, name)
on u.account_id = s.account_id and u.email = s.email
when matched then update set name = s.name
when not matched then insert (account_id, email, name) values (s.account_id, s.email, s.name)
returning merge_action(), u.id, u.email, u.name;
SQL
)
echo "$merge" | sed 's/^/   /'
prove 'Postgres MERGE ... RETURNING merge_action() reports one UPDATE and one INSERT' \
  [ "$(cut -d'|' -f1 <<<"$merge" | sort | tr '\n' ',')" = "INSERT,UPDATE," ]
my -e "create table ig (v varchar(3))"
prove "MySQL's INSERT IGNORE also swallows a data conversion error (the value is truncated)" \
  [ "$(my -e "insert ignore into ig values ('abcdef'); select v from ig")" = abc ]
prove "Postgres on conflict do nothing doesn't: a too-long value is still an error" \
  has "$(pg_err "create table ig (v varchar(3) unique); insert into ig values ('abcdef') on conflict do nothing")" \
      "value too long for type character varying(3)"
prove 'MySQL has no MERGE statement' has "$(my_err "merge into users using accounts on 1 = 0 when matched then delete")" "ERROR 1064"

echo
echo "== jsonb, not JSON"
prove 'Postgres json keeps the text as given' \
  [ "$(pg -c "select '{\"b\": 1, \"a\": 2, \"a\": 3}'::json")" = '{"b": 1, "a": 2, "a": 3}' ]
prove 'Postgres jsonb sorts keys and keeps the last duplicate' \
  [ "$(pg -c "select '{\"b\": 1, \"a\": 2, \"a\": 3}'::jsonb")" = '{"a": 3, "b": 1}' ]
prove "MySQL's JSON returns the same as jsonb" \
  [ "$(my -e "select cast('{\"b\": 1, \"a\": 2, \"a\": 3}' as json)")" = '{"a": 3, "b": 1}' ]

echo
echo "== Division, ||, and NULL ordering"
prove 'MySQL: 7/2 is 3.5000 and 3/5 is 0.6000' [ "$(my -e 'select concat_ws(",", 7/2, 3/5)')" = "3.5000,0.6000" ]
prove 'Postgres: 7/2 is 3 and 3/5 is 0' [ "$(pg -c "select concat_ws(',', 7/2, 3/5)")" = "3,0" ]
prove "MySQL's integer division operator is DIV" [ "$(my -e 'select 7 div 2')" = 3 ]
prove 'Postgres: 3::numeric / 5 is 0.6 and 7 / 2.0 is 3.5' \
  [ "$(pg -c 'select round(3::numeric / 5, 1) = 0.6 and 7 / 2.0 = 3.5')" = t ]
div0=$(my -e "select 1/0; show warnings;")
prove 'MySQL: 1/0 is NULL with a warning' [ "$(tr '\n' '|' <<<"$div0")" = "NULL|$(printf 'Warning\t1365\tDivision by 0')|" ]
prove 'Postgres: 1/0 raises division by zero' has "$(pg_err 'select 1/0')" "division by zero"
pipes=$(my -e "select 'a' || 'b' as pipes; show warnings;")
prove "MySQL: 'a' || 'b' is 0 (logical OR)" [ "$(head -1 <<<"$pipes")" = 0 ]
prove 'with a deprecation warning and two "Truncated incorrect DOUBLE value" warnings' \
  [ "$(grep -c '1287' <<<"$pipes")" = 1 -a "$(grep -c 'Truncated incorrect DOUBLE value' <<<"$pipes")" = 2 ]
prove "Postgres: 'a' || 'b' is ab" [ "$(pg -c "select 'a' || 'b'")" = ab ]
prove "Postgres: 'a' || null is NULL, concat('a', null) is a" \
  [ "$(pg -c "select ('a' || null) is null and concat('a', null) = 'a'")" = t ]
prove 'MySQL sorts NULL first ascending' \
  [ "$(my -e 'select x from (select 1 as x union all select null union all select 3) t order by x' | tr '\n' ',')" = "NULL,1,3," ]
prove 'Postgres sorts NULL last ascending' \
  [ "$(pg -c "select string_agg(coalesce(x::text, 'NULL'), ',' order by x) from (values (1), (null), (3)) t(x)")" = "1,3,NULL" ]
prove 'and first descending' \
  [ "$(pg -c "select string_agg(coalesce(x::text, 'NULL'), ',' order by x desc) from (values (1), (null), (3)) t(x)")" = "NULL,3,1" ]

echo
echo "== Foreign keys don't index themselves"
prove 'MySQL created an index for each foreign key on projects' \
  [ "$(my -e "select group_concat(distinct index_name order by index_name) from information_schema.statistics
              where table_schema = 'book' and table_name = 'projects'")" = "account_id,owner_id,PRIMARY" ]
prove 'Postgres created only projects_pkey' \
  [ "$(pg -c "select string_agg(indexrelid::regclass::text, ',') from pg_index where indrelid = 'projects'::regclass")" = projects_pkey ]

echo
echo "== Smaller things"
prove 'MySQL 8.4 default sql_mode includes ONLY_FULL_GROUP_BY and STRICT_TRANS_TABLES' \
  [ "$(my -e "select find_in_set('ONLY_FULL_GROUP_BY', @@sql_mode) > 0 and find_in_set('STRICT_TRANS_TABLES', @@sql_mode) > 0")" = 1 ]
prove 'MySQL rejects a non-aggregated, ungrouped column (1055)' \
  has "$(my_err "select account_id, name from users group by account_id")" "ERROR 1055"
prove 'Postgres rejects it too' \
  has "$(pg_err "select account_id, name from users group by account_id")" 'must appear in the GROUP BY clause'
prove 'any_value() exists on both' \
  [ "$(pg -c 'select any_value(x) from (values (1)) t(x)')" = 1 -a "$(my -e 'select any_value(1)')" = 1 ]
prove 'MySQL allows ORDER BY ... LIMIT on a single-table UPDATE' \
  [ -z "$(my_err "update users set name = name where account_id = 9 order by id limit 2")" ]
prove 'Postgres does not' has "$(pg_err "update users set name = name where account_id = 9 limit 2")" 'syntax error'
prove 'MySQL 8.4 has no query cache (the variable is gone)' \
  has "$(my_err 'select @@query_cache_size')" "Unknown system variable 'query_cache_size'"

echo
echo "== every claim proved"
