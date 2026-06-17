-- =============================================================================
-- Reduce Disk I/O: additive read-path indexes (safe — does NOT drop anything)
-- =============================================================================
--
-- What this fixes
--   Full-table scans on artists / venues / events by created_at (+ ORDER BY).
--
-- What this does NOT do
--   - Does not drop indexes or change data / app logic
--
-- Before you run
--   1. Disk IO budget recovered (Reports → Database).
--   2. No JamBase sync running.
--   3. Off-peak if possible (index builds use I/O).
--
-- =============================================================================
-- HOW TO RUN IN SUPABASE SQL EDITOR (use SECTION A below)
-- =============================================================================
-- The SQL Editor runs inside a transaction. CREATE INDEX CONCURRENTLY is NOT
-- allowed there (error 25001). Use SECTION A — regular CREATE INDEX IF NOT EXISTS.
--
-- Run SECTION A one CREATE INDEX at a time (highlight a single statement → Run).
-- Each may take several minutes. App stays up; that table may be slow to write
-- during the build.
--
-- Optional SECTION B (CONCURRENTLY): only if you connect with psql / Supabase CLI
-- outside a transaction, OR SQL Editor has "Use transaction" turned OFF.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Optional: confirm indexes are missing (0 rows = safe to create)
-- -----------------------------------------------------------------------------
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_artists_created_at_id',
    'idx_venues_created_at_id',
    'idx_events_created_at_id',
    'idx_venues_sync_coord_lookup',
    'idx_venues_sync_name_city_state'
  )
ORDER BY tablename, indexname;


-- =============================================================================
-- SECTION A — SQL Editor safe (no CONCURRENTLY) — run ONE statement at a time
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_artists_created_at_id
  ON public.artists (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_venues_created_at_id
  ON public.venues (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_events_created_at_id
  ON public.events (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_venues_sync_coord_lookup
  ON public.venues (name, latitude, longitude)
  WHERE identifier IS NULL
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_sync_name_city_state
  ON public.venues (name, city, state)
  WHERE identifier IS NULL;


-- -----------------------------------------------------------------------------
-- After all five indexes above finish — run ANALYZE + verify (can run together)
-- -----------------------------------------------------------------------------
ANALYZE public.artists;
ANALYZE public.venues;
ANALYZE public.events;

SELECT
  c.relname AS table_name,
  i.relname AS index_name,
  pg_size_pretty(pg_relation_size(i.oid)) AS index_size
FROM pg_class c
JOIN pg_index ix ON ix.indrelid = c.oid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('artists', 'venues', 'events')
  AND i.relname IN (
    'idx_artists_created_at_id',
    'idx_venues_created_at_id',
    'idx_events_created_at_id',
    'idx_venues_sync_coord_lookup',
    'idx_venues_sync_name_city_state'
  )
ORDER BY c.relname, i.relname;


-- =============================================================================
-- SECTION B — psql / CLI only (CONCURRENTLY) — NOT for default SQL Editor
-- =============================================================================
-- Uncomment and run via: psql "$DATABASE_URL" -f scripts/add-disk-io-read-indexes-concurrent.sql
-- Or run each line separately with transaction mode disabled in SQL Editor.
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artists_created_at_id
--   ON public.artists (created_at DESC, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_created_at_id
--   ON public.venues (created_at DESC, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_created_at_id
--   ON public.events (created_at DESC, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_sync_coord_lookup
--   ON public.venues (name, latitude, longitude)
--   WHERE identifier IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venues_sync_name_city_state
--   ON public.venues (name, city, state)
--   WHERE identifier IS NULL;
