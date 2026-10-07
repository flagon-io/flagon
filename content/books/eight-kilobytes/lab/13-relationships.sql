-- Lab for "Constraints, chosen on purpose"
-- https://www.flagon.io/books/eight-kilobytes/relationships
-- Run: ./lab 13-relationships
--
-- The unindexed-foreign-key delete is proved without auto_explain, from two
-- things any session can see: the "Trigger for constraint" time in EXPLAIN
-- ANALYZE, and this transaction's own scan counters on events in
-- pg_stat_xact_user_tables.

\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

-- Milliseconds spent in the events_project_id_fkey trigger for a statement.
create function fk_ms(q text) returns numeric language sql as $$
  select coalesce(sum((t ->> 'Time')::numeric), 0)
  from lab.plan(q) p, jsonb_array_elements(p -> 'Triggers') t
  where t ->> 'Constraint Name' = 'events_project_id_fkey'
$$;

-- This transaction's sequential scans, rows read that way, and index scans on events.
create function events_scans(out seq bigint, out tup bigint, out idx bigint) language sql as $$
  select seq_scan, seq_tup_read, coalesce(idx_scan, 0)
  from pg_stat_xact_user_tables where relid = 'events'::regclass
$$;

\echo
\echo '## How foreign keys are enforced'
select lab.prove('events is about 35,173 pages (275 MB)',
  pg_relation_size('events') / 8192 between 35000 and 35400);
select lab.prove('no index on events covers project_id',
  not exists (select 1 from pg_index where indrelid = 'events'::regclass
              and indkey[0] = (select attnum from pg_attribute
                               where attrelid = 'events'::regclass and attname = 'project_id')));

\echo
\echo '### The delete that scans'
insert into projects (account_id, owner_id, name) values (1, 1, 'scratch');
insert into projects (account_id, owner_id, name)
select 1, 1, 'scratch ' || g from generate_series(1, 50) g;

select id as scratch_id from projects where name = 'scratch' \gset
begin;
select lab.prove('the delete plan never mentions events: it is one index scan on projects',
  lab.nodes(format('delete from projects where id = %s', :scratch_id)) = array['ModifyTable', 'Index Scan']
  or lab.nodes(format('delete from projects where id = %s', :scratch_id)) = array['Delete', 'Index Scan']);
rollback;

begin;
select seq as s0, tup as t0 from events_scans() \gset
select fk_ms(format('delete from projects where id = %s', :scratch_id)) as one_ms \gset
select lab.prove('deleting one project sequentially scans events once, reading all 2,000,000 rows',
  (select seq - :s0 = 1 and tup - :t0 = 2000000 from events_scans()));
rollback;

begin;
select seq as s0, tup as t0 from events_scans() \gset
select fk_ms($$ delete from projects where name like 'scratch %' $$) as fifty_ms \gset
select lab.prove('deleting 50 projects scans events 50 times: 100,000,000 rows read',
  (select seq - :s0 = 50 and tup - :t0 = 100000000 from events_scans()));
rollback;
select lab.prove('the 50-project delete spends far longer in the trigger than the single one',
  :fifty_ms > 10 * :one_ms);

\echo
\echo '### The fix'
create index events_project_id_idx on events (project_id);
select lab.prove('the index on events (project_id) is about 14 MB',
  pg_relation_size('events_project_id_idx') between 12 * 1024 * 1024 and 16 * 1024 * 1024);

begin;
select seq as s0, tup as t0, idx as i0 from events_scans() \gset
select fk_ms($$ delete from projects where name like 'scratch %' $$) as fifty_idx_ms \gset
select lab.prove('with the index, the 50 checks scan events by index: no sequential scans',
  (select seq - :s0 = 0 and idx - :i0 >= 50 from events_scans()));
rollback;
select lab.prove('and the trigger time for 50 deletes drops by more than 100 times',
  :fifty_ms > 100 * greatest(:fifty_idx_ms, 0.001));

begin;
select lab.prove('a single check with the index reads a handful of pages, not 35,173',
  lab.buffers($$ select 1 from only events x where 20001 = project_id for key share of x $$) < 10);
