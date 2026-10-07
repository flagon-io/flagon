-- Lab for "Beyond the B-tree"
-- https://www.flagon.io/books/eight-kilobytes/more-indexes
-- Run: ./lab 17-more-indexes
--
-- Builds every index the chapter builds (GIN, trigram GIN and GiST, GiST on
-- ranges, SP-GiST, BRIN at three range sizes, hash) and checks each size and
-- page count the chapter quotes, with tolerances for the numbers that drift.

\pset tuples_only on
\pset format unaligned
set max_parallel_workers_per_gather = 2;

\echo
\echo '## GIN: jsonb containment'

select lab.prove(
  'without an index, the containment query reads every page of events (35,173)',
  lab.buffers($$ select id from events
                 where payload @> '{"duration_ms": 4242, "region": "syd"}' $$)
    between 35000 and 35400);

create index events_payload_gin on events using gin (payload);

select lab.prove(
  'the default jsonb_ops GIN index is about 20 MB',
  pg_relation_size('events_payload_gin') between 18e6 and 23e6);

select lab.prove(
  'with jsonb_ops, the query finds 81 rows',
  lab.node_sum($$ select id from events
              where payload @> '{"duration_ms": 4242, "region": "syd"}' $$,
           'Bitmap Heap Scan', 'Actual Rows') = 81);

select lab.prove(
  'with jsonb_ops, the index alone reads about 987 pages for 81 rows',
  lab.node_pages($$ select id from events
                where payload @> '{"duration_ms": 4242, "region": "syd"}' $$,
             'Bitmap Index Scan') between 850 and 1150);

select lab.prove(
  'jsonb_ops serves key existence (?)',
  'Bitmap Index Scan' = any (lab.nodes($$ select id from events where payload ? 'seen' $$)));

select pg_relation_size('events_payload_gin') as jsonb_ops_bytes \gset
drop index events_payload_gin;
create index events_payload_pathops on events using gin (payload jsonb_path_ops);

select lab.prove(
  'the jsonb_path_ops index is about 14 MB',
  pg_relation_size('events_payload_pathops') between 12.5e6 and 16e6);

select lab.prove(
  'jsonb_path_ops is smaller than jsonb_ops (14 MB against 20 MB)',
  :jsonb_ops_bytes::numeric / pg_relation_size('events_payload_pathops') > 1.25);

select lab.prove(
  'with jsonb_path_ops, the index reads about 121 pages for the same query',
  lab.node_pages($$ select id from events
                where payload @> '{"duration_ms": 4242, "region": "syd"}' $$,
             'Bitmap Index Scan') between 90 and 160);

select lab.prove(
  'with jsonb_path_ops the whole query reads about 202 pages',
  lab.buffers($$ select id from events
                 where payload @> '{"duration_ms": 4242, "region": "syd"}' $$)
    between 170 and 250);

select lab.prove(
  'jsonb_path_ops serves the jsonpath match operator @?',
  'Bitmap Index Scan' = any (lab.nodes($$ select id from events
                                         where payload @? '$.duration_ms ? (@ == 4242)' $$)));

select lab.prove(
  'jsonb_path_ops does not serve key existence (?): a sequential scan',
  (select not ('Bitmap Index Scan' = any (n))
          and ('Seq Scan' = any (n) or 'Parallel Seq Scan' = any (n))
   from lab.nodes($$ select id from events where payload ? 'seen' $$) as n));

do $$
begin
  perform 1 from pg_amop o
  join pg_opfamily f on f.oid = o.amopfamily
  where f.opfmethod = (select oid from pg_am where amname = 'gin')
    and f.opfname = 'jsonb_path_ops'
    and o.amopopr = '?(jsonb,text)'::regoperator;
  if found then raise exception 'NOT PROVED: jsonb_path_ops has no ? operator'; end if;
end $$;
select lab.prove('the jsonb_path_ops operator class has no ? (key exists) operator', true);

\echo
\echo '## GIN does not help unselective queries'

