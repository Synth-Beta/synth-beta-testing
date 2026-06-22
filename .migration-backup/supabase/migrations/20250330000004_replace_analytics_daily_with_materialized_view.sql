-- ============================================
-- REPLACE analytics_daily TABLE WITH MATERIALIZED VIEW
-- ============================================
-- This migration replaces the analytics_daily table with a materialized view
-- that aggregates data from the interactions table (the source of truth).
--
-- PRINCIPLE: interactions is the fact table. analytics_daily is a derived view.
-- This enforces 3NF by eliminating duplication of truth.
--
-- PREREQUISITES:
-- - interactions table must exist
-- - analytics_daily table should have been populated (if it exists)
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: DROP EXISTING FUNCTION (if it exists)
-- ============================================
-- The aggregate_daily_analytics function is no longer needed since we're using
-- a materialized view that can be refreshed instead
DROP FUNCTION IF EXISTS public.aggregate_daily_analytics(DATE) CASCADE;

-- ============================================
-- STEP 2: CREATE MATERIALIZED VIEW
-- ============================================
-- Create materialized view that aggregates from interactions (the fact table)
-- This view aggregates metrics by entity_type, entity_id/entity_uuid, and date
--
-- Note: This aggregates interactions ABOUT entities (e.g., views of an event, clicks on an artist)
-- For user analytics, it aggregates interactions BY users (e.g., user X viewed Y events)

DROP MATERIALIZED VIEW IF EXISTS public.analytics_daily_mv CASCADE;

CREATE MATERIALIZED VIEW public.analytics_daily_mv AS
-- User analytics: aggregate interactions by user_id
SELECT
  gen_random_uuid() AS id,
  'user'::TEXT AS entity_type,
  i.user_id::TEXT AS entity_id,
  i.user_id AS entity_uuid,
  DATE(i.occurred_at) AS date,
  jsonb_build_object(
    'events_viewed', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'view'),
    'events_clicked', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'click'),
    'events_interested', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'interest'),
    'ticket_clicks', COUNT(*) FILTER (WHERE i.entity_type = 'ticket_link' AND i.event_type = 'click'),
    'reviews_written', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'create'),
    'reviews_viewed', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'view'),
    'reviews_liked', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'like'),
    'searches_performed', COUNT(*) FILTER (WHERE i.event_type = 'search'),
    'sessions_count', COUNT(DISTINCT i.session_id)
  ) AS metrics,
  MIN(i.occurred_at) AS created_at,
  MAX(i.occurred_at) AS updated_at
FROM public.interactions i
WHERE i.occurred_at IS NOT NULL
GROUP BY i.user_id, DATE(i.occurred_at)

UNION ALL

-- Event analytics: aggregate interactions about events
SELECT
  gen_random_uuid() AS id,
  'event'::TEXT AS entity_type,
  COALESCE(i.entity_uuid::TEXT, i.entity_id) AS entity_id,
  i.entity_uuid,
  DATE(i.occurred_at) AS date,
  jsonb_build_object(
    'impressions', COUNT(*) FILTER (WHERE i.event_type = 'view'),
    'clicks', COUNT(*) FILTER (WHERE i.event_type = 'click'),
    'interested_count', COUNT(*) FILTER (WHERE i.event_type = 'interest'),
    'unique_viewers', COUNT(DISTINCT i.user_id) FILTER (WHERE i.event_type = 'view')
  ) AS metrics,
  MIN(i.occurred_at) AS created_at,
  MAX(i.occurred_at) AS updated_at
FROM public.interactions i
WHERE i.entity_type = 'event'
  AND i.occurred_at IS NOT NULL
GROUP BY COALESCE(i.entity_uuid::TEXT, i.entity_id), i.entity_uuid, DATE(i.occurred_at)

UNION ALL

-- Artist analytics: aggregate interactions about artists
SELECT
  gen_random_uuid() AS id,
  'artist'::TEXT AS entity_type,
  COALESCE(i.entity_uuid::TEXT, i.entity_id) AS entity_id,
  i.entity_uuid,
  DATE(i.occurred_at) AS date,
  jsonb_build_object(
    'profile_views', COUNT(*) FILTER (WHERE i.event_type = 'view'),
    'profile_clicks', COUNT(*) FILTER (WHERE i.event_type = 'click'),
    'follows', COUNT(*) FILTER (WHERE i.event_type = 'follow')
  ) AS metrics,
  MIN(i.occurred_at) AS created_at,
  MAX(i.occurred_at) AS updated_at
