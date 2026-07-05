-- RUN THIS FILE'S STATEMENT ALONE -- paste just this one CREATE INDEX into the
-- SQL editor by itself and run it as its own execution. CONCURRENTLY cannot run
-- inside a transaction block, and both the Supabase SQL editor "Run" button and
-- migration-push tooling wrap multi-statement scripts in one. If it still errors
-- with 25001 even alone, your tool is auto-wrapping single statements too --
-- in that case drop CONCURRENTLY (see commented fallback below); the plain
-- version briefly locks the events table while building (expect a few seconds
-- given ~250k rows), so run it during low traffic if you go that route.
--
-- Purpose: lets get_personalized_feed_v5's geo+date candidate filters run as an
-- index-only scan (no heap access), which is what turns the ~5.9s cold-cache
-- query into well under a second. See 20260703000002_optimize_feed_v5_functions.sql
-- for the function changes that go with this index.
--
-- INCLUDE carries artist_id because 20260703000004 makes event_weights read
-- e.artist_id for the listened-artist boost -- without it that CTE would fall
-- back to heap fetches and lose the index-only speedup.
-- If you already created this index from an earlier version of this file
-- (INCLUDE (id, genres) without artist_id), drop it first with a standalone
--   DROP INDEX CONCURRENTLY IF EXISTS idx_events_geo_date_covering;
-- then re-run the CREATE below (IF NOT EXISTS would otherwise keep the old one).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_geo_date_covering
  ON public.events (latitude, longitude, event_date)
  INCLUDE (id, genres, artist_id)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Fallback if CONCURRENTLY truly cannot be made to run standalone in your tool
-- (locks the table briefly during build -- run during low traffic):
-- CREATE INDEX IF NOT EXISTS idx_events_geo_date_covering
--   ON public.events (latitude, longitude, event_date)
--   INCLUDE (id, genres, artist_id)
--   WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
