-- Read-only DB deep scan. Nothing here writes. Run section by section in the
-- Supabase SQL editor (multi-statement pastes wrap in a txn and orphan on
-- "Failed to fetch" -- see reference_supabase_editor_do_block_into).
--
-- Run the Supabase Advisors FIRST (Dashboard > Advisors > Security + Performance).
-- They already cover: unindexed FKs, unused indexes, RLS disabled/no-policy,
-- function search_path, multiple permissive policies, auth_rls_initplan,
-- SECURITY DEFINER views, exposed auth.users. Do not re-implement those here.
-- This file only covers what Advisors does NOT report.

-- ============================================================
-- 1. Slowest queries by total time (needs pg_stat_statements)
-- ============================================================
select
  round(total_exec_time::numeric / 1000, 1) as total_sec,
  calls,
  round(mean_exec_time::numeric, 1)         as mean_ms,
  round((100 * total_exec_time / nullif(sum(total_exec_time) over (), 0))::numeric, 1) as pct_total,
  left(query, 200) as query
from pg_stat_statements
where query not ilike '%pg_stat_statements%'
order by total_exec_time desc
limit 30;

-- 1b. Worst per-call latency (timeout candidates, e.g. get_calendar_events)
select round(mean_exec_time::numeric,1) as mean_ms, calls, left(query,200) as query
from pg_stat_statements
where calls > 5
order by mean_exec_time desc
limit 25;

-- ============================================================
-- 2. Tables scanned sequentially instead of by index
--    High seq_scan + high rows-per-scan on a big table = missing index
-- ============================================================
select
  relname,
  n_live_tup,
  seq_scan,
  idx_scan,
  case when seq_scan > 0 then seq_tup_read / seq_scan end as avg_rows_per_seq_scan,
  n_dead_tup,
  last_autovacuum
from pg_stat_user_tables
where n_live_tup > 1000
order by seq_tup_read desc
limit 30;

-- ============================================================
-- 3. Index bloat / write cost: indexes that cost writes and earn nothing
--    (Advisors flags "unused", this adds size so you can rank the drops)
-- ============================================================
select
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as size
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where not i.indisunique and not i.indisprimary
order by pg_relation_size(s.indexrelid) desc
limit 40;

-- 3b. Exact-duplicate indexes (same table, same column list)
--     2026-07-17 scan found 7 of these; confirm they are still there.
select
  indrelid::regclass as table_name,
  array_agg(indexrelid::regclass) as duplicate_indexes,
  count(*)
from pg_index
group by indrelid, indkey, indclass, indexprs, indpred
having count(*) > 1;

-- ============================================================
-- 4. Table bloat + dead tuples (autovacuum not keeping up)
-- ============================================================
select
  relname,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as dead_pct,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
where n_dead_tup > 1000
order by n_dead_tup desc
limit 30;

-- ============================================================
-- 5. Normalization smells
-- ============================================================
-- 5a. Columns that look like denormalized copies of another table
--     (artist_name, venue_name, ... living on events/reviews)
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (column_name like '%_name' or column_name like '%_url' or column_name like '%_image%')
order by table_name, column_name;

-- 5b. Array / jsonb columns doing a join table's job
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (data_type in ('ARRAY','jsonb','json'))
order by table_name;

-- 5c. Tables with zero rows or near-zero -- dead/redundant table candidates
select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_stat_user_tables
order by n_live_tup asc
limit 40;

-- 5d. Foreign keys with no supporting index (Advisors flags these, but this
--     shows the exact CREATE INDEX you'd need)
select
  c.conrelid::regclass as table_name,
  a.attname            as column_name,
  format('create index concurrently on %s (%I);', c.conrelid::regclass, a.attname) as suggested_ddl
from pg_constraint c
join lateral unnest(c.conkey) k(attnum) on true
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
where c.contype = 'f'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and i.indkey[0] = a.attnum
  )
order by 1, 2;

-- ============================================================
-- 6. Constraint contradictions
--    2026-07-17 found reviews has TWO overlapping UNIQUE(user_id,event_id).
--    This finds every table with overlapping unique constraints.
-- ============================================================
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype in ('u','p')
  and connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;

-- ============================================================
-- 7. RLS surface: tables where RLS is on but policy count is silly
--    (Advisors flags "multiple permissive"; this ranks by count so you know
--     which table to consolidate first)
-- ============================================================
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by policy_count desc, c.relname;