FROM public.interactions i
WHERE i.entity_type = 'artist'
  AND i.occurred_at IS NOT NULL
GROUP BY COALESCE(i.entity_uuid::TEXT, i.entity_id), i.entity_uuid, DATE(i.occurred_at)

UNION ALL

-- Venue analytics: aggregate interactions about venues
SELECT
  gen_random_uuid() AS id,
  'venue'::TEXT AS entity_type,
  COALESCE(i.entity_uuid::TEXT, i.entity_id) AS entity_id,
  i.entity_uuid,
  DATE(i.occurred_at) AS date,
  jsonb_build_object(
    'profile_views', COUNT(*) FILTER (WHERE i.event_type = 'view'),
    'profile_clicks', COUNT(*) FILTER (WHERE i.event_type = 'click'),
    'follows', COUNT(*) FILTER (WHERE i.event_type = 'follow')
  ) AS metrics,
  MIN(i.occurred_at) AS created_at,
  MAX(i.occurred_at) AS updated_at
FROM public.interactions i
WHERE i.entity_type = 'venue'
  AND i.occurred_at IS NOT NULL
GROUP BY COALESCE(i.entity_uuid::TEXT, i.entity_id), i.entity_uuid, DATE(i.occurred_at)

UNION ALL

-- Campaign analytics: aggregate interactions about campaigns
SELECT
  gen_random_uuid() AS id,
  'campaign'::TEXT AS entity_type,
  i.entity_id,
  NULL::UUID AS entity_uuid,  -- Campaigns may not have UUIDs
  DATE(i.occurred_at) AS date,
  jsonb_build_object(
    'impressions', COUNT(*) FILTER (WHERE i.event_type = 'view'),
    'clicks', COUNT(*) FILTER (WHERE i.event_type = 'click'),
    'unique_viewers', COUNT(DISTINCT i.user_id) FILTER (WHERE i.event_type = 'view')
  ) AS metrics,
  MIN(i.occurred_at) AS created_at,
  MAX(i.occurred_at) AS updated_at
FROM public.interactions i
WHERE i.entity_type = 'campaign'
  AND i.occurred_at IS NOT NULL
GROUP BY i.entity_id, DATE(i.occurred_at);

-- Create unique index for efficient lookups and refresh
CREATE UNIQUE INDEX IF NOT EXISTS analytics_daily_mv_entity_date_idx 
  ON public.analytics_daily_mv(entity_type, entity_id, date);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS analytics_daily_mv_entity_type_date_idx 
  ON public.analytics_daily_mv(entity_type, date DESC);

CREATE INDEX IF NOT EXISTS analytics_daily_mv_entity_uuid_idx 
  ON public.analytics_daily_mv(entity_uuid) 
  WHERE entity_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_daily_mv_date_idx 
  ON public.analytics_daily_mv(date DESC);

-- Add comment explaining the view
COMMENT ON MATERIALIZED VIEW public.analytics_daily_mv IS 
'Materialized view aggregating daily analytics from interactions table. This is a DERIVED view - interactions is the source of truth. Refresh with REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_daily_mv;';

-- ============================================
-- STEP 3: CREATE REFRESH FUNCTION
-- ============================================
-- Function to refresh the materialized view (can be called on a schedule)

CREATE OR REPLACE FUNCTION public.refresh_analytics_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Refresh the materialized view concurrently (allows reads during refresh)
  -- Note: CONCURRENTLY requires a unique index (which we created above)
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.analytics_daily_mv;
  
  RAISE NOTICE '✅ Refreshed analytics_daily_mv materialized view';
END;
$$;

COMMENT ON FUNCTION public.refresh_analytics_daily() IS 
'Refreshes the analytics_daily_mv materialized view. Should be called on a schedule (e.g., daily/hourly). Uses CONCURRENTLY to allow reads during refresh.';

GRANT EXECUTE ON FUNCTION public.refresh_analytics_daily() TO authenticated;

-- ============================================
-- STEP 4: DROP OLD TABLE (if it exists)
-- ============================================
-- Drop the old analytics_daily table since we're replacing it with a materialized view
-- We need to drop it before creating the compatibility view with the same name