rollback;

\echo
\echo '### Finding unindexed foreign keys'
drop index events_project_id_idx;
create temp view unindexed_fks as
select c.conrelid::regclass as table_name,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype = 'f'
  and not exists (
    select 1
    from pg_index i
    where i.indrelid = c.conrelid
      and i.indpred is null
      and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
  );
select lab.prove('the query lists five unindexed foreign keys on projects and events',
  (select count(*) from unindexed_fks) = 5
  and (select count(*) from unindexed_fks where table_name::text in ('projects', 'events')) = 5);
select lab.prove('users.account_id is not listed: unique (account_id, email) leads with it',
  not exists (select 1 from unindexed_fks where table_name = 'users'::regclass));

\echo
\echo '## On delete and on update'
alter table users add constraint users_account_id_id_key unique (account_id, id);
create table comments (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id),
  author_id   bigint,
  body        text not null,
  foreign key (account_id, author_id)
    references users (account_id, id)
    on delete set null (author_id)
);
create table comments_all (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id),
  author_id   bigint,
  body        text not null,
  foreign key (account_id, author_id)
    references users (account_id, id)
    on delete set null
);
insert into users (account_id, email, name) values (5, 'gone@example.com', 'Gone');
insert into comments (account_id, author_id, body)
select 5, id, 'hi' from users where email = 'gone@example.com';
insert into comments_all (account_id, author_id, body)
select 5, id, 'hi' from users where email = 'gone@example.com';
select lab.prove('without the column list, set null tries to null account_id too, which not null forbids',
  lab.try($$ delete from users where email = 'gone@example.com' $$)
    like '23502: null value in column "account_id" of relation "comments_all"%');
delete from comments_all;
delete from users where email = 'gone@example.com';
select lab.prove('set null (author_id) clears the author and keeps the account',
  (select account_id = 5 and author_id is null from comments));

\echo
\echo '## Replace polymorphic associations'
create table arc_comments (
  id          bigint generated always as identity primary key,
  project_id  bigint references projects (id),
  event_id    bigint references events (id),
  body        text not null,
  check (num_nonnulls(project_id, event_id) = 1)
);
select lab.prove('the exclusive arc rejects a comment with two parents',
  lab.try($$ insert into arc_comments (project_id, event_id, body) values (1, 1, 'both') $$)
    like '23514: new row for relation "arc_comments" violates check constraint "arc_comments_check"');
select lab.prove('and accepts one with exactly one parent',
  lab.try($$ insert into arc_comments (project_id, body) values (1, 'one') $$) = 'ok');

\echo
\echo '## Not null by default'
begin;
alter table events add constraint events_user_id_nn not null user_id not valid;
select lab.prove('PostgreSQL 18 adds a named not-null constraint marked not valid',
  (select not convalidated from pg_constraint
   where conrelid = 'events'::regclass and conname = 'events_user_id_nn' and contype = 'n'));
select lab.prove('new rows are checked at once',
  lab.try($$ insert into events (account_id, project_id, user_id, kind)
             values (1, 1, null, 'deploy') $$) like '23502:%');
rollback;

\echo
\echo '## Check constraints'
create table amounts (amount_cents bigint check (amount_cents >= 0));
select lab.prove('a check passes when the expression is null',
  lab.try($$ insert into amounts values (null) $$) = 'ok'
  and lab.try($$ insert into amounts values (-1) $$) like '23514:%');

\echo
\echo '## Unique constraints'
create table api_keys (account_id bigint not null, label text, unique (account_id, label));
insert into api_keys values (1, null), (1, null);
select lab.prove('nulls are distinct by default: two (1, null) rows coexist',
  (select count(*) from api_keys) = 2);
create table api_keys2 (
  account_id bigint not null,
  label      text,
  unique nulls not distinct (account_id, label)
);
select lab.prove('nulls not distinct rejects the second (1, null)',
  lab.try($$ insert into api_keys2 values (1, null), (1, null) $$)
    like '23505: duplicate key value violates unique constraint "api_keys2_account_id_label_key"');

