#!/usr/bin/env bash
# Lab for "Search without a search engine"
# https://www.flagon.io/books/eight-kilobytes/search
#
# Run: ./lab 22          (from this folder; Linux, macOS, or Git Bash)
#      KEEP=1 ./lab 22   (leave the server up to explore; then
#        docker compose -f 22-search.compose.yml exec postgres psql -d search
#        and docker compose -f 22-search.compose.yml down -v when done)
#
# Starts PostgreSQL 18 with pgvector from 22-search.compose.yml, loads the
# book's accounts, users, and projects (no events: this chapter doesn't need
# them) plus a synthetic help center: 50,000 articles with text and
# 384-dimension embeddings. The embeddings are not from a model. They are
# random points around 1,000 cluster centers grouped under 12 topics, built
# with setseed() so the structure is known and every run is the same.
# Every claim prints PROVED; the first one that doesn't hold stops the run,
# and the server is always torn down again, volumes included.

LAB_COMPOSE=22-search.compose.yml
. "$(dirname "$0")/lib.sh"

has() { grep -qF -- "$1" <<<"$2"; }
# sql [psql args]: run psql in the lab database, quiet and unaligned. The
# lab.prove() checks print their own PROVED lines.
sql() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres \
    psql -X -q -At -v ON_ERROR_STOP=1 -d search "$@"
}

echo "starting PostgreSQL 18 with pgvector (first run pulls pgvector/pgvector:pg18)"
start

section "Loading accounts, users, and projects from the book's seed"
"${COMPOSE[@]}" exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -c "create database search" >/dev/null
# The seed minus its two million events.
sed '/^insert into events/,/^order by r.g;/d' seed.sql | sql >/dev/null
sql < helpers.sql >/dev/null
sql <<'SQL'
-- Best-of-n wall-clock time of a statement, in milliseconds. Timings are
-- only ever compared as ratios on the same machine.
create function lab.ms(query text, runs int default 3) returns numeric
language plpgsql as $$
declare best numeric; t0 timestamptz; el numeric;
begin
  for i in 1 .. runs loop
    t0 := clock_timestamp();
    execute query;
    el := extract(epoch from clock_timestamp() - t0) * 1000;
    if best is null or el < best then best := el; end if;
  end loop;
  return round(best, 2);
end $$;
select lab.prove('the seed loaded 1,000 accounts and 20,000 projects',
  (select count(*) from accounts) = 1000 and (select count(*) from projects) = 20000);
SQL

section "Building the synthetic help center (50,000 articles)"
sql <<'SQL'
select setseed(0.4242) \g /dev/null
-- 12 topics, three titles and six sentences each.
create table topics (id int primary key, name text, titles text[], sentences text[]);
insert into topics values
(1, 'deploys',
 array['Rolling back a failed deploy', 'How deploys move traffic', 'Pausing automatic deploys'],
 array['The deploy failed because the health check timed out after thirty seconds.',
       'Roll back to the previous release when a deploy keeps failing.',
       'Deploying to a new region copies the build artifacts before traffic shifts.',
       'Blue-green deploys keep the old version running until the new one is healthy.',
       'A failed deploy leaves the current release serving traffic.',
       'You can pause automatic deploys while an incident is open.']),
(2, 'builds',
 array['Speeding up slow builds', 'Why a build fails', 'Build caching explained'],
 array['Builds run in a clean container with dependencies cached between runs.',
       'A build that fails on a missing lockfile never reaches the deploy step.',
       'Cache keys include the lockfile hash, so changing dependencies rebuilds the cache.',
       'Long builds usually spend their time downloading packages, not compiling.',
       'Build logs are kept for thirty days and can be searched by commit.',
       'Retrying a flaky build reuses the cached layers from the last success.']),
(3, 'billing',
 array['Understanding your invoice', 'Changing plans', 'When a payment fails'],
 array['Invoices are issued on the first day of each month in the account currency.',
       'Upgrading to the team plan prorates the charge for the rest of the month.',
       'A failed payment is retried three times before the account is downgraded.',
       'Usage above the plan limit is billed per thousand requests.',
       'Refunds go back to the original card within ten business days.',
       'Enterprise contracts are invoiced annually with net thirty terms.']),
(4, 'sign-in',
 array['Signing in with single sign-on', 'Two-factor authentication', 'Locked out of your account'],
 array['Sign in with single sign-on once your administrator enables SAML.',
       'Two-factor authentication codes expire after thirty seconds.',
       'Locked accounts unlock automatically after fifteen minutes.',
       'Personal access tokens carry scopes and can be revoked at any time.',
       'Password resets send a one-time link that works for one hour.',
       'Sessions expire after twelve hours of inactivity.']),
(5, 'databases',
 array['Keeping your database fast', 'Connection limits', 'Restoring a backup'],
 array['Connection limits apply per database, so pool connections in the application.',
       'A long-running transaction can block vacuum and bloat busy tables.',
       'Slow queries are logged with their plans when they exceed the threshold.',
       'Add an index before the table grows, not after the dashboard gets slow.',
       'Deadlocks happen when two transactions lock the same rows in different orders.',
       'Backups run nightly and can be restored to any point in the last week.']),
(6, 'regions',
 array['Choosing a region', 'Custom domains and certificates', 'Edge routing'],
 array['Traffic is served from the region closest to the visitor.',
       'Custom domains need a CNAME record pointing at the edge network.',
       'Certificates renew automatically thirty days before they expire.',
       'The São Paulo region came online with three availability zones.',
       'Requests from Zürich and Montréal are routed to the nearest edge.',
       'Latency between regions is dominated by the speed of light, not bandwidth.']),