DO $$
BEGIN
  -- Check if analytics_daily exists as a table
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_daily'
    AND table_type = 'BASE TABLE'
  ) THEN
    -- Drop the table (CASCADE to handle any dependencies like indexes, triggers, RLS policies)
    DROP TABLE public.analytics_daily CASCADE;
    
    RAISE NOTICE '✅ Dropped old analytics_daily table';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_daily'
  ) THEN
    -- If it's already a view, drop it
    DROP VIEW public.analytics_daily CASCADE;
    
    RAISE NOTICE '✅ Dropped existing analytics_daily view';
  ELSE
    RAISE NOTICE '⚠️  analytics_daily does not exist (table or view)';
  END IF;
END $$;

-- ============================================
-- STEP 5: CREATE COMPATIBILITY VIEW
-- ============================================
-- Create a regular view with the same name as the old table for backward compatibility
-- This allows existing code to continue working without changes
-- Note: We create this after dropping the old table/view

CREATE VIEW public.analytics_daily AS
SELECT * FROM public.analytics_daily_mv;

COMMENT ON VIEW public.analytics_daily IS 
'Compatibility view for analytics_daily_mv materialized view. This view points to analytics_daily_mv which is derived from interactions table (the source of truth).';

-- ============================================
-- STEP 6: INITIAL REFRESH
-- ============================================
-- Perform initial refresh to populate the materialized view
-- Note: First refresh cannot be CONCURRENT, but subsequent ones can be

DO $$
BEGIN
  RAISE NOTICE 'Refreshing analytics_daily_mv materialized view (initial load)...';
  REFRESH MATERIALIZED VIEW public.analytics_daily_mv;
  RAISE NOTICE '✅ Initial refresh complete';
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  mv_exists BOOLEAN;
  view_exists BOOLEAN;
  table_exists BOOLEAN;
  row_count BIGINT;
BEGIN
  -- Check if materialized view exists
  SELECT EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'analytics_daily_mv'
  ) INTO mv_exists;
  
  -- Check if compatibility view exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_daily'
  ) INTO view_exists;
  
  -- Check if old table still exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_daily'
    AND table_type = 'BASE TABLE'
  ) INTO table_exists;
  
  -- Count rows in materialized view
  SELECT COUNT(*) INTO row_count FROM public.analytics_daily_mv;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION VERIFICATION';
  RAISE NOTICE '================================================';
  
  IF mv_exists THEN
    RAISE NOTICE '✅ Materialized view analytics_daily_mv exists';
  ELSE
    RAISE WARNING '⚠️  Materialized view analytics_daily_mv does not exist!';
  END IF;
  
  IF view_exists THEN
    RAISE NOTICE '✅ Compatibility view analytics_daily exists';
  ELSE
    RAISE WARNING '⚠️  Compatibility view analytics_daily does not exist!';
  END IF;
  
  IF table_exists THEN
    RAISE WARNING '⚠️  Old analytics_daily TABLE still exists (should have been dropped)';
  ELSE
    RAISE NOTICE '✅ Old analytics_daily table successfully removed';
  END IF;
  
  RAISE NOTICE '📊 Row count in materialized view: %', row_count;
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration complete. analytics_daily is now a materialized view.';
  RAISE NOTICE 'Schedule refresh_analytics_daily() function to keep data current.';
  RAISE NOTICE 'Example: SELECT cron.schedule(''refresh-analytics-daily'', ''0 * * * *'', ''SELECT refresh_analytics_daily();'');';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

-- ============================================
-- NOTES
-- ============================================
-- 1. The materialized view aggregates data from interactions table (the fact table)
-- 2. Refresh the view regularly using: REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_daily_mv;
--    Or use the convenience function: SELECT refresh_analytics_daily();
-- 3. The compatibility view (analytics_daily) allows existing code to work without changes
-- 4. To schedule automatic refreshes, use pg_cron extension:
--    SELECT cron.schedule('refresh-analytics-daily', '0 * * * *', 'SELECT refresh_analytics_daily();');
-- 5. For real-time analytics, query interactions table directly
-- 6. For aggregated analytics, query analytics_daily view (which reads from the materialized view)
-- ============================================