select lab.prove(
  'failed events in syd: about 100,000 rows match',
  lab.node_sum($$ select count(*) from events
              where payload @> '{"status": "failed", "region": "syd"}' $$,
           'Bitmap Heap Scan', 'Actual Rows') between 95000 and 105000);

select lab.prove(
  'those rows sit on about 33,343 of the 35,173 heap pages (over 90 percent)',
  lab.node_sum($$ select count(*) from events
              where payload @> '{"status": "failed", "region": "syd"}' $$,
           'Bitmap Heap Scan', 'Exact Heap Blocks')
    > 0.9 * (select relpages from pg_class where relname = 'events'));

\echo
\echo '## GIN on arrays'

do $$ begin perform setseed(0.13); end $$;
alter table projects add column tags text[] not null default '{}';
-- 1 to 4 random tags per project from a list of 20, plus 'gdpr' on 50 projects
update projects set tags = array(
    select (array['web','api','mobile','infra','data','ml','internal','beta','legacy','billing',
                  'auth','search','payments','ops','docs','growth','ios','android','edge','cli'])
           [1 + floor(random() * 20)::int]
    from generate_series(1, 1 + floor(random() * 4)::int + (id * 0)::int))
  || case when id % 400 = 0 then '{gdpr}'::text[] else '{}' end;
vacuum analyze projects;

select lab.prove(
  'exactly 50 projects are tagged gdpr',
  (select count(*) from projects where tags @> '{gdpr}') = 50);

select lab.prove(
  'without an index, finding them reads every page of projects (about 507)',
  lab.buffers($$ select id from projects where tags @> '{gdpr}' $$) between 450 and 560);

create index projects_tags_idx on projects using gin (tags);

select lab.prove(
  'with a GIN index on tags, the index reads 3 pages and the heap one page per match: 53 in all',
  lab.node_pages($$ select id from projects where tags @> '{gdpr}' $$, 'Bitmap Index Scan') <= 4
  and lab.buffers($$ select id from projects where tags @> '{gdpr}' $$) between 45 and 56);

select lab.prove(
  '&& (overlaps) uses the GIN index too',
  'Bitmap Index Scan' = any (lab.nodes($$ select id from projects where tags && '{gdpr,beta}' $$)));

