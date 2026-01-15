-- ============================================================
-- Fix RPC functions to work with external_entity_ids normalization
-- ============================================================
-- These functions take external IDs (TEXT) but need to look up UUIDs first
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Fix get_venue_stats - needs to look up UUID from external ID
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_venue_stats(venue_jambase_id TEXT)
RETURNS TABLE (
    total_reviews INTEGER,
    average_venue_rating NUMERIC,
    average_artist_rating NUMERIC,
    average_overall_rating NUMERIC,
    rating_distribution JSONB
) AS $$
DECLARE
  v_venue_uuid UUID;
BEGIN
  -- Look up UUID from external_entity_ids
  SELECT entity_uuid INTO v_venue_uuid
  FROM public.external_entity_ids
  WHERE external_id = venue_jambase_id
    AND source = 'jambase'
    AND entity_type = 'venue'
  LIMIT 1;
  
  -- If not found, return empty results
  IF v_venue_uuid IS NULL THEN
    RETURN QUERY SELECT 
      0::INTEGER,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      jsonb_build_object(
        '1_star', 0,
        '2_star', 0,
        '3_star', 0,
        '4_star', 0,
        '5_star', 0
      );
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_reviews,
    COALESCE(AVG(r.venue_rating_decimal), 0)::NUMERIC as average_venue_rating,
    COALESCE(AVG(r.artist_rating_decimal), 0)::NUMERIC as average_artist_rating,
    COALESCE(AVG(r.rating), 0)::NUMERIC as average_overall_rating,
    jsonb_build_object(
      '1_star', COUNT(*) FILTER (WHERE r.rating = 1)::INTEGER,
      '2_star', COUNT(*) FILTER (WHERE r.rating = 2)::INTEGER,
      '3_star', COUNT(*) FILTER (WHERE r.rating = 3)::INTEGER,
      '4_star', COUNT(*) FILTER (WHERE r.rating = 4)::INTEGER,
      '5_star', COUNT(*) FILTER (WHERE r.rating = 5)::INTEGER
    ) as rating_distribution
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE e.venue_id = v_venue_uuid
    AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Fix get_popular_venue_tags - needs to look up UUID from external ID
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_popular_venue_tags(venue_jambase_id TEXT DEFAULT NULL)
RETURNS TABLE (
    tag TEXT,
    count BIGINT
) AS $$
DECLARE
  v_venue_uuid UUID;
BEGIN
  -- If venue_jambase_id provided, look up UUID
  IF venue_jambase_id IS NOT NULL THEN
    SELECT entity_uuid INTO v_venue_uuid
    FROM public.external_entity_ids
    WHERE external_id = venue_jambase_id
      AND source = 'jambase'
      AND entity_type = 'venue'
    LIMIT 1;
  END IF;
  
  RETURN QUERY
  SELECT 
    t.tag,
    COUNT(*)::BIGINT as count
  FROM public.review_tags t
  JOIN public.reviews r ON t.review_id = r.id
  JOIN public.events e ON r.event_id = e.id
  WHERE (v_venue_uuid IS NULL OR e.venue_id = v_venue_uuid)
    AND r.is_draft = false
  GROUP BY t.tag
  ORDER BY count DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Fix get_artist_stats - needs to look up UUID from external ID
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_artist_stats(artist_jambase_id TEXT)
RETURNS TABLE (
    total_reviews INTEGER,
    average_rating NUMERIC,
    rating_distribution JSONB
) AS $$
DECLARE
  v_artist_uuid UUID;
BEGIN
  -- Look up UUID from external_entity_ids
  SELECT entity_uuid INTO v_artist_uuid
  FROM public.external_entity_ids
  WHERE external_id = artist_jambase_id
    AND source = 'jambase'
    AND entity_type = 'artist'
  LIMIT 1;
  
  -- If not found, return empty results
  IF v_artist_uuid IS NULL THEN
    RETURN QUERY SELECT 
      0::INTEGER,
      0::NUMERIC,
      jsonb_build_object(
        '1_star', 0,
        '2_star', 0,
        '3_star', 0,
        '4_star', 0,
        '5_star', 0
      );
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_reviews,
    COALESCE(AVG(r.artist_rating_decimal), 0)::NUMERIC as average_rating,
    jsonb_build_object(
      '1_star', COUNT(*) FILTER (WHERE r.rating = 1)::INTEGER,
      '2_star', COUNT(*) FILTER (WHERE r.rating = 2)::INTEGER,
      '3_star', COUNT(*) FILTER (WHERE r.rating = 3)::INTEGER,
      '4_star', COUNT(*) FILTER (WHERE r.rating = 4)::INTEGER,
      '5_star', COUNT(*) FILTER (WHERE r.rating = 5)::INTEGER
    ) as rating_distribution
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE e.artist_id = v_artist_uuid
    AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Fix get_artist_events and get_venue_events
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_artist_events(artist_jambase_id TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    venue_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    venue_city TEXT,
    venue_state TEXT
) AS $$
DECLARE
  v_artist_uuid UUID;
BEGIN
  -- Look up UUID from external_entity_ids
  SELECT entity_uuid INTO v_artist_uuid
  FROM public.external_entity_ids
  WHERE external_id = artist_jambase_id
    AND source = 'jambase'
    AND entity_type = 'artist'
  LIMIT 1;
  
  -- If not found, return empty results
  IF v_artist_uuid IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    e.id as event_id,
    e.title as event_title,
    e.venue_name,
    e.event_date,
    e.venue_city,
    e.venue_state
  FROM public.events e
  WHERE e.artist_id = v_artist_uuid
  ORDER BY e.event_date DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_venue_events(venue_jambase_id TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    artist_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_venue_uuid UUID;
BEGIN
  -- Look up UUID from external_entity_ids
  SELECT entity_uuid INTO v_venue_uuid
  FROM public.external_entity_ids
  WHERE external_id = venue_jambase_id
    AND source = 'jambase'
    AND entity_type = 'venue'
  LIMIT 1;
  
  -- If not found, return empty results
  IF v_venue_uuid IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    e.id as event_id,
    e.title as event_title,
    e.artist_name,
    e.event_date
  FROM public.events e
  WHERE e.venue_id = v_venue_uuid
  ORDER BY e.event_date DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update comments
COMMENT ON FUNCTION public.get_venue_stats(TEXT) IS 
  'Get venue statistics. Takes external JamBase ID, looks up UUID from external_entity_ids table. Updated for 3NF schema.';

COMMENT ON FUNCTION public.get_popular_venue_tags(TEXT) IS 
  'Get popular venue tags. Takes external JamBase ID (optional), looks up UUID from external_entity_ids table. Updated for 3NF schema.';

COMMENT ON FUNCTION public.get_artist_stats(TEXT) IS 
  'Get artist statistics. Takes external JamBase ID, looks up UUID from external_entity_ids table. Updated for 3NF schema.';

COMMENT ON FUNCTION public.get_artist_events(TEXT, INTEGER) IS 
  'Get artist events. Takes external JamBase ID, looks up UUID from external_entity_ids table. Updated for 3NF schema.';

COMMENT ON FUNCTION public.get_venue_events(TEXT, INTEGER) IS 
  'Get venue events. Takes external JamBase ID, looks up UUID from external_entity_ids table. Updated for 3NF schema.';

-- Grants
GRANT EXECUTE ON FUNCTION public.get_venue_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_venue_tags(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_events(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_events(TEXT, INTEGER) TO authenticated;

COMMIT;