\echo
\echo '## Exclusion constraints'
create extension if not exists btree_gist;
create table deploy_locks (
  project_id  bigint    not null references projects (id),
  held_during tstzrange not null,
  exclude using gist (project_id with =, held_during with &&)
);
insert into deploy_locks values (42, tstzrange('2026-10-01 10:00+00', '2026-10-01 11:00+00'));
select lab.prove('an adjacent range is accepted (ranges are half-open)',
  lab.try($$ insert into deploy_locks values (42, tstzrange('2026-10-01 11:00+00', '2026-10-01 12:00+00')) $$) = 'ok');
select lab.prove('an overlapping range for the same project is rejected',
  lab.try($$ insert into deploy_locks values (42, tstzrange('2026-10-01 10:30+00', '2026-10-01 10:45+00')) $$)
    like '23P01: conflicting key value violates exclusion constraint "deploy_locks_project_id_held_during_excl"');
select lab.prove('the same range for another project is fine',
  lab.try($$ insert into deploy_locks values (43, tstzrange('2026-10-01 10:30+00', '2026-10-01 10:45+00')) $$) = 'ok');

create table project_plans (
  project_id   bigint    not null references projects (id),
  plan         text      not null,
  valid_during tstzrange not null,
  primary key (project_id, valid_during without overlaps)
);
insert into project_plans values (42, 'free', tstzrange('2026-01-01+00', '2026-06-01+00'));
select lab.prove('without overlaps rejects a second plan in effect at the same time',
  lab.try($$ insert into project_plans values (42, 'team', tstzrange('2026-05-01+00', null)) $$)
    like '23P01: conflicting key value violates exclusion constraint "project_plans_pkey"');

\echo
\echo '## Deferrable constraints'
create table steps2 (id bigint primary key, position int not null unique);
insert into steps2 values (1, 1), (2, 2);
select lab.prove('a non-deferrable unique constraint fails the one-statement swap',
  lab.try($$ update steps2 set position = case position when 1 then 2 else 1 end $$)
    like '23505: duplicate key value violates unique constraint "steps2_position_key"');
create table steps (
  id          bigint primary key,
  pipeline_id bigint not null,
  position    int    not null,
  unique (pipeline_id, position) deferrable initially immediate
);
insert into steps values (1, 1, 1), (2, 1, 2);
select lab.prove('deferrable initially immediate checks at end of statement, so the swap works',
  lab.try($$ update steps set position = case position when 1 then 2 else 1 end $$) = 'ok');
begin;
set constraints all deferred;
update steps set position = 2 where id = 1;
update steps set position = 1 where id = 2;
commit;
select lab.prove('deferred to commit, a two-statement swap works',
  (select array_agg(position order by id) from steps) = array[2, 1]);
select lab.prove('a deferrable unique constraint cannot be referenced by a foreign key',
  lab.try($$ create table steps_ref (pipeline_id bigint, position int,
             foreign key (pipeline_id, position) references steps (pipeline_id, position)) $$)
    = '55000: cannot use a deferrable unique constraint for referenced table "steps"');
select lab.prove('or used as an on conflict arbiter',
  lab.try($$ insert into steps values (3, 2, 1) on conflict (pipeline_id, position) do nothing $$)
    like '%ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters');

\echo
\echo '## Null and three-valued logic'
select lab.prove('null = null and null <> 1 are null; is distinct from is never null',
  (null = null) is null and (null <> 1) is null
  and (null is distinct from null) = false and (1 is distinct from null) = true);
select lab.prove('3 not in (1, 2, null) is null, not false',
  (3 not in (1, 2, null)) is null);
select lab.prove('all events for project 42 come from one user',
  (select count(distinct user_id) from events where project_id = 42) = 1);
begin;
update events set user_id = null
where id = (select min(id) from events where project_id = 42);
select lab.prove('one null user_id makes not in return 0 users',
  (select count(*) from users u
   where u.id not in (select e.user_id from events e where e.project_id = 42)) = 0);
select lab.prove('not exists still returns 99,999',
  (select count(*) from users u
   where not exists (select 1 from events e
                     where e.project_id = 42 and e.user_id = u.id)) = 99999);
