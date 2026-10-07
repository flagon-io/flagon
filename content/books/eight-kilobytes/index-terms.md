---
# The print edition's index (src/lib/book-index.ts). Every glossary headword is
# indexed automatically; this file adds terms the glossary doesn't define,
# tells headwords what counts as a mention, and lists pure cross-references.
# Matching is whole-word, case-insensitive, and allows a plural.

# What counts as a mention of a glossary headword (default: the headword).
match:
  "Buffers (in a plan)": ["Buffers:", "Buffers line"]
  "Node": ["plan node"]
  "xmin and xmax": ["xmin", "xmax"]
  "xmin horizon": ["xmin horizon", "backend_xmin"]
  "RPO and RTO": ["RPO", "RTO"]
  "N+1 queries": ["N+1"]
  "Recall@k": ["recall@10", "recall@k"]
  "Lock modes": ["lock mode", "ACCESS EXCLUSIVE", "AccessExclusive"]
  "Pooling modes": ["transaction pooling", "session pooling", "pool mode"]
  "Transaction ID": ["transaction ID", "XID"]
  "Dead tuple": ["dead tuple", "dead row", "dead version"]
  "HOT update": ["HOT update", "HOT-safe", "heap-only tuple"]
  "HOT chain": ["HOT chain"]
  "WAL": ["WAL", "write-ahead log"]
  "Data checksums": ["checksum", "data_checksums"]
  "Full-page write": ["full-page write", "full-page image", "FPI"]
  "MCV list": ["MCV", "most common values"]
  "Volatility": ["volatility", "IMMUTABLE"]
  "Column store": ["column store", "columnar"]
  "Row-level security": ["row-level security", "RLS"]
  "Parallel query": ["parallel query", "parallel worker", "Gather"]
  "Isolation level": ["isolation level", "repeatable read", "read committed"]
  "Index-only scan": ["index-only scan", "Heap Fetches"]
  "Sequential scan": ["sequential scan", "Seq Scan"]
  "Upsert": ["upsert", "on conflict"]
  "Keyset pagination": ["keyset", "OFFSET"]
  "Generic plan": ["generic plan", "custom plan", "plan_cache_mode"]
  "Snapshot": ["snapshot"]
  "Page": ["8 KB page", "page header", "pages read"]
  "Buffer": ["shared buffer", "buffer pin"]
  "Cost": ["cost units", "cost="]
  "Tuple": ["tuple"]
  "Redirect": ["redirect", "LP_REDIRECT"]
  "Fork": ["fork", "_fsm", "_vm"]
  "Extension": ["create extension", "shared_preload_libraries"]

# Glossary headwords the index leaves out (too general to locate usefully).
skip: []

# Terms the glossary doesn't define.
terms:
  - { term: pageinspect, code: true }
  - { term: pg_buffercache, code: true }
  - { term: pg_walinspect, code: true }
  - { term: pg_stat_activity, code: true }
  - { term: pg_stat_io, code: true }
  - { term: pg_locks, code: true }
  - { term: pg_class, code: true }
  - { term: pg_dump, code: true }
  - { term: pg_basebackup, code: true }
  - { term: pg_upgrade, code: true }
  - { term: pg_repack, code: true }
  - { term: pg_cron, code: true }
  - { term: pg_partman, code: true }
  - { term: pg_duckdb, code: true }
  - { term: pg_trgm, code: true }
  - { term: auto_explain, code: true }
  - { term: effective_cache_size, code: true }
  - { term: random_page_cost, code: true }
  - { term: max_wal_size, code: true }
  - { term: max_connections, code: true }
  - { term: hash_mem_multiplier, code: true }
  - { term: maintenance_work_mem, code: true }
  - { term: default_statistics_target, code: true }
  - { term: idle_in_transaction_session_timeout, code: true }
  - { term: transaction_timeout, code: true }
  - { term: hot_standby_feedback, code: true }
  - { term: max_slot_wal_keep_size, code: true }
  - { term: wal_level, code: true }
  - { term: wal_compression, code: true }
  - { term: checkpoint_timeout, code: true }
  - { term: io_method, code: true, match: [io_method, asynchronous I/O] }
  - { term: autovacuum_vacuum_scale_factor, code: true }
  - { term: jsonb, code: true }
  - { term: MERGE }
  - { term: LATERAL }
  - { term: DISTINCT ON }
  - { term: NOT EXISTS, match: [not exists, not in] }
  - { term: unnest, code: true }
  - { term: Window function, match: [window function, over (] }
  - { term: Generated column, match: [generated column, generated always as] }
  - { term: Read replica, match: [read replica, replica lag, replication lag] }
  - { term: pgvector }
  - { term: PostGIS }
  - { term: TimescaleDB }
  - { term: pgBackRest }
  - { term: Patroni }
  - { term: ClickHouse }
  - { term: DuckDB }
  - { term: MySQL, match: [MySQL, InnoDB] }
  - { term: Aurora }
  - { term: Neon }
  - { term: Amazon RDS, match: [RDS] }
  - { term: Supabase }
  - { term: Cloud SQL }
  - { term: AlloyDB }
  - { term: Docker }
  - { term: Little's law }
  - { term: Fsync latency, match: [fsync latency, commit latency] }
  - { term: Write amplification, match: [write amplification] }

# Pure cross-references.
see:
  "Write-ahead log": WAL
  "RLS": Row-level security
  "ON CONFLICT": Upsert
  "Multiversion concurrency control": MVCC
  "Heap-only tuple": HOT update
  "Point-in-time recovery": PITR
  "Log sequence number": LSN
  "XID": Transaction ID
  "Connection pooler": PgBouncer
  "Seq Scan": Sequential scan
---