(7, 'alerts',
 array['Alerts that matter', 'Routing alerts to on-call', 'Reading the latency dashboard'],
 array['Alerts fire when the error rate stays above the threshold for five minutes.',
       'Route alerts to the on-call engineer and silence them during maintenance.',
       'A noisy alert that nobody acts on should be deleted, not muted.',
       'Dashboards show request latency at the median and the ninety-ninth percentile.',
       'Alerting on symptoms catches more incidents than alerting on causes.',
       'Each alert links to the runbook that explains how to respond.']),
(8, 'api',
 array['API pagination', 'Rate limits', 'Retrying webhooks safely'],
 array['The API returns paginated results with a cursor for the next page.',
       'Rate limits allow one hundred requests per second per token.',
       'Webhooks retry with exponential backoff when your endpoint fails.',
       'Idempotency keys make retried requests safe to repeat.',
       'Every API error includes a request ID for support.',
       'Deprecated endpoints keep working for twelve months after the announcement.']),
(9, 'members',
 array['Inviting members', 'Roles and permissions', 'Removing a member'],
 array['Owners can invite members and assign them a role on each project.',
       'Removing a member revokes their tokens and sessions immediately.',
       'Teams grant access to many projects at once.',
       'The audit log records who changed a permission and when.',
       'Read-only members can view deploys but cannot trigger them.',
       'Transfer project ownership before deleting a user account.']),
(10, 'logs',
 array['Searching logs', 'Log retention', 'Forwarding logs'],
 array['Logs are retained for fourteen days on the free plan.',
       'Search logs by request ID to follow one request across services.',
       'Structured logs in JSON are easier to filter than plain text.',
       'Log drains forward every line to your own storage.',
       'Sampling keeps log volume down during traffic spikes.',
       'Errors in the logs are grouped by their stack trace.']),
(11, 'files',
 array['Uploading large files', 'Private files and signed URLs', 'Recovering deleted files'],
 array['Uploaded files are stored in the region of the project.',
       'Large uploads use multipart requests that resume after a failure.',
       'Signed URLs give temporary access to private files.',
       'Deleted files stay recoverable for thirty days.',
       'Image resizing happens at the edge and the results are cached.',
       'Storage is billed per gigabyte per month.']),
(12, 'cli',
 array['Installing the CLI', 'Environment variables', 'Feature flags'],
 array['Install the command-line tool and log in with your browser.',
       'The CLI reads its configuration from the project directory.',
       'Run the deploy command with a flag to skip the build cache.',
       'Environment variables are encrypted and injected at runtime.',
       'Feature flags roll out gradually and can be turned back off.',
       'Local development mirrors production settings by default.']);

-- The vector space: one center per topic, 1,000 cluster centers scattered
-- around the topic centers, and (below) articles scattered around clusters.
create table topic_centers as
select t.id as topic,
       (select array_agg(random_normal(0, 1)::real) from generate_series(1, 384) where t.id > 0) as v
from topics t order by t.id;
create table clusters as
select c as id, 1 + c % 12 as topic,
       (select array_agg(x + random_normal(0, 0.5)::real order by i)
          from unnest(tc.v) with ordinality u(x, i) where c > 0) as v
from generate_series(1, 1000) c
join topic_centers tc on tc.topic = 1 + c % 12
order by c;

-- Every sentence, for the quarter of sentences borrowed from another topic.
create table all_sentences as
select array_agg(s order by t.id, n) as s
from topics t, unnest(t.sentences) with ordinality u(s, n);

-- An article: a cluster (and so a topic), a random account and kind, a title
-- from its topic, and 3 to 8 sentences, three quarters of them on topic.
create table corpus as
select x.g as id, c.id as cluster, c.topic,
       1 + floor(random() * 1000)::bigint as account_id,
       (array['guide','faq','reference','tutorial','changelog','runbook','policy',
              'glossary','troubleshooting','announcement'])[1 + floor(random() * 10)::int] as kind,
       t.titles[1 + floor(random() * 3)::int] as title,
       (select string_agg(case when n > 0 and random() < 0.75 then t.sentences[1 + floor(random() * 6)::int]
                               else a.s[1 + floor(random() * 72)::int] end, ' ')
          from generate_series(1, 3 + floor(random() * 6)::int) n where x.g > 0) as body
from (select g, 1 + floor(random() * 1000)::int as cl from generate_series(1, 50000) g) x
join clusters c on c.id = x.cl
join topics t on t.id = c.topic
cross join all_sentences a
order by x.g;
create unique index on corpus (id);
analyze corpus;
select lab.prove('the corpus has 50,000 articles across 12 topics and 1,000 clusters',
  (select count(*) = 50000 and count(distinct topic) = 12 and count(distinct cluster) = 1000 from corpus));
SQL

section "Text becomes lexemes"
sql <<'SQL'
select lab.prove('english stems deploys, failing, rolled, and deployment and drops the stop words',
  to_tsvector('english', 'The deploys were failing, so we rolled back the deployment')
    = $$'back':8 'deploy':2,10 'fail':4 'roll':7$$::tsvector);
select lab.prove('simple keeps every word, stop words included, unstemmed',
  to_tsvector('simple', 'The deploys were failing, so we rolled back the deployment')
    = $$'back':8 'deployment':10 'deploys':2 'failing':4 'rolled':7 'so':5 'the':1,9 'we':6 'were':3$$::tsvector);
select lab.prove('ts_debug shows english_stem turning failing into fail',
  (select lexemes from ts_debug('english', 'The deploys were failing') where token = 'failing') = '{fail}');
select lab.prove('the english stop-word list has 127 words, and a query of only stop words has no lexemes left',
  numnode(plainto_tsquery('english', 'to be or not to be')) = 0);