rollback;

\echo
\echo '## Soft deletes and partial unique indexes'
alter table projects add column deleted_at timestamptz;
create unique index projects_name_live_uq
  on projects (account_id, lower(name))
  where deleted_at is null;
update projects set deleted_at = now() where id = 1;
select lab.prove('after soft-deleting Project 1, a new live Project 1 is accepted',
  lab.try($$ insert into projects (account_id, owner_id, name)
             select account_id, owner_id, name from projects where id = 1 $$) = 'ok');
select lab.prove('a second live duplicate is rejected: (9, project 1) already exists',
  lab.try($$ insert into projects (account_id, owner_id, name)
             select account_id, owner_id, name from projects where id = 1 $$)
    = '23505: duplicate key value violates unique constraint "projects_name_live_uq"');
select lab.prove('the key in question is account 9, project 1',
  (select (account_id, lower(name)) = (9::bigint, 'project 1') from projects where id = 1));

-- The checks below were added with the normalization and history sections.
-- They run last so the extra foreign key and trigger they add to events and
-- projects can't change the foreign-key scan counts measured above.

\echo
\echo '## Store each fact once'
create table projects_flat as
select p.id, p.name, p.account_id, a.name as account_name, a.plan as account_plan
from projects p join accounts a on a.id = p.account_id;
select lab.prove('the seed has 20,000 projects over 1,000 accounts: 20 per account on average',
  (select count(*) from projects where id <= 20000) = 20000
  and (select count(*) from accounts) = 1000);
select account_id as acct from projects_flat
where account_plan <> 'team'
group by account_id having count(*) >= 2
order by account_id limit 1 \gset
update projects_flat set account_plan = 'team'
where id = (select min(id) from projects_flat where account_id = :acct);
select lab.prove('updating one project row leaves its account on two plans at once',
  (select count(distinct account_plan) from projects_flat where account_id = :acct) = 2);

\echo
\echo '### The normal forms, by the bug each prevents'
create table clusters (
  id      bigint primary key,
  region  text   not null,
  unique (id, region)
);
create table project_clusters (
  project_id  bigint not null references projects (id),
  cluster_id  bigint not null,
  region      text   not null,
  primary key (project_id, region),
  foreign key (cluster_id, region) references clusters (id, region)
);
insert into clusters values (7, 'iad');
select lab.prove('a project can use cluster 7 in the region it lives in',
  lab.try($$ insert into project_clusters values (42, 7, 'iad') $$) = 'ok');
select lab.prove('and cannot claim cluster 7 is in another region',
  lab.try($$ insert into project_clusters values (43, 7, 'fra') $$) like '23503:%');

\echo
\echo '### A copy needs exactly one writer'
select lab.prove('in the seed, every event carries its project''s account',
  not exists (select 1 from events e join projects p on p.id = e.project_id
              where e.account_id <> p.account_id));
begin;
select lab.prove('without a constraint, an event can be moved to another account',
  lab.try($$ update events set account_id = account_id + 1 where id = 1 $$) = 'ok');
rollback;
alter table projects add constraint projects_id_account_uq unique (id, account_id);
alter table events add constraint events_project_account_fk
  foreign key (project_id, account_id) references projects (id, account_id) not valid;
select lab.prove('with the composite foreign key, the same update is rejected',
  lab.try($$ update events set account_id = account_id + 1 where id = 1 $$) like '23503:%');