select lab.prove(
  '''gdpr'' = any (tags) cannot use the GIN index: a sequential scan',
  lab.nodes($$ select id from projects where 'gdpr' = any (tags) $$) = '{Seq Scan}');

\echo
\echo '## GIN for full-text search'

do $$ begin perform setseed(0.13); end $$;
create table comments (
  id        bigint generated always as identity primary key,
  event_id  bigint not null references events (id),
  body      text not null,
  search    tsvector generated always as (to_tsvector('english', body)) stored
);
-- one comment per comment event: 6 to 15 words from a small vocabulary,
-- and every 5,100th one mentions a deadlock
insert into comments (event_id, body)
select e.id,
       case when e.rn % 5100 = 0 then 'deadlock detected while ' else '' end ||
       array_to_string(array(
         select (array['the','deploy','failed','again','after','retrying','build','is','green','now',
                       'rollback','timeout','staging','production','looks','good','to','me','please','review',
                       'merged','cache','flaky','test','fixed','by','pinning','version','alert','cleared',
                       'latency','spike','in','region','waiting','on','approval','migration','ran','cleanly'])
                [1 + floor(random() * 40)::int]
         from generate_series(1, 6 + floor(random() * 10)::int + (e.id * 0)::int)), ' ')
from (select id, row_number() over (order by id) as rn from events where kind = 'comment') e;
vacuum analyze comments;

select lab.prove(
  'there are 249,934 comments, 49 of them about "deadlock"',
  (select count(*) from comments) = 249934
  and (select count(*) from comments where body like '%deadlock%') = 49);

select lab.prove(
  'to_tsvector drops stop words and stems: deploy, fail, retri',
  to_tsvector('english', 'The deploys failed again after retrying')::text
    = $$'deploy':2 'fail':3 'retri':6$$);

select lab.prove(
  'without an index, a search reads every page of comments (about 6,700)',
  lab.buffers($$ select id, body from comments
                 where search @@ to_tsquery('english', 'deadlock') $$) between 6400 and 7000);

create index comments_search_idx on comments using gin (search);

select lab.prove(
  'with a GIN index, the search finds all 49 and the index reads under 5 pages',
  lab.node_sum($$ select id, body from comments where search @@ to_tsquery('english', 'deadlock') $$,
           'Bitmap Heap Scan', 'Actual Rows') = 49
  and lab.node_pages($$ select id, body from comments where search @@ to_tsquery('english', 'deadlock') $$,
                 'Bitmap Index Scan') < 5);

select lab.prove(
  'with a GIN index, the whole search reads at most about 60 pages (one per matching row)',
  lab.buffers($$ select id, body from comments
                 where search @@ to_tsquery('english', 'deadlock') $$) < 60);

select lab.prove(
  'the full-text index is about 2.4 MB for a quarter-million comments',
  pg_relation_size('comments_search_idx') between 2.0e6 and 3.0e6);

select lab.prove(
  'websearch_to_tsquery turns -staging into a negation',
  websearch_to_tsquery('english', 'rollback timeout -staging')::text
    = $$'rollback' & 'timeout' & !'stage'$$);

\echo
\echo '## The pending list'

select lab.prove(
  'fastupdate is on and gin_pending_list_limit is 4 MB by default',
  current_setting('gin_pending_list_limit') = '4MB'
  and (select reloptions from pg_class where relname = 'events_payload_pathops') is null);

select lab.node_pages($$ select id from events
                    where payload @> '{"duration_ms": 4242, "region": "syd"}' $$,
                  'Bitmap Index Scan') as pages_before \gset

insert into events (account_id, project_id, user_id, kind, payload, created_at)
select account_id, project_id, user_id, kind, payload, now()
from events order by id desc limit 5000;

select lab.prove(
  'after 5,000 inserts the pending list holds 5,000 tuples on a few dozen pages',
  (select pending_tuples = 5000 and pending_pages between 25 and 60
   from pgstatginindex('events_payload_pathops')));

select lab.prove(
  'every search now scans the pending pages too (121 index pages became about 158)',
  lab.node_pages($$ select id from events
                where payload @> '{"duration_ms": 4242, "region": "syd"}' $$,
             'Bitmap Index Scan')
    - :pages_before >= (select pending_pages - 2 from pgstatginindex('events_payload_pathops')));

select gin_clean_pending_list('events_payload_pathops') > 0 as cleaned;

select lab.prove(
  'gin_clean_pending_list merges the list and empties it',
  (select pending_pages = 0 and pending_tuples = 0
   from pgstatginindex('events_payload_pathops')));

-- The BRIN sections need the heap free of this index's write cost.
drop index events_payload_pathops;

\echo
\echo '## pg_trgm: LIKE with a leading wildcard'

select lab.prove(
  'show_trgm splits user4242 into 9 trigrams',
  show_trgm('user4242') = '{"  u"," us",242,"42 ",424,er4,r42,ser,use}'::text[]);

create index users_email_btree on users (email);
vacuum analyze users;

select lab.prove(
  'a plain B-tree cannot serve like ''%r4242@%'': the scan reads all 1,126 pages of users',
  lab.nodes($$ select id, email from users where email like '%r4242@%' $$) = '{Seq Scan}'
  and lab.buffers($$ select id, email from users where email like '%r4242@%' $$) = 1126);

create index users_email_trgm_gin on users using gin (email gin_trgm_ops);

select lab.prove(
  'with a trigram GIN index, like ''%r4242@%'' reads about 10 pages',
  lab.buffers($$ select id, email from users where email like '%r4242@%' $$) <= 15);

select lab.prove(
  'the same index serves ilike',
  'Bitmap Index Scan' = any (lab.nodes($$ select id, email from users where email ilike '%R4242@%' $$))
  and lab.buffers($$ select id, email from users where email ilike '%R4242@%' $$) <= 15);

select lab.prove(
  'and regular expressions',
  'Bitmap Index Scan' = any (lab.nodes($$ select id from users where email ~ 'r42+@' $$)));

\echo
\echo '## Prefix search needs the right operator class'

select lab.prove(
  'this database uses a non-C collation (en_US.utf8)',
  (select datcollate from pg_database where datname = current_database()) not in ('C', 'POSIX'));

select lab.prove(
  'under it, the plain B-tree on email does not serve like ''user4242@%''',
  not ('Index Scan' = any (lab.nodes($$ select id, email from users where email like 'user4242@%' $$))));

