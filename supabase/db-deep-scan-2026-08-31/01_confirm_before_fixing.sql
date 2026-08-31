-- Run these FIRST. They decide whether finding #1 and #6 are real.
-- Read-only. Nothing here writes.

-- ============================================================
-- A. WHICH TABLES ARE IN THE REALTIME PUBLICATION
--    The WAL-decode query is 26.1% of total DB time (4598 sec, 582k calls).
--    That cost is per-changed-row on every table in this publication.
--    If sync targets (events, artists, venues, external_entity_ids,
--    events_genres, artists_genres) are in here, you are paying realtime
--    RLS-decode on ~500k sync writes that no client subscribes to.
-- ============================================================
select
  pt.tablename,
  s.n_tup_ins + s.n_tup_upd + s.n_tup_del as writes_since_stats_reset,
  s.n_live_tup
from pg_publication_tables pt
left join pg_stat_user_tables s on s.relname = pt.tablename
where pt.pubname = 'supabase_realtime'
order by writes_since_stats_reset desc nulls last;

-- ============================================================
-- B. WHAT THE interactions TABLE IS ACTUALLY FILTERED BY
--    5,896 seq scans x ~20,559 rows = ~121M rows read. Missing index.
--    Need the real predicate before creating one.
-- ============================================================
select left(query, 400) as query, calls, round(mean_exec_time::numeric,1) as mean_ms
from pg_stat_statements
where query ilike '%interactions%' and query not ilike '%pg_stat%'
order by total_exec_time desc
limit 15;

-- B2. Columns available on interactions
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='interactions'
order by ordinal_position;

-- ============================================================
-- C. Confirm the two external_entity_ids unique constraints really
--    are the same three columns in different order (finding #3)
-- ============================================================
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid='public.external_entity_ids'::regclass and contype='u'
order by conname;

-- ============================================================
-- D. Triggers on events -- the INSERT is 2,114 ms/call (21.8% of DB time).
--    Index writes explain part of it; triggers explain the rest.
-- ============================================================
select tgname, pg_get_triggerdef(oid) as def
from pg_trigger
where tgrelid='public.events'::regclass and not tgisinternal
order by tgname;