\echo
\echo '## History is a table you design'
\echo '### Application-written audit rows'
create table project_audit (
  id          bigint generated always as identity primary key,
  project_id  bigint      not null,
  actor_id    bigint,
  action      text        not null,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
select name as name_before from projects where id = 42 \gset
with changed as (
  update projects set name = 'Checkout API' where id = 42
  returning old.name as old_name, new.name as new_name
)
insert into project_audit (project_id, actor_id, action, before, after)
select 42, 7, 'rename', jsonb_build_object('name', old_name),
       jsonb_build_object('name', new_name)
from changed;
select lab.prove('returning old and new (PostgreSQL 18) captures both names in one statement',
  (select before ->> 'name' = :'name_before' and after ->> 'name' = 'Checkout API'
   from project_audit where project_id = 42 and action = 'rename'));

\echo
\echo '### A trigger-maintained history table'
select pg_relation_filenode('projects') as fn_before \gset
alter table projects add column valid_from timestamptz not null default now();
select lab.prove('adding valid_from with default now() does not rewrite projects',
  pg_relation_filenode('projects') = :fn_before);
create table projects_history (
  project_id    bigint      not null,
  account_id    bigint      not null,
  owner_id      bigint      not null,
  name          text        not null,
  archived_at   timestamptz,
  deleted_at    timestamptz,
  valid_during  tstzrange   not null,
  changed_by    bigint,
  primary key (project_id, valid_during without overlaps)
);
create function projects_keep_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old is not distinct from new then
    return new;                         -- nothing changed: keep no history
  end if;
  if old.valid_from < now() then        -- skip versions born in this transaction
    insert into projects_history
    values (old.id, old.account_id, old.owner_id, old.name, old.archived_at,
            old.deleted_at, tstzrange(old.valid_from, now()),
            nullif(current_setting('app.user_id', true), '')::bigint);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.valid_from := now();
  return new;
end $$;
create trigger projects_keep_history
  before update or delete on projects
  for each row execute function projects_keep_history();

select name as name43 from projects where id = 43 \gset
select lab.prove('a range from a moment to itself is empty',
  tstzrange(now(), now()) = 'empty'::tstzrange);
select lab.prove('a without overlaps key refuses an empty range',
  lab.try($$ insert into projects_history (project_id, account_id, owner_id, name, valid_during)
             values (1, 1, 1, 'x', 'empty') $$) <> 'ok');
update projects set name = 'Checkout' where id = 43;
update projects set name = 'Checkout v2' where id = 43;
select lab.prove('two updates in two transactions leave two history rows',
  (select count(*) from projects_history where project_id = 43) = 2);
begin;
set local app.user_id = '7';
update projects set name = 'Checkout v3' where id = 43;
update projects set name = 'Checkout v4' where id = 43;
commit;
select lab.prove('two updates in one transaction add one history row, stamped with the user',
  (select count(*) from projects_history where project_id = 43) = 3
  and (select changed_by from projects_history where project_id = 43
       order by lower(valid_during) desc limit 1) = 7);
update projects set name = name where id = 43;
select lab.prove('an update that changes nothing adds no history',
  (select count(*) from projects_history where project_id = 43) = 3);
update projects set archived_at = now() where id between 1001 and 1050;
select lab.prove('a 50-row update writes 50 history rows',
  (select count(*) from projects_history where project_id between 1001 and 1050) = 50);

\echo
\echo '### Temporal tables: the history is the table'
insert into project_plans values (42, 'team', tstzrange('2026-06-01+00', null));
begin;
update project_plans
   set valid_during = tstzrange(lower(valid_during), '2026-09-15+00')
 where project_id = 42 and upper_inf(valid_during);
insert into project_plans values (42, 'enterprise', tstzrange('2026-09-15+00', null));
commit;
select lab.prove('project 42 now has three plan rows: free, team, enterprise',
  (select array_agg(plan order by lower(valid_during)) from project_plans where project_id = 42)
  = '{free,team,enterprise}');
create table plan_invoices (
  project_id     bigint    not null,
  billed_during  tstzrange not null,
  amount_cents   bigint    not null,
  foreign key (project_id, period billed_during)
    references project_plans (project_id, period valid_during)
);
select lab.prove('an invoice spanning the free and team rows is covered by both',
  lab.try($$ insert into plan_invoices
             values (42, tstzrange('2026-05-15+00', '2026-06-15+00'), 1000) $$) = 'ok');
select lab.prove('an invoice starting before any plan existed is rejected',
  lab.try($$ insert into plan_invoices
             values (42, tstzrange('2025-12-01+00', '2026-01-15+00'), 1000) $$) like '23503:%');
select lab.prove('temporal foreign keys reject on delete cascade',
  lab.try($$ create table plan_invoices2 (project_id bigint, billed_during tstzrange,
             foreign key (project_id, period billed_during)
             references project_plans (project_id, period valid_during) on delete cascade) $$)
    <> 'ok');

\echo
\echo '### Querying as of a time'
select lower(valid_during) as t1 from projects_history
where project_id = 43 order by lower(valid_during) limit 1 \gset
select lab.prove('as of July 1, project 42 was on team',
  (select plan from project_plans
   where project_id = 42 and valid_during @> timestamptz '2026-07-01+00') = 'team');
select lab.prove('as of the start of the first history row, project 43 had its original name',
  (select array_agg(name) from (
     select name from projects where id = 43 and valid_from <= :'t1'
     union all
     select name from projects_history where project_id = 43 and valid_during @> :'t1'::timestamptz) v)
  = array[:'name43']);

-- The checks below go with "Foreign keys aren't free". They run last and work
-- on copies of events, so nothing above can change what they measure.

\echo
\echo '## Foreign keys aren''t free'
\echo '### What a foreign key buys'
-- The planner's join estimate uses the composite foreign key added above
-- (events_project_account_fk, not valid); without it, the two join
-- conditions are treated as independent.
\set twocol 'select * from events e join projects p on p.id = e.project_id and p.account_id = e.account_id'
select lab.est_rows(:'twocol') as est_with_fk \gset
alter table events drop constraint events_project_account_fk;
select lab.est_rows(:'twocol') as est_without_fk \gset
alter table events add constraint events_project_account_fk
  foreign key (project_id, account_id) references projects (id, account_id) not enforced;
select lab.est_rows(:'twocol') as est_not_enforced \gset
select format('  join estimate: %s rows with the foreign key, %s without, %s with it not enforced',
              :est_with_fk, :est_without_fk, :est_not_enforced);
select lab.prove('with the composite foreign key, the planner expects about 2,000,000 joined rows',
  :est_with_fk between 1900000 and 2100000);
select lab.prove('without it, the planner multiplies two selectivities and expects about 2,000',
  :est_without_fk between 1000 and 4000);
select lab.prove('a not enforced foreign key gives the planner nothing: back to about 2,000',
  :est_not_enforced = :est_without_fk);

\echo
\echo '### The insert pays for every check'
create table ev_nofk (like events including defaults);
alter table ev_nofk add primary key (id);
create table ev_fk (like events including defaults);
alter table ev_fk add primary key (id);
alter table ev_fk
  add foreign key (account_id) references accounts (id),
  add foreign key (project_id) references projects (id),
  add foreign key (user_id)    references users (id);
select lab.prove('an unused left join is removed by the unique index alone; no foreign key needed',
  lab.est_nodes($$ select e.id from ev_nofk e left join projects p on p.id = e.project_id $$)
    = array['Seq Scan']);
select lab.prove('and an inner join is not removed, even with the foreign key',
  lab.est_nodes($$ select e.id from ev_fk e join projects p on p.id = e.project_id $$)
    && array['Hash Join', 'Merge Join', 'Nested Loop']);

-- warm the source rows and the parents so the timings compare checks, not reads
select count(*) from events where id <= 100000 \g /dev/null
select count(*) from accounts \g /dev/null
select count(*) from projects \g /dev/null
select count(*) from users \g /dev/null

-- best of three: empty the table, insert 100,000 events, time it
create function ins_ms(t text) returns numeric language plpgsql as $$
declare t0 timestamptz; took numeric; best numeric;
begin
  for i in 1..3 loop
    execute format('truncate %I', t);
    t0 := clock_timestamp();
    execute format('insert into %I select * from events where id <= 100000', t);
    took := extract(epoch from clock_timestamp() - t0) * 1000;
    if best is null or took < best then best := took; end if;
  end loop;
  return round(best, 1);
end $$;
select ins_ms('ev_nofk') as ins_nofk_ms \gset
select ins_ms('ev_fk') as ins_fk_ms \gset

-- WAL records and buffers for one insert each, from this backend's own
-- statistics (PostgreSQL 18), flushed before each reading
create function my_io(out recs bigint, out bytes numeric, out bufs bigint, out fpi bigint) language sql as $$
  select (select wal_records from pg_stat_get_backend_wal(pg_backend_pid())),
         (select wal_bytes   from pg_stat_get_backend_wal(pg_backend_pid())),
         (select sum(coalesce(hits, 0) + coalesce(reads, 0))::bigint
          from pg_stat_get_backend_io(pg_backend_pid()) where object = 'relation'),
         (select wal_fpi from pg_stat_get_backend_wal(pg_backend_pid()))
$$;
truncate ev_nofk, ev_fk;
select pg_stat_force_next_flush() \g /dev/null
select recs as r0, bytes as b0, bufs as u0, fpi as f0 from my_io() \gset
insert into ev_nofk select * from events where id <= 100000;
select pg_stat_force_next_flush() \g /dev/null
select recs as r1, bytes as b1, bufs as u1, fpi as f1 from my_io() \gset
insert into ev_fk select * from events where id <= 100000;
select pg_stat_force_next_flush() \g /dev/null
select recs as r2, bytes as b2, bufs as u2, fpi as f2 from my_io() \gset
select count(distinct account_id) + count(distinct project_id) + count(distinct user_id)
  as parents from events where id <= 100000 \gset
select format('  100,000-row insert on your machine: %s ms without foreign keys, %s ms with three; '
              'WAL %s vs %s (%s vs %s full-page images); buffers %s vs %s; %s distinct parent rows',
              :ins_nofk_ms, :ins_fk_ms,
              pg_size_pretty((:b1 - :b0)::bigint), pg_size_pretty((:b2 - :b1)::bigint),
              :f1 - :f0, :f2 - :f1,
              :u1 - :u0, :u2 - :u1, :parents);
select lab.prove('with its three foreign keys, the same 100,000-row insert takes over 4 times as long',
  :ins_fk_ms > 4 * :ins_nofk_ms);
select lab.prove('the checks read over 12 extra buffers per inserted row, all parent lookups',
  (:u2 - :u1) - (:u1 - :u0) > 12 * 100000);
select lab.prove('and add one WAL record per distinct parent row: the FOR KEY SHARE lock on it',
  (:r2 - :r1) - (:r1 - :r0) between :parents * 0.95 and :parents * 1.1);

\echo
\echo '### One hot parent makes multixacts'
create extension if not exists dblink;
truncate ev_fk;
create temp table hot_seen (n int, mx xid);
select dblink_connect('w' || g, 'dbname=' || current_database())
from generate_series(1, 10) g \g /dev/null
do $$
declare x xid;
begin
  for g in 1..10 loop
    perform dblink_exec('w' || g, 'begin');
    perform dblink_exec('w' || g, format(
      'insert into ev_fk (id, account_id, project_id, kind) values (%s, %s, 7, %L)',
      10000000 + g, (select account_id from projects where id = 7), 'deploy'));
    select xmax into x from projects where id = 7;
    insert into hot_seen values (g, x);
  end loop;
end $$;
select lab.prove('ten open inserts for one project leave ten FOR KEY SHARE members on its row',
  (select count(*) = 10 and bool_and(mode = 'keysh')
   from pg_get_multixact_members((select xmax from projects where id = 7))));
select lab.prove('getting there took nine multixacts, one per new locker, storing 54 members in all',
  (select count(distinct mx::text) from hot_seen where n >= 2) = 9
  and (select sum((select count(*) from pg_get_multixact_members(mx)))
       from hot_seen where n >= 2) = 54);
select lab.prove('renaming the project does not wait for them: FOR KEY SHARE allows non-key updates',
  lab.try($$ set local lock_timeout = '1s'; update projects set name = name || ' (hot)' where id = 7 $$) = 'ok');
select lab.prove('a delete of the project waits for every open child insert',
  lab.try($$ set local lock_timeout = '200ms'; delete from projects where id = 7 $$) like '55P03:%');
select dblink_exec('w' || g, 'rollback') from generate_series(1, 10) g \g /dev/null
select dblink_disconnect('w' || g) from generate_series(1, 10) g \g /dev/null

\echo
\echo '### Adding one locks both tables'
select dblink_connect('w1', 'dbname=' || current_database()) \g /dev/null
begin;
alter table ev_nofk add constraint ev_nofk_project_fk
  foreign key (project_id) references projects (id) not valid;
select lab.prove('adding a foreign key, even not valid, takes ShareRowExclusive on the child and the parent',
  (select array_agg(c.relname::text order by c.relname) from pg_locks l
   join pg_class c on c.oid = l.relation
   where l.pid = pg_backend_pid() and l.mode = 'ShareRowExclusiveLock')
  = array['ev_nofk', 'projects']);
select lab.prove('so a new project waits until the migration commits',
  lab.try($$ select dblink_exec('w1', 'set lock_timeout = ''200ms''; '
             'insert into projects (account_id, owner_id, name) values (1, 1, ''new'')') $$)
    like '%lock timeout%');
rollback;
select dblink_disconnect('w1') \g /dev/null

\echo
\echo '### Where foreign keys cannot go'
create extension if not exists postgres_fdw;
create server elsewhere foreign data wrapper postgres_fdw options (dbname 'book');
create foreign table remote_projects (id bigint not null) server elsewhere
  options (table_name 'projects');
select lab.prove('a foreign key cannot reference a table in another database',
  lab.try($$ create table t_remote (project_id bigint references remote_projects (id)) $$)
    = '42809: referenced relation "remote_projects" is not a table');
create view project_ids as select id from projects;
select lab.prove('or a view',
  lab.try($$ create table t_view (project_id bigint references project_ids (id)) $$)
    = '42809: referenced relation "project_ids" is not a table');

\echo
\echo '### Not enforced: documentation only'
create table ev_doc (
  id         bigint primary key,
  project_id bigint not null references projects (id) not enforced
);
select lab.prove('a not enforced foreign key (PostgreSQL 18) creates no triggers',
  (select count(*) from pg_trigger where tgrelid = 'ev_doc'::regclass) = 0
  and (select not conenforced from pg_constraint where conrelid = 'ev_doc'::regclass and contype = 'f'));
select lab.prove('and accepts an orphan',
  lab.try($$ insert into ev_doc values (1, 999999) $$) = 'ok');
create table ev_nv (id bigint primary key, project_id bigint not null);
alter table ev_nv add foreign key (project_id) references projects (id) not valid;
select lab.prove('while a not valid one still checks every new row',
  lab.try($$ insert into ev_nv values (1, 999999) $$) like '23503:%');

\echo
\echo '### Check what you no longer enforce'
-- ev_nofk holds 100,000 events from above and no foreign keys; plant two orphans
insert into ev_nofk (id, account_id, project_id, user_id, kind)
values (20000001, 1, 999999, null, 'deploy'),
       (20000002, 1, 1, 999999, 'deploy');
select lab.prove('the orphan check finds exactly the two planted orphans',
  (select count(*) from ev_nofk e
   left join accounts a on a.id = e.account_id
   left join projects p on p.id = e.project_id
   left join users    u on u.id = e.user_id
   where e.id > 0
     and (a.id is null or p.id is null or (e.user_id is not null and u.id is null))) = 2);
\set orphans 'select e.id from %s e left join accounts a on a.id = e.account_id left join projects p on p.id = e.project_id left join users u on u.id = e.user_id where e.id > %s and (a.id is null or p.id is null or (e.user_id is not null and u.id is null))'
set max_parallel_workers_per_gather = 0;
select lab.buffers(format(:'orphans', 'events', 0)) as full_pages \gset
select lab.buffers(format(:'orphans', 'events', 1990000)) as recent_pages \gset
select format('  orphan check over all of events: %s pages; over the newest 10,000 rows: %s pages',
              :full_pages, :recent_pages);
select lab.prove('checking all 2,000,000 events reads the table once: about 36,000 pages',
  :full_pages between 35000 and 38000);
select lab.prove('checking only rows past the last high-water mark reads under half of that',
  :recent_pages < :full_pages / 2);
reset max_parallel_workers_per_gather;