create index users_email_pattern on users (email text_pattern_ops);

select lab.prove(
  'a text_pattern_ops index serves the prefix in about 4 pages',
  lab.plan($$ select id, email from users where email like 'user4242@%' $$)
    -> 'Plan' ->> 'Index Name' = 'users_email_pattern'
  and lab.buffers($$ select id, email from users where email like 'user4242@%' $$) <= 5);

\echo
\echo '## GIN or GiST for trigrams'

create index users_email_trgm_gist on users using gist (email gist_trgm_ops);

select lab.prove(
  'trigram GIN on email is about 3,504 kB',
  pg_relation_size('users_email_trgm_gin') between 3.0e6 and 4.2e6);

select lab.prove(
  'trigram GiST on email is about 11 MB, over 2.5 times the GIN',
  pg_relation_size('users_email_trgm_gist') between 10e6 and 13.5e6
  and pg_relation_size('users_email_trgm_gist')::numeric
      / pg_relation_size('users_email_trgm_gin') > 2.5);

drop index users_email_trgm_gin;

select lab.prove(
  'GiST serves like ''%r4242@%'' too, but reads over 100 pages (GIN: about 10)',
  lab.buffers($$ select id, email from users where email like '%r4242@%' $$) > 100);

select lab.prove(
  'the nearest email to the typo usr4242@exmaple.com is user4242@example.com, distance 0.481',
  (select email = 'user4242@example.com'
          and round((email <-> 'usr4242@exmaple.com')::numeric, 3) = 0.481
   from users order by email <-> 'usr4242@exmaple.com' limit 1));

select lab.prove(
  'with GiST, the similarity search is an index scan ordered by distance',
  lab.nodes($$ select email from users order by email <-> 'usr4242@exmaple.com' limit 5 $$)
    = '{Limit,Index Scan}');

select lab.prove(
  'that index scan touches more pages (about 1,427) than the table has (1,126)',
  lab.buffers($$ select email from users order by email <-> 'usr4242@exmaple.com' limit 5 $$) > 1126);

drop index users_email_trgm_gist;

select lab.prove(
  'without GiST, Postgres computes every distance and sorts',
  'Sort' = any (lab.nodes($$ select email from users order by email <-> 'usr4242@exmaple.com' limit 5 $$)));

\echo
\echo '## GiST: ranges and exclusion constraints'

create extension if not exists btree_gist;

create table deploy_freezes (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references projects (id),
  during      tstzrange not null,
  reason      text not null,
  exclude using gist (project_id with =, during with &&)
);

insert into deploy_freezes (project_id, during, reason)
values (4242, tstzrange('2026-12-20', '2027-01-03'), 'holiday freeze');

do $$
begin
  insert into deploy_freezes (project_id, during, reason)
  values (4242, tstzrange('2026-12-31', '2027-01-02'), 'new year');
  raise exception 'NOT PROVED: the overlapping freeze was accepted';
exception when exclusion_violation then
  perform set_config('lab.freeze_rejected', 'yes', false);
end $$;
select lab.prove(
  'an overlapping freeze for the same project is rejected (exclusion_violation)',
  current_setting('lab.freeze_rejected', true) = 'yes');

create table without_overlaps_demo (
  project_id bigint,
  during     tstzrange,
  primary key (project_id, during without overlaps)
);
select lab.prove(
  'PostgreSQL 18 WITHOUT OVERLAPS builds the same kind of index: GiST',
  (select am.amname from pg_class c join pg_am am on am.oid = c.relam
   where c.relname = 'without_overlaps_demo_pkey') = 'gist');