select lab.prove('stemming collides: organization matches organ, university matches universe',
  to_tsvector('english', 'organization') @@ to_tsquery('english', 'organ')
  and to_tsvector('english', 'university') @@ to_tsquery('english', 'universe'));
select lab.prove('news and new stay distinct',
  not (to_tsvector('english', 'news') @@ to_tsquery('english', 'new')));
select lab.prove('Postgres ships about thirty built-in configurations, and this server defaults to english',
  (select count(*) between 25 and 40 from pg_ts_config where oid < 16384)
  and current_setting('default_text_search_config') = 'pg_catalog.english');
select lab.prove('to_tsvector with a configuration is immutable; without one it is only stable',
  (select bool_and(case when pg_get_function_identity_arguments(oid) = 'regconfig, text' then provolatile = 'i'
                        when pg_get_function_identity_arguments(oid) = 'text' then provolatile = 's' else true end)
     from pg_proc where proname = 'to_tsvector'));
SQL
# The english stop list is a file shipped with the server.
stopwords=$("${COMPOSE[@]}" exec -T postgres bash -c 'grep -c . "$(pg_config --sharedir)/tsearch_data/english.stop"')
prove "the english stop-word file has 127 words" [ "$stopwords" = "127" ]

section "Configurations are part of the index"
sql <<'SQL'
create table cfg_test (body text);
do $$ begin
  execute 'create index on cfg_test using gin (to_tsvector(body))';
  raise exception 'no error';
exception when others then
  if sqlerrm not like 'functions in index expression must be marked IMMUTABLE%' then raise; end if;
end $$;
select lab.prove('an index on one-argument to_tsvector is refused: it isn''t immutable', true);

create extension unaccent;
create text search configuration app_english (copy = english);
alter text search configuration app_english
  alter mapping for hword, hword_part, word with unaccent, english_stem;
select lab.prove('with unaccent in the configuration, Zürich and Montréal become zurich and montreal',
  to_tsvector('app_english', 'Requests from Zürich and Montréal')
    = $$'montreal':5 'request':1 'zurich':3$$::tsvector);
select lab.prove('plain english keeps the accent, so a search for zurich misses Zürich',
  not (to_tsvector('english', 'Requests from Zürich') @@ websearch_to_tsquery('english', 'zurich'))
  and to_tsvector('app_english', 'Requests from Zürich') @@ websearch_to_tsquery('app_english', 'zurich'));
select lab.prove('the unaccent() function is only stable',
  (select bool_and(provolatile = 's') from pg_proc where proname = 'unaccent'));
do $$ begin
  execute $q$create table unaccent_test (body text,
    search tsvector generated always as (to_tsvector('english', unaccent(body))) stored)$q$;
  raise exception 'no error';
exception when others then
  if sqlerrm <> 'generation expression is not immutable' then raise; end if;
end $$;
select lab.prove('a generated column calling unaccent() is refused; the configuration route works', true);
create table unaccent_ok (body text,
  search tsvector generated always as (to_tsvector('app_english', body)) stored);
do $$ begin
  execute $q$create table virtual_test (body text,
    search tsvector generated always as (to_tsvector('english', body)))$q$;
  execute 'create index on virtual_test using gin (search)';
  raise exception 'no error';
exception when others then
  if sqlerrm <> 'indexes on virtual generated columns are not supported' then raise; end if;
end $$;
select lab.prove('PostgreSQL 18 generated columns default to virtual, and virtual columns can''t be indexed', true);
SQL

section "Store the tsvector or index the expression"
sql <<'SQL'
create table docs (
  id          bigint primary key,
  account_id  bigint not null references accounts (id),
  kind        text not null,
  title       text not null,
  body        text not null,
  search      tsvector generated always as (
                setweight(to_tsvector('english', title), 'A') ||
                setweight(to_tsvector('english', body),  'B')) stored
);
create index docs_search_idx on docs using gin (search);

