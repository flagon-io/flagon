-- Helpers the labs use to turn a claim in the book into a check that passes
-- or fails. They live in their own schema, `lab`, so they never collide with
-- the example tables.
--
--   select lab.prove('the index is used', 'Index Scan' = any(lab.nodes($$ select ... $$)));
--
-- prove() prints "PROVED: <claim>" or stops the script with "NOT PROVED: <claim>".
-- plan(), buffers(), nodes(), wal_bytes(), node_sum(), node_pages() and
-- warm_buffers() run EXPLAIN (ANALYZE, BUFFERS, WAL) on a query, so they
-- execute it: wrap writes you want undone in a transaction. estimate(),
-- est_rows() and est_nodes() use plain EXPLAIN, so nothing runs.

create schema if not exists lab;

create or replace function lab.prove(claim text, ok boolean)
returns text
language plpgsql
as $$
begin
  if ok is not true then
    raise exception 'NOT PROVED: %', claim;
  end if;
  return 'PROVED: ' || claim;
end
$$;

-- Run a statement and return 'ok', or 'SQLSTATE: message' if it failed, e.g.
-- lab.try($$ select 2147483647::int + 1 $$) = '22003: integer out of range'.
-- A failed statement is rolled back; one that succeeds keeps its effects.
create or replace function lab.try(stmt text)
returns text
language plpgsql
as $$
begin
  execute stmt;
  return 'ok';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- What a query did: EXPLAIN ANALYZE, so the query runs.

-- The top node of EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON), with planning
-- and execution times alongside.
create or replace function lab.plan(query text)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute 'explain (analyze, buffers, wal, format json) ' || query into result;
  return result -> 0;
end
$$;

-- Shared buffers the whole query touched (hit + read), counted at the top
-- node, which includes everything beneath it. The book's main unit of cost.
create or replace function lab.buffers(query text)
returns bigint
language sql
as $$
  select coalesce((p -> 'Plan' ->> 'Shared Hit Blocks')::bigint, 0)
       + coalesce((p -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0)
  from lab.plan(query) as p
$$;

-- Run a query once to warm the cache, then return lab.buffers() of a second
-- run. Executes the query twice.
create or replace function lab.warm_buffers(query text)
returns bigint
language plpgsql
as $$
begin
  perform lab.plan(query);
  return lab.buffers(query);
end
$$;

-- Every node type in the plan, outermost first, e.g. {Limit,Index Scan}.
create or replace function lab.nodes(query text)
returns text[]
language sql
as $$
  with recursive walk(node) as (
    select p -> 'Plan' from lab.plan(query) as p
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.node -> 'Plans', '[]')) as child
  )
  select array_agg(node ->> 'Node Type') from walk
$$;

-- Sum one field over every node of one type, e.g. the shared buffers of the
-- Bitmap Index Scan alone, or its actual rows. Executes the query.
create or replace function lab.node_sum(query text, node_type text, field text)
returns numeric
language sql
as $$
  with recursive walk(node) as (
    select p -> 'Plan' from lab.plan(query) as p
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.node -> 'Plans', '[]')) as child
  )
  select coalesce(sum((node ->> field)::numeric), 0)
  from walk
  where node ->> 'Node Type' = node_type
$$;

-- Pages one kind of node touched (shared hit + read), from a single run.
-- Executes the query.
create or replace function lab.node_pages(query text, node_type text)
returns numeric
language sql
as $$
  with recursive walk(node) as (
    select p -> 'Plan' from lab.plan(query) as p
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.node -> 'Plans', '[]')) as child
  )
  select coalesce(sum((node ->> 'Shared Hit Blocks')::numeric
                    + (node ->> 'Shared Read Blocks')::numeric), 0)
  from walk
  where node ->> 'Node Type' = node_type
$$;

-- WAL bytes the statement generated (its own, not other sessions').
create or replace function lab.wal_bytes(query text)
returns numeric
language sql
as $$
  select coalesce((p -> 'Plan' ->> 'WAL Bytes')::numeric, 0) from lab.plan(query) as p
$$;

-- WAL bytes this session has written so far, from its own statistics
-- (PostgreSQL 18+). Updated between statements, not inside a transaction
-- block, so read it outside one and subtract two readings.
create or replace function lab.my_wal()
returns numeric
language sql
as $$
  select wal_bytes from pg_stat_get_backend_wal(pg_backend_pid())
$$;

-- ---------------------------------------------------------------------------
-- What the planner expects: plain EXPLAIN, so nothing runs.

-- The top plan node the planner chose, with its estimates ('Plan Rows',
-- 'Total Cost', ...). Like lab.plan(q) -> 'Plan', without running anything.
create or replace function lab.estimate(query text)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute 'explain (format json) ' || query into result;
  return result -> 0 -> 'Plan';
end
$$;

-- The planner's row estimate for a query.
create or replace function lab.est_rows(query text)
returns numeric
language sql
as $$
  select (lab.estimate(query) ->> 'Plan Rows')::numeric
$$;

-- Every node type in the plan the planner would use, outermost first.
create or replace function lab.est_nodes(query text)
returns text[]
language sql
as $$
  with recursive walk(node) as (
    select lab.estimate(query)
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.node -> 'Plans', '[]')) as child
  )
  select array_agg(node ->> 'Node Type') from walk
$$;

-- The text form of EXPLAIN as one string, for checks on what a condition
-- looks like. Options default to costs off; pass 'analyze, costs off' (which
-- executes the query) or any other EXPLAIN options to see more.
create or replace function lab.plan_text(query text, options text default 'costs off')
returns text
language plpgsql
as $$
declare
  line text;
  result text := '';
begin
  for line in execute 'explain (' || options || ') ' || query loop
    result := result || line || E'\n';
  end loop;
  return result;
end
$$;

-- ---------------------------------------------------------------------------
-- Reading a plan you already have. Both take a whole EXPLAIN result (what
-- lab.plan() returns, the tree under 'Plan') or a plan node (what
-- lab.estimate() returns).

-- The first node of a given type anywhere in the plan, outermost first, or null.
create or replace function lab.find_node(plan jsonb, node_type text)
returns jsonb
language sql
as $$
  with recursive walk(n) as (
    select coalesce(plan -> 'Plan', plan)
    union all
    select child
    from walk, jsonb_array_elements(coalesce(walk.n -> 'Plans', '[]')) as child
  )
  select n from walk where n ->> 'Node Type' = node_type limit 1
$$;

-- One field of that first node, as text, e.g. lab.field(p, 'Index Scan', 'Index Name').
create or replace function lab.field(plan jsonb, node_type text, field text)
returns text
language sql
as $$
  select lab.find_node(plan, node_type) ->> field
$$;