drop table without_overlaps_demo;

delete from deploy_freezes;
do $$ begin perform setseed(0.13); end $$;
-- 24 freezes per project, one in each half-month of the past year, up to 16 hours long
insert into deploy_freezes (project_id, during, reason)
select p.id, tstzrange(x.s, x.s + random() * interval '16 hours'), 'freeze ' || slot
from projects p, generate_series(0, 23) slot,
     lateral (select now() - interval '365 days' + slot * interval '365 days' / 24
                     + random() * interval '14 days' + (p.id * 0) * interval '1 second' as s) x;
vacuum analyze deploy_freezes;

select lab.prove('480,000 freezes loaded', (select count(*) from deploy_freezes) = 480000);

set enable_bitmapscan = off;
set enable_indexscan = off;
select lab.buffers($$ select project_id, reason from deploy_freezes
                      where during @> now() - interval '100 days' $$) as seq_pages \gset
reset enable_bitmapscan;
reset enable_indexscan;

select lab.prove(
  'a sequential scan of deploy_freezes reads about 4,548 pages',
  :seq_pages between 4300 and 4800);

select lab.prove(
  'the constraint''s index, led by project_id, reads more pages than the sequential scan',
  (lab.plan($$ select project_id, reason from deploy_freezes
               where during @> now() - interval '100 days' $$) #>> '{Plan,Plans,0,Index Name}')
      = 'deploy_freezes_project_id_during_excl'
  and lab.buffers($$ select project_id, reason from deploy_freezes
                     where during @> now() - interval '100 days' $$) > :seq_pages);

create index deploy_freezes_during_idx on deploy_freezes using gist (during);

select lab.prove(
  'a GiST index on the range alone answers in about 7 index pages',
  lab.node_pages($$ select project_id, reason from deploy_freezes
                where during @> now() - interval '100 days' $$, 'Bitmap Index Scan') < 20);

select lab.prove(
  'and the whole query reads under 600 pages (one per matching heap page, about 460)',
  lab.buffers($$ select project_id, reason from deploy_freezes
                 where during @> now() - interval '100 days' $$) < 600);

\echo
\echo '## SP-GiST'

drop index users_email_pattern;
create index users_email_spgist on users using spgist (email);

select lab.prove(
  'SP-GiST serves ^@ (starts with) in about 5 pages',
  (lab.plan($$ select id from users where email ^@ 'user4242@' $$) #>> '{Plan,Plans,0,Index Name}')
     = 'users_email_spgist'
  and lab.buffers($$ select id from users where email ^@ 'user4242@' $$) <= 6);

select lab.prove(
  'the SP-GiST index (4,672 kB) is about the size of the B-tree on the same column',
  pg_relation_size('users_email_spgist')::numeric / pg_relation_size('users_email_btree')
    between 0.8 and 1.5);

drop index users_email_spgist;

\echo
\echo '## BRIN: indexes that summarize pages'

select lab.prove(
  'id and created_at are perfectly correlated with physical order',
  (select bool_and(correlation > 0.99) from pg_stats
   where tablename = 'events' and attname in ('id', 'created_at')));

select lab.prove(
  'project_id and account_id have essentially no correlation',
  (select bool_and(abs(correlation) < 0.05) from pg_stats
   where tablename = 'events' and attname in ('project_id', 'account_id')));

-- The chapter's day: May 1, 2026 (the seed's dates are fixed).
\set day_start '2026-05-01 00:00:00+00'
\set day_end '2026-05-02 00:00:00+00'

set max_parallel_workers_per_gather = 0;

select lab.buffers(format($$ select kind, count(*), avg((payload->>'duration_ms')::int)
                             from events where created_at >= %L and created_at < %L
                             group by kind $$, :'day_start', :'day_end')) as no_index_pages \gset

select lab.prove(
  'with no index, a one-day summary reads the whole table (about 35,272 pages)',
  :no_index_pages between 35000 and 35500);

create index events_created_brin on events using brin (created_at);

select lab.prove(
  'BRIN stores one summary per 128 pages: about 275 for the table',
  (select count(*) from brin_page_items(get_raw_page('events_created_brin', 2), 'events_created_brin'))
    between 270 and 280);

select lab.prove(
  'pages 0 to 127 hold about a day and a half of events',
  (select upper_bound - lower_bound between interval '30 hours' and interval '40 hours'
   from (select split_part(trim(both '{}' from value), ' .. ', 1)::timestamptz as lower_bound,
                split_part(trim(both '{}' from value), ' .. ', 2)::timestamptz as upper_bound
         from brin_page_items(get_raw_page('events_created_brin', 2), 'events_created_brin')
         where blknum = 0) b));

select format($$ select kind, count(*), avg((payload->>'duration_ms')::int)
                 from events where created_at >= %L and created_at < %L
                 group by kind $$, :'day_start', :'day_end') as day_query \gset

select lab.prove(
  'with BRIN (128 pages per range), the one-day summary reads about 261 pages',
  lab.buffers(:'day_query') between 200 and 320);

select lab.prove(
  'BRIN heap blocks are all lossy: 256 of them',
  lab.node_sum(:'day_query', 'Bitmap Heap Scan', 'Lossy Heap Blocks') between 250 and 270
  and lab.node_sum(:'day_query', 'Bitmap Heap Scan', 'Exact Heap Blocks') = 0);

select lab.prove(
  'the BRIN node''s "rows" is ten per matching page, not a row count',
  lab.node_sum(:'day_query', 'Bitmap Index Scan', 'Actual Rows')
    = 10 * lab.node_sum(:'day_query', 'Bitmap Heap Scan', 'Lossy Heap Blocks'));

select lab.prove(
  'the recheck discards thousands of rows (about 9,078)',
  lab.node_sum(:'day_query', 'Bitmap Heap Scan', 'Rows Removed by Index Recheck') between 5000 and 13000);

select lab.prove('the BRIN index is 24 kB', pg_relation_size('events_created_brin') <= 32768);

create index events_created_btree on events (created_at);

select lab.prove(
  'the B-tree on created_at is about 43 MB',
  pg_relation_size('events_created_btree') between 40e6 and 48e6);

select lab.prove(
  'the B-tree is over 1,000 times larger than the BRIN (about 1,800)',
  pg_relation_size('events_created_btree')::numeric / pg_relation_size('events_created_brin') > 1000);

select lab.buffers(:'day_query') as btree_pages \gset
select lab.prove(
  'with the B-tree, the one-day summary reads about 115 pages',
  :btree_pages between 90 and 140);

drop index events_created_btree;
drop index events_created_brin;

create index events_created_brin32 on events using brin (created_at) with (pages_per_range = 32);
select lab.buffers(:'day_query') as brin32_pages \gset
select lab.node_pages(:'day_query', 'Bitmap Index Scan') as brin32_index_pages \gset

select lab.prove(
  'BRIN at 32 pages per range is about 48 kB and reads about 133 pages',
  pg_relation_size('events_created_brin32') <= 65536
  and :brin32_pages between 100 and 180);

select lab.prove(
  'BRIN at 32 pages per range gets within 20 pages of the B-tree',
  :brin32_pages - :btree_pages <= 20);

drop index events_created_brin32;
create index events_created_brin8 on events using brin (created_at) with (pages_per_range = 8);

select lab.prove(
  'BRIN at 8 pages per range is about 168 kB and reads about 130 pages',
  pg_relation_size('events_created_brin8') between 140000 and 200000
  and lab.buffers(:'day_query') between 100 and 170);

select lab.prove(
  'going from 32 to 8 pages per range costs about 20 more index pages and saves about as many heap pages',
  lab.node_pages(:'day_query', 'Bitmap Index Scan') - :brin32_index_pages between 10 and 35
  and abs(lab.buffers(:'day_query') - :brin32_pages) <= 15);

drop index events_created_brin8;

\echo
\echo '## BRIN is useless without physical order'

create index events_project_brin on events using brin (project_id);
reset max_parallel_workers_per_gather;
set enable_seqscan = off;

select lab.prove(
  'BRIN on project_id (forced) reads every page of the table anyway',
  'Bitmap Index Scan' = any (lab.nodes($$ select count(*) from events where project_id = 4242 $$))
  and lab.buffers($$ select count(*) from events where project_id = 4242 $$)
      >= (select relpages from pg_class where relname = 'events'));

reset enable_seqscan;
drop index events_project_brin;

create index events_created_brin on events using brin (created_at);
insert into events (account_id, project_id, user_id, kind, payload, created_at)
select account_id, project_id, user_id, kind, payload, now()
from events order by id desc limit 20000;

select lab.prove(
  'pages added after the BRIN index was built are not summarized until vacuum or brin_summarize_new_values',
  brin_summarize_new_values('events_created_brin') > 0);

drop index events_created_brin;

select lab.prove(
  'minmax_multi and bloom BRIN operator classes exist',
  (select count(*) from pg_opclass c join pg_am a on a.oid = c.opcmethod
   where a.amname = 'brin' and c.opcname = 'timestamptz_minmax_multi_ops') = 1
  and (select count(*) from pg_opclass c join pg_am a on a.oid = c.opcmethod
       where a.amname = 'brin' and c.opcname = 'text_bloom_ops') = 1);

\echo
\echo '## Hash indexes'

select lab.prove(
  'hash indexes: one column, no uniqueness, no ordering',
  (select not pg_indexam_has_property(oid, 'can_unique')
      and not pg_indexam_has_property(oid, 'can_multi_col')
      and not pg_indexam_has_property(oid, 'can_order')
   from pg_am where amname = 'hash'));

select lab.prove(
  'hash indexes support exactly one operator per type: =',
  (select bool_and(o.amopstrategy = 1) and bool_and(op.oprname = '=')
   from pg_amop o
   join pg_operator op on op.oid = o.amopopr
   where o.amopmethod = (select oid from pg_am where amname = 'hash')));

alter table users add column api_key text;  -- 128 hex characters per user
update users set api_key = encode(sha512(('key' || id)::bytea), 'hex');
vacuum analyze users;
reindex index users_email_btree;

create index users_api_key_btree on users (api_key);
create index users_api_key_hash  on users using hash (api_key);
create index users_email_hash    on users using hash (email);

select lab.prove(
  'api_key values are 128 characters',
  (select bool_and(length(api_key) = 128) from users));

select lab.prove(
  'B-tree on api_key: about 16 MB; hash on api_key: about 4,112 kB',
  pg_relation_size('users_api_key_btree') between 15e6 and 19e6
  and pg_relation_size('users_api_key_hash') between 3.8e6 and 4.6e6);

select lab.prove(
  'on the long key, the hash index is about a quarter of the B-tree',
  pg_relation_size('users_api_key_hash')::numeric / pg_relation_size('users_api_key_btree')
    between 0.2 and 0.3);

select lab.prove(
  'the hash index size does not depend on key width: same size on email',
  pg_relation_size('users_email_hash') = pg_relation_size('users_api_key_hash'));

select lab.prove(
  'on the short email key, the B-tree (about 3,992 kB) is no bigger than the hash',
  pg_relation_size('users_email_btree') between 3.5e6 and 4.5e6
  and pg_relation_size('users_email_btree') <= pg_relation_size('users_email_hash'));

select lab.prove(
  'a hash lookup on api_key touches 3 pages (metapage, bucket, heap)',
  lab.buffers($$ select id from users where api_key = encode(sha512('key4242'::bytea), 'hex') $$) = 3);

drop index users_api_key_hash;

select lab.prove(
  'the same lookup through the B-tree touches 5 pages',
  lab.buffers($$ select id from users where api_key = encode(sha512('key4242'::bytea), 'hex') $$) = 5);

select lab.prove(
  'a hash index cannot return the key for an index-only scan',
  not pg_index_column_has_property('users_email_hash'::regclass, 1, 'returnable'));