create table docs_expr (
  id          bigint primary key,
  account_id  bigint not null references accounts (id),
  kind        text not null,
  title       text not null,
  body        text not null
);
create index docs_expr_search_idx on docs_expr using gin ((
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', body),  'B')));

create table cost (what text primary key, wal numeric, ms numeric);
select pg_current_wal_lsn() as l0, clock_timestamp() as t0 \gset
insert into docs_expr (id, account_id, kind, title, body)
select id, account_id, kind, title, body from corpus order by id;
select pg_current_wal_lsn() as l1, clock_timestamp() as t1 \gset
insert into docs (id, account_id, kind, title, body)
select id, account_id, kind, title, body from corpus order by id;
select pg_current_wal_lsn() as l2, clock_timestamp() as t2 \gset
insert into cost values
  ('expression', pg_wal_lsn_diff(:'l1', :'l0'), extract(epoch from :'t1'::timestamptz - :'t0'::timestamptz) * 1000),
  ('stored',     pg_wal_lsn_diff(:'l2', :'l1'), extract(epoch from :'t2'::timestamptz - :'t1'::timestamptz) * 1000);
vacuum analyze docs, docs_expr;

\echo heap pages, index size, WAL, and load time (ms) for 50,000 articles:
select format('  %-10s heap %s pages, index %s, WAL %s, %s ms', c.what,
              pg_relation_size(t) / 8192, pg_size_pretty(pg_relation_size(i)),
              pg_size_pretty(c.wal), round(c.ms))
from cost c,
     lateral (select case c.what when 'stored' then 'docs'::regclass else 'docs_expr'::regclass end as t,
                     case c.what when 'stored' then 'docs_search_idx'::regclass else 'docs_expr_search_idx'::regclass end as i) r
order by c.what;

select lab.prove('the stored tsvector roughly doubles the heap (3,347 pages without it, 6,766 with)',
  pg_relation_size('docs') / pg_relation_size('docs_expr')::numeric between 1.8 and 2.6);
select lab.prove('the average tsvector is bigger than the text it came from',
  (select avg(pg_column_size(search)) > avg(pg_column_size(body)) from docs));
select lab.prove('the two GIN indexes are about the same size',
  pg_relation_size('docs_search_idx') / pg_relation_size('docs_expr_search_idx')::numeric between 0.9 and 1.15);
select lab.prove('loading the table with the stored column writes more WAL',
  (select s.wal > e.wal * 1.15 from cost s, cost e where s.what = 'stored' and e.what = 'expression'));

\set rank_stored 'select id, title, ts_rank(search, q) as rank from docs, websearch_to_tsquery(''english'', ''failed payment'') q where search @@ q order by rank desc limit 20'
\set rank_expr 'select id, title, ts_rank(setweight(to_tsvector(''english'', title), ''A'') || setweight(to_tsvector(''english'', body), ''B''), q) as rank from docs_expr, websearch_to_tsquery(''english'', ''failed payment'') q where setweight(to_tsvector(''english'', title), ''A'') || setweight(to_tsvector(''english'', body), ''B'') @@ q order by rank desc limit 20'
select lab.ms(:'rank_stored') as stored_ms, lab.ms(:'rank_expr') as expr_ms \gset
\echo top 20 by rank: stored column :stored_ms ms, expression index :expr_ms ms
select lab.prove('both find the same 4,206 matches through their GIN index',
  (select count(*) from docs where search @@ websearch_to_tsquery('english', 'failed payment'))
  = (select count(*) from docs_expr where setweight(to_tsvector('english', title), 'A') ||
       setweight(to_tsvector('english', body), 'B') @@ websearch_to_tsquery('english', 'failed payment'))
  and 'Bitmap Index Scan' = any (lab.nodes(:'rank_expr')));
select lab.prove('ranking through the expression index is more than 5 times slower: it re-parses every match',
  :expr_ms > 5 * :stored_ms);
SQL

section "Queries from users"
sql <<'SQL'
do $$ begin
  perform to_tsquery('english', 'failed payment');
  raise exception 'no error';
exception when syntax_error then
  if sqlerrm not like 'syntax error in tsquery%' then raise; end if;
end $$;
select lab.prove('to_tsquery rejects two plain words with a syntax error', true);
select lab.prove('websearch_to_tsquery turns the same input into fail & payment',
  websearch_to_tsquery('english', 'failed payment')::text = $$'fail' & 'payment'$$);
select lab.prove('quotes, or, and a minus become phrase, OR, and NOT',
  websearch_to_tsquery('english', '"roll back" -flags or rollback')::text
    = $$'roll' <-> 'back' & !'flag' | 'rollback'$$);
select lab.prove('garbage input never raises an error',
  websearch_to_tsquery('english', 'payment & ) ( !')::text = $$'payment'$$);
select lab.prove('phraseto_tsquery counts the dropped stop word as a gap of two',
  phraseto_tsquery('english', 'roll back the deploy')::text = $$'roll' <-> 'back' <2> 'deploy'$$
  and to_tsvector('english', 'roll back a deploy') @@ phraseto_tsquery('english', 'roll back the deploy'));
select count(*) as phrase from docs where search @@ websearch_to_tsquery('english', '"roll back"') \gset
select count(*) as anded from docs where search @@ websearch_to_tsquery('english', 'roll back') \gset
\echo "roll back" as a phrase: :phrase articles; roll and back anywhere: :anded
select lab.prove('the phrase matches far fewer articles than the two words anywhere (about 4,200 against 7,800)',
  :phrase between 3800 and 4600 and :anded between 7400 and 8300);
SQL

section "Ranking"
sql <<'SQL'
create table rank_demo (id int primary key, title text, body text,
  search tsvector generated always as (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', body),  'B')) stored);
insert into rank_demo (id, title, body) values
 (1, 'When a payment fails', 'We retry a failed payment three times.'),
 (2, 'Invoices', 'A failed payment is retried. A failed payment can downgrade the account. Each failed payment sends an email, and the invoice lists every failed payment for the month along with the refunds, the credits, the taxes, the currency, the billing address, the purchase order number, and the plan.'),
 (3, 'Account history', 'The import failed on Tuesday. Support helped, and the account history now shows every payment.');
create view rank_scores as
select id, length(search) as lexemes,
       round(ts_rank(search, q)::numeric, 4) as rank,
       round(ts_rank(search, q, 1)::numeric, 4) as rank_log_len,
       round(ts_rank(search, q, 2)::numeric, 4) as rank_len,
       round(ts_rank_cd(search, q)::numeric, 4) as cd
from rank_demo, websearch_to_tsquery('english', 'failed payment') q;
\echo ranks for "failed payment": id, lexemes, ts_rank, normalized 1, normalized 2, ts_rank_cd
select format('  %s | %s | %s | %s | %s | %s', id, lexemes, rank, rank_log_len, rank_len, cd) from rank_scores order by id;
select lab.prove('ts_rank puts the short article with the title match first',
  (select r1.rank > r2.rank from rank_scores r1, rank_scores r2 where r1.id = 1 and r2.id = 2));
select lab.prove('ts_rank_cd puts the article with four adjacent "failed payment"s first',
  (select r2.cd > r1.cd from rank_scores r1, rank_scores r2 where r1.id = 1 and r2.id = 2));
select lab.prove('dividing by length (normalization 2) cuts the long article to less than a quarter of the short one',
  (select r2.rank_len < r1.rank_len / 4 from rank_scores r1, rank_scores r2 where r1.id = 1 and r2.id = 2));
select lab.prove('scattered words rank last under every function, and cover density punishes them hardest',
  (select r3.rank < 0.1 and r3.cd < 0.05 from rank_scores r3 where r3.id = 3));

\set top20 'select id, ts_rank(search, q) as rank from docs, websearch_to_tsquery(''english'', ''failed payment'') q where search @@ q order by rank desc limit 20'
\set all 'select id, ts_rank(search, q) as rank from docs, websearch_to_tsquery(''english'', ''failed payment'') q where search @@ q'
select lab.buffers(:'top20') as top20_pages, lab.buffers(:'all') as all_pages \gset
\echo pages read for the top 20: :top20_pages; for all 4,206 matches: :all_pages
select lab.prove('limit 20 reads the same pages as returning all 4,206 matches: ranking needs every one',
  :top20_pages >= 0.95 * :all_pages and :top20_pages > 3000);
select lab.prove('deploy is in four articles of ten, and ranking them reads over 90% of the heap',
  (select count(*) from docs where search @@ websearch_to_tsquery('english', 'deploy')) between 18000 and 21000
  and lab.buffers($$ select id, ts_rank(search, q) as rank
     from docs, websearch_to_tsquery('english', 'deploy') q
     where search @@ q order by rank desc limit 20 $$) > 0.9 * pg_relation_size('docs') / 8192);
SQL

section "ts_headline re-parses the document"
sql <<'SQL'
\set search 'select id, title, ts_rank(search, q) as rank from docs, websearch_to_tsquery(''english'', ''failed payment'') q where search @@ q order by rank desc limit 20'
\set page 'select id, title, ts_rank(search, q) as rank, ts_headline(''english'', body, q) as snippet from docs, websearch_to_tsquery(''english'', ''failed payment'') q where search @@ q order by rank desc limit 20'
\set every 'select id, title, ts_rank(search, q) as rank, ts_headline(''english'', body, q) as snippet from docs, websearch_to_tsquery(''english'', ''failed payment'') q where search @@ q'
select lab.ms(:'search') as search_ms, lab.ms(:'page') as page_ms, lab.ms(:'every') as every_ms \gset
\echo search alone :search_ms ms, a page of 20 with snippets :page_ms ms, snippets for all 4,206 matches :every_ms ms
select lab.prove('snippets for every match cost more than 10 times a page of 20 with snippets',
  :every_ms > 10 * :page_ms);
select lab.prove('the planner computes ts_headline after the sort and limit, only for the 20 rows shown',
  (select (p -> 'Plan' ->> 'Node Type') = 'Limit'
      and (p -> 'Plan' -> 'Plans' -> 0 ->> 'Node Type') = 'Result'
      and (p -> 'Plan' -> 'Plans' -> 0 -> 'Plans' -> 0 ->> 'Node Type') = 'Sort'
     from lab.plan(:'page') p));
select lab.prove('ts_headline marks matches with <b> by default',
  ts_headline('english', 'A failed payment is retried three times.',
              websearch_to_tsquery('english', 'failed payment'))
    = 'A <b>failed</b> <b>payment</b> is retried three times.');
SQL

section "A 1,536-dimension vector lives in TOAST"
sql <<'SQL'
create extension vector;
select lab.prove('this image runs pgvector 0.8 or later (iterative index scans)',
  (select string_to_array(extversion, '.')::int[] >= '{0,8,0}' from pg_extension where extname = 'vector'));
select setseed(0.5) \g /dev/null
create table wide (id bigint primary key, embedding vector(1536) not null);
insert into wide
select g, (select array_agg(random_normal(0, 1)::real) from generate_series(1, 1536) where g > 0)::vector
from generate_series(1, 2000) g;
create table wide_plain (id bigint primary key, embedding vector(1536) not null);
alter table wide_plain alter column embedding set storage plain;
insert into wide_plain select * from wide;
create table wide_half (id bigint primary key, embedding halfvec(1536) not null);
insert into wide_half select id, embedding::halfvec(1536) from wide;
create table wide_bit (id bigint primary key, embedding bit(1536) not null);
insert into wide_bit select id, binary_quantize(embedding)::bit(1536) from wide;
vacuum analyze wide, wide_plain, wide_half, wide_bit;

\echo heap pages, TOAST pages per table of 2,000 vectors:
select format('  %-10s heap %s, toast %s', relname, pg_relation_size(oid) / 8192,
              coalesce(pg_relation_size(nullif(reltoastrelid, 0)) / 8192, 0))
from pg_class where relname in ('wide', 'wide_plain', 'wide_half', 'wide_bit') order by relname;

select lab.prove('a vector(1536) is 4 x 1,536 + 8 = 6,152 bytes',
  (select pg_column_size(l2_normalize(embedding)) = 6152 from wide limit 1));
select lab.prove('pgvector declares its types storage external: out of line, never compressed',
  (select bool_and(typstorage = 'e') from pg_type where typname in ('vector', 'halfvec')));
select lab.prove('2,000 vectors: 15 heap pages and one TOAST page per vector',
  pg_relation_size('wide') / 8192 < 20
  and (select pg_relation_size(reltoastrelid) / 8192 between 1990 and 2010 from pg_class where relname = 'wide'));
select reltoastrelid::regclass as toast from pg_class where relname = 'wide' \gset
select lab.prove('each vector is cut into four chunks of at most 1,996 bytes',
  (select count(*) = 4 * 2000 and max(length(chunk_data)) = 1996 from :toast));
select lab.prove('counting rows never touches the vectors: under 20 pages',
  lab.buffers('select count(*) from wide') < 20);
select lab.buffers('select id from wide order by embedding <-> (select embedding from wide where id = 1) limit 10') as toasted,
       lab.buffers('select id from wide_plain order by embedding <-> (select embedding from wide_plain where id = 1) limit 10') as plain \gset
\echo exact search over 2,000 vectors: :toasted buffers out of line, :plain stored plain
select lab.prove('exact search reads about six buffers per toasted vector, five times the plain layout',
  :toasted between 11000 and 13000 and :plain between 1990 and 2100);
select lab.prove('halfvec(1536) is 3,080 bytes, still out of line, two vectors per TOAST page',
  (select pg_column_size(embedding::text::halfvec(1536)) = 3080 from wide_half limit 1)
  and (select pg_relation_size(reltoastrelid) / 8192 between 990 and 1010 from pg_class where relname = 'wide_half'));
select lab.prove('a binary-quantized bit(1536) is 200 bytes and stays in the heap: the table has no TOAST table at all',
  (select pg_column_size(embedding) = 200 from wide_bit limit 1)
  and (select reltoastrelid = 0 from pg_class where relname = 'wide_bit'));
create table too_wide (embedding vector(2100));
alter table too_wide alter column embedding set storage plain;
do $$ begin
  insert into too_wide select array_fill(1.0::real, array[2100])::vector;
  raise exception 'no error';
exception when program_limit_exceeded then
  if sqlerrm not like 'row is too big%' then raise; end if;
end $$;
select lab.prove('storage plain stops working past about 2,000 dimensions: a 2,100-dimension row is too big', true);
SQL

section "The corpus has a known shape"
sql <<'SQL'
select setseed(0.77) \g /dev/null
create table doc_embeddings (
  doc_id      bigint primary key references docs (id),
  account_id  bigint not null,
  kind        text not null,
  embedding   vector(384) not null
);
insert into doc_embeddings
select c.id, c.account_id, c.kind,
       l2_normalize((select array_agg(x + random_normal(0, 1.0)::real order by i)
                       from unnest(cl.v) with ordinality u(x, i) where c.id > 0)::vector)
from corpus c join clusters cl on cl.id = c.cluster
order by c.id;
create index doc_embeddings_account_idx on doc_embeddings (account_id);
vacuum analyze doc_embeddings;

-- 100 query vectors drawn the same way, and their exact top 10.
create table queries as
select q as id, c.id as cluster, c.topic,
       l2_normalize((select array_agg(x + random_normal(0, 1.0)::real order by i)
                       from unnest(c.v) with ordinality u(x, i) where q > 0)::vector(384)) as embedding
from (select q, 1 + floor(random() * 1000)::int as cl from generate_series(1, 100) q) x
join clusters c on c.id = x.cl
order by q;
create table truth as
select q.id as query_id, n.doc_id
from queries q,
     lateral (select doc_id from doc_embeddings e
              order by e.embedding <=> q.embedding limit 10) n;

-- recall(knn): the fraction of the exact top 10 that a query finds, over
-- the 100 queries, and the mean time per query. knn takes the query vector
-- as $1.
create function recall(knn text, out recall numeric, out ms numeric)
language plpgsql as $$
declare q record; t0 timestamptz; total interval := '0'; hits int := 0; n int;
begin
  for q in select id, embedding from queries order by id loop
    t0 := clock_timestamp();
    execute format('select count(*) from (%s) a where a.doc_id in
                      (select doc_id from truth where query_id = %s)', knn, q.id)
      into n using q.embedding;
    total := total + (clock_timestamp() - t0);
    hits := hits + n;
  end loop;
  recall := round(hits / 1000.0, 3);
  ms := round(extract(epoch from total) * 1000 / 100, 2);
end $$;

select lab.prove('50,000 vector(384) rows fill 10,000 heap pages; nothing is toasted at 1,544 bytes',
  pg_relation_size('doc_embeddings') / 8192 between 9900 and 10100
  and (select coalesce(pg_relation_size(nullif(reltoastrelid, 0)), 0) = 0 from pg_class where relname = 'doc_embeddings'));
select lab.prove('almost every true neighbor (at least 95%) comes from the query''s own cluster, all from its topic',
  (select avg((c.cluster = q.cluster)::int) >= 0.95 and bool_and(c.topic = q.topic)
     from truth t join corpus c on c.id = t.doc_id join queries q on q.id = t.query_id));
select lab.prove('exact search is a sequential scan over all 10,000 pages',
  lab.buffers($$ select doc_id from doc_embeddings
                 order by embedding <=> (select embedding from queries where id = 1) limit 10 $$) >= 10000);
SQL

section "HNSW"
# The default maintenance_work_mem (64 MB) can't hold this graph.
build=$(sql -c "set client_min_messages = notice" -c "show maintenance_work_mem" \
  -c "create index doc_embeddings_hnsw on doc_embeddings using hnsw (embedding vector_cosine_ops)" 2>&1)
prove "maintenance_work_mem defaults to 64MB" has "64MB" "$build"
prove "with 64 MB the build warns: hnsw graph no longer fits into maintenance_work_mem" \
  has "hnsw graph no longer fits into maintenance_work_mem" "$build"
sql -c "drop index doc_embeddings_hnsw"
t0=$SECONDS
build=$(sql -c "set client_min_messages = notice" -c "set maintenance_work_mem = '256MB'" \
  -c "create index doc_embeddings_hnsw on doc_embeddings using hnsw (embedding vector_cosine_ops)" 2>&1)
echo "  (the 256 MB build took about $((SECONDS - t0)) s here)"
prove "with 256 MB the graph fits and there is no warning" \
  bash -c '! grep -qF "no longer fits" <<<"$1"' _ "$build"
sql <<'SQL'
load 'vector';  -- so its settings (hnsw.*, ivfflat.*) exist in this session
select lab.prove('the HNSW index (98 MB here) is bigger than the table it indexes',
  pg_relation_size('doc_embeddings_hnsw') > pg_relation_size('doc_embeddings'));
select lab.prove('hnsw.ef_search defaults to 40', current_setting('hnsw.ef_search') = '40');
\set knn 'select doc_id from doc_embeddings order by embedding <=> $1 limit 10'
select * from recall(:'knn') \g /dev/null
create table sweep (ef int primary key, recall numeric, ms numeric, buffers bigint);
do $$
declare ef int; r record;
begin
  foreach ef in array array[10, 20, 40, 100, 200, 400] loop
    perform set_config('hnsw.ef_search', ef::text, false);
    select * into r from recall('select doc_id from doc_embeddings order by embedding <=> $1 limit 10');
    insert into sweep values (ef, r.recall, r.ms,
      lab.buffers('select doc_id from doc_embeddings order by embedding <=>
                   (select embedding from queries where id = 1) limit 10'));
  end loop;
end $$;
reset hnsw.ef_search;
\echo ef_search | recall@10 | ms per query | buffers for one query
select format('  %s | %s | %s | %s', ef, recall, ms, buffers) from sweep order by ef;
select lab.prove('at the default ef_search of 40, recall@10 is 0.9 or better',
  (select recall >= 0.9 from sweep where ef = 40));
select lab.prove('raising ef_search raises recall, to 0.98 or better at 400',
  (select max(recall) filter (where ef >= 200) > min(recall) filter (where ef = 10)
      and max(recall) filter (where ef = 400) >= 0.98 from sweep));
select lab.prove('ef_search 400 reads more than 4 times the pages of ef_search 40',
  (select b.buffers > 4 * a.buffers from sweep a, sweep b where a.ef = 40 and b.ef = 400));
select lab.prove('at ef_search 40 the index reads under a tenth of the pages exact search does',
  (select buffers < 1000 from sweep where ef = 40));
SQL

section "IVFFlat"
sql <<'SQL'
load 'vector';
drop index doc_embeddings_hnsw;
set maintenance_work_mem = '256MB';
create index doc_embeddings_ivf on doc_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 50);
select lab.prove('ivfflat.probes defaults to 1', current_setting('ivfflat.probes') = '1');
\set knn 'select doc_id from doc_embeddings order by embedding <=> $1 limit 10'
create table probes (probes int primary key, recall numeric, ms numeric);
do $$
declare p int; r record;
begin
  foreach p in array array[1, 3, 5, 10] loop
    perform set_config('ivfflat.probes', p::text, false);
    select * into r from recall('select doc_id from doc_embeddings order by embedding <=> $1 limit 10');
    insert into probes values (p, r.recall, r.ms);
  end loop;
end $$;
reset ivfflat.probes;
\echo probes | recall@10 | ms per query
select format('  %s | %s | %s', probes, recall, ms) from probes order by probes;
select lab.prove('with 50 lists and the default single probe, recall@10 is under 0.8',
  (select recall < 0.8 from probes where probes = 1));
select lab.prove('ten probes (a fifth of the lists) bring recall above 0.99',
  (select recall >= 0.99 from probes where probes = 10));
drop index doc_embeddings_ivf;
SQL

section "Smaller vectors: halfvec and binary quantization"
sql <<'SQL'
load 'vector';
set maintenance_work_mem = '256MB';
create index doc_embeddings_hnsw on doc_embeddings using hnsw (embedding vector_cosine_ops);
create index doc_embeddings_half on doc_embeddings using hnsw ((embedding::halfvec(384)) halfvec_cosine_ops);
create index doc_embeddings_bit on doc_embeddings using hnsw ((binary_quantize(embedding)::bit(384)) bit_hamming_ops);
\echo index sizes:
select format('  %-22s %s', relname, pg_size_pretty(pg_relation_size(oid)))
from pg_class where relname in ('doc_embeddings_hnsw', 'doc_embeddings_half', 'doc_embeddings_bit')
order by pg_relation_size(oid) desc;
select lab.prove('the halfvec index is under two thirds the size, the bit index under a fifth',
  pg_relation_size('doc_embeddings_half') < 0.67 * pg_relation_size('doc_embeddings_hnsw')
  and pg_relation_size('doc_embeddings_bit') < 0.2 * pg_relation_size('doc_embeddings_hnsw'));
select r.recall as half from recall('select doc_id from doc_embeddings order by embedding::halfvec(384) <=> $1::halfvec(384) limit 10') r \gset
select r.recall as bits from recall('select doc_id from doc_embeddings order by binary_quantize(embedding)::bit(384) <~> binary_quantize($1) limit 10') r \gset
set hnsw.ef_search = 100;
select r.recall as rerank100 from recall('select doc_id from (select doc_id, embedding from doc_embeddings order by binary_quantize(embedding)::bit(384) <~> binary_quantize($1) limit 100) c order by embedding <=> $1 limit 10') r \gset
set hnsw.ef_search = 400;
select r.recall as rerank400 from recall('select doc_id from (select doc_id, embedding from doc_embeddings order by binary_quantize(embedding)::bit(384) <~> binary_quantize($1) limit 400) c order by embedding <=> $1 limit 10') r \gset
reset hnsw.ef_search;
\echo recall@10: halfvec :half, bit alone :bits, bit then re-rank 100 :rerank100, re-rank 400 :rerank400
select lab.prove('halfvec keeps recall above 0.95', :half >= 0.95);
select lab.prove('on this synthetic data, bits alone find under half the true neighbors',
  :bits < 0.5);
select lab.prove('re-ranking 400 bit candidates by the full vectors lifts recall above 0.85',
  :rerank400 > 0.85 and :rerank400 > :rerank100 and :rerank100 > :bits);
drop index doc_embeddings_half, doc_embeddings_bit;
SQL

section "Filters and approximate indexes"
sql <<'SQL'
load 'vector';
select lab.prove('kind = faq matches about 10% of articles',
  (select count(*) between 4500 and 5500 from doc_embeddings where kind = 'faq'));
create table filtered (mode text primary key, avg_rows numeric, min_rows int);
insert into filtered
select 'off', avg(n), min(n) from (
  select (select count(*) from (select doc_id from doc_embeddings e where kind = 'faq'
           order by e.embedding <=> q.embedding limit 10) a) as n from queries q) s;
set hnsw.iterative_scan = relaxed_order;
insert into filtered
select 'relaxed_order', avg(n), min(n) from (
  select (select count(*) from (select doc_id from doc_embeddings e where kind = 'faq'
           order by e.embedding <=> q.embedding limit 10) a) as n from queries q) s;
\set faq 'select doc_id from doc_embeddings where kind = ''faq'' order by embedding <=> (select embedding from queries where id = 1) limit 10'
select lab.buffers(:'faq') as iterative_pages \gset
reset hnsw.iterative_scan;
select lab.buffers(:'faq') as plain_pages \gset
\echo rows returned for limit 10 with kind = faq (average over 100 queries):
select format('  iterative_scan %-13s avg %s, min %s', mode, round(avg_rows, 2), min_rows) from filtered order by mode;
\echo buffers for one query: :plain_pages without iterative scan, :iterative_pages with
select lab.prove('with a 10% filter and ef_search 40, limit 10 returns about 4 rows on average',
  (select avg_rows between 2.5 and 5.5 and min_rows = 0 from filtered where mode = 'off'));
select lab.prove('hnsw.iterative_scan = relaxed_order returns all 10 rows for every query',
  (select avg_rows = 10 and min_rows = 10 from filtered where mode = 'relaxed_order'));
select lab.prove('the iterative scan reads more pages to get them',
  :iterative_pages > :plain_pages);
select lab.prove('a tenant filter (46 rows) uses the B-tree and sorts exactly, ignoring HNSW',
  (select count(*) = 46 from doc_embeddings where account_id = 42)
  and lab.plan($$ select doc_id from doc_embeddings where account_id = 42
     order by embedding <=> (select embedding from queries where id = 1) limit 10 $$)::text
     like '%doc_embeddings_account_idx%'
  and lab.plan($$ select doc_id from doc_embeddings where account_id = 42
     order by embedding <=> (select embedding from queries where id = 1) limit 10 $$)::text
     not like '%doc_embeddings_hnsw%');
SQL

section "Hybrid search"
sql <<'SQL'
-- No embedding model runs in the lab: the billing topic's center stands in
-- for the embedding of a billing question.
create table query_embeddings (name text primary key, embedding vector(384));
insert into query_embeddings
select 'billing', l2_normalize(v::vector(384)) from topic_centers where topic = 3;

create function hybrid_search(query text, query_embedding vector(384), k int default 10)
returns table (id bigint, score numeric, fts_rank bigint, vec_rank bigint)
language sql stable as $$
  with fts as (
    select d.id, row_number() over (order by ts_rank_cd(d.search, q) desc, d.id) as r
    from docs d, websearch_to_tsquery('english', query) q
    where d.search @@ q
    order by r
    limit 50
  ), vec as (
    select e.doc_id as id, row_number() over (order by e.embedding <=> query_embedding, e.doc_id) as r
    from (select doc_id, embedding from doc_embeddings
          order by embedding <=> query_embedding limit 50) e
  )
  select id,
         round(coalesce(1.0 / (60 + fts.r), 0) + coalesce(1.0 / (60 + vec.r), 0), 4) as score,
         fts.r, vec.r
  from fts full join vec using (id)
  order by score desc, id
  limit k
$$;

\echo hybrid_search('failed payment', billing):
select format('  %s | %s | %s | %s', id, score, coalesce(fts_rank::text, '-'), coalesce(vec_rank::text, '-'))
from hybrid_search('failed payment', (select embedding from query_embeddings where name = 'billing'));
select lab.prove('fusion returns 10 rows from both lists, and any article both lists found ranks above every article only one found',
  (select count(*) = 10 and count(fts_rank) > 0 and count(vec_rank) > 0
     from hybrid_search('failed payment', (select embedding from query_embeddings where name = 'billing')))
  and (select coalesce(min(score) filter (where fts_rank is not null and vec_rank is not null), 1)
              > coalesce(max(score) filter (where fts_rank is null or vec_rank is null), 0)
         from hybrid_search('failed payment', (select embedding from query_embeddings where name = 'billing'), 100)));
select lab.prove('card declined matches no text at all; the vector side still answers',
  (select count(*) = 0 from docs where search @@ websearch_to_tsquery('english', 'card declined'))
  and (select count(*) = 10 and bool_and(vec_rank is not null)
         from hybrid_search('card declined', (select embedding from query_embeddings where name = 'billing'))));
select lab.prove('ordering by distance to a vector from a join can''t use the HNSW index',
  'Seq Scan' = any (lab.nodes($$ select e.doc_id from doc_embeddings e, query_embeddings q
                                 where q.name = 'billing'
                                 order by e.embedding <=> q.embedding limit 10 $$)));
select lab.prove('as a parameter or scalar subquery it can',
  'Index Scan' = any (lab.nodes($$ select doc_id from doc_embeddings
     order by embedding <=> (select embedding from query_embeddings where name = 'billing') limit 10 $$)));
SQL

echo
echo "== every claim proved ($((SECONDS - started)) s)"
