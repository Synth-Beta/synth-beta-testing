-- Verify which fixes from 03_proposed_fix.sql are actually live. READ-ONLY.
-- Safe to paste as one block.

  
-- Fix 2 — volatility. Expect IMMUTABLE and cost 10.
-- If this still says VOLATILE / 100, the ALTER did not run. The body is confirmed
-- pure trigonometry on its four arguments, so applying it is safe:
--   ALTER FUNCTION public.calculate_distance(double precision, double precision, double precision, double precision)
--     IMMUTABLE PARALLEL SAFE COST 10;
SELECT
  p.oid::regprocedure AS signature,
  CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility,
  CASE p.proparallel WHEN 's' THEN 'SAFE' WHEN 'r' THEN 'RESTRICTED' ELSE 'UNSAFE' END AS parallel,
  p.procost
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'calculate_distance';

-- Is the new index actually being chosen? idx_scan should climb as the calendar is
-- used; a flat 0 means the planner is still ignoring it.
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname = 'events'
  AND indexrelname IN ('idx_events_missing_coords', 'idx_events_geo_date_covering', 'idx_events_date_location')
ORDER BY idx_scan DESC;

-- Still needed for the separate "every event appears twice" bug in the view.
SELECT pg_get_viewdef('public.events_with_artist_venue'::regclass, true) AS view_definition;
