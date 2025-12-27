-- Update all database functions to use venue_rating instead of venue_rating_decimal
-- This ensures consistency after the column name change from venue_rating_decimal to venue_rating

BEGIN;

-- Update ensure_draft_no_rating trigger function to use venue_rating
CREATE OR REPLACE FUNCTION public.ensure_draft_no_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sum NUMERIC := 0;
  v_count INTEGER := 0;
  v_avg NUMERIC;
BEGIN
  -- If this is a draft, ensure rating is NULL
  IF NEW.is_draft = true THEN
    NEW.rating := NULL;
  -- If this is being published (is_draft = false), calculate rating from available category ratings
  ELSIF NEW.is_draft = false THEN
    -- Only calculate if at least one category rating is provided
    IF NEW.artist_performance_rating IS NOT NULL 
       OR NEW.production_rating IS NOT NULL 
       OR NEW.venue_rating IS NOT NULL 
       OR NEW.location_rating IS NOT NULL 
       OR NEW.value_rating IS NOT NULL THEN
      -- Calculate average from available category ratings only
      IF NEW.artist_performance_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.artist_performance_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.production_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.production_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.venue_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.venue_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.location_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.location_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.value_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.value_rating;
        v_count := v_count + 1;
      END IF;
      
      -- Only calculate if we have at least one rating
      IF v_count > 0 THEN
        v_avg := ROUND((v_sum / v_count)::NUMERIC, 1); -- Round to 1 decimal place
        NEW.rating := GREATEST(0.5, LEAST(5.0, v_avg)); -- Clamp between 0.5 and 5.0
      ELSE
        -- No ratings provided - allow NULL (for different review types)
        NEW.rating := NULL;
      END IF;
    ELSE
      -- No category ratings at all - allow NULL (for different review types)
      NEW.rating := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update get_venue_stats function to use venue_rating
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
  
  -- If not found, return NULL averages (not 0)
  IF v_venue_uuid IS NULL THEN
    RETURN QUERY SELECT 
      0::INTEGER,
      NULL::NUMERIC,
      NULL::NUMERIC,
      NULL::NUMERIC,
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
    COUNT(*) FILTER (WHERE r.rating IS NOT NULL)::INTEGER as total_reviews,
    -- Only average non-NULL ratings, return NULL if no ratings exist
    AVG(r.venue_rating) FILTER (WHERE r.venue_rating IS NOT NULL)::NUMERIC as average_venue_rating,
    AVG(r.artist_performance_rating) FILTER (WHERE r.artist_performance_rating IS NOT NULL)::NUMERIC as average_artist_rating,
    AVG(r.rating) FILTER (WHERE r.rating IS NOT NULL)::NUMERIC as average_overall_rating,
    jsonb_build_object(
      '1_star', COUNT(*) FILTER (WHERE r.rating >= 1 AND r.rating < 2)::INTEGER,
      '2_star', COUNT(*) FILTER (WHERE r.rating >= 2 AND r.rating < 3)::INTEGER,
      '3_star', COUNT(*) FILTER (WHERE r.rating >= 3 AND r.rating < 4)::INTEGER,
      '4_star', COUNT(*) FILTER (WHERE r.rating >= 4 AND r.rating < 5)::INTEGER,
      '5_star', COUNT(*) FILTER (WHERE r.rating >= 5)::INTEGER
    ) as rating_distribution
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE e.venue_id = v_venue_uuid
    AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_venue_stats(TEXT) IS 
  'Returns venue statistics. Averages exclude NULL ratings and return NULL (not 0) when no ratings exist. Only counts reviews with non-NULL ratings. Uses venue_rating column.';

-- Update column comment
COMMENT ON COLUMN public.reviews.venue_rating IS 
  'Venue experience rating (0.5-5.0). NULL if not applicable to review type.';

COMMENT ON COLUMN public.reviews.rating IS 
  'Overall rating calculated as average of available category ratings (artist_performance_rating, production_rating, venue_rating, location_rating, value_rating), rounded to 1 decimal place. NULL if no categories provided (supports different review types).';

-- Update calculate_average_rating function if it exists
CREATE OR REPLACE FUNCTION calculate_average_rating(
  p_artist_performance_rating NUMERIC,
  p_production_rating NUMERIC,
  p_venue_rating NUMERIC,
  p_location_rating NUMERIC,
  p_value_rating NUMERIC,
  p_fallback_rating INTEGER
)
RETURNS NUMERIC(3,1)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_avg NUMERIC;
  v_ratings_count INTEGER := 0;
  v_sum NUMERIC := 0;
BEGIN
  -- Count and sum valid ratings from 5 categories
  IF p_artist_performance_rating IS NOT NULL AND p_artist_performance_rating > 0 THEN
    v_sum := v_sum + p_artist_performance_rating;
    v_ratings_count := v_ratings_count + 1;
  END IF;
  
  IF p_production_rating IS NOT NULL AND p_production_rating > 0 THEN
    v_sum := v_sum + p_production_rating;
    v_ratings_count := v_ratings_count + 1;
  END IF;
  
  IF p_venue_rating IS NOT NULL AND p_venue_rating > 0 THEN
    v_sum := v_sum + p_venue_rating;
    v_ratings_count := v_ratings_count + 1;
  END IF;
  
  IF p_location_rating IS NOT NULL AND p_location_rating > 0 THEN
    v_sum := v_sum + p_location_rating;
    v_ratings_count := v_ratings_count + 1;
  END IF;
  
  IF p_value_rating IS NOT NULL AND p_value_rating > 0 THEN
    v_sum := v_sum + p_value_rating;
    v_ratings_count := v_ratings_count + 1;
  END IF;
  
  -- If we have category ratings, use their average
  IF v_ratings_count > 0 THEN
    v_avg := ROUND((v_sum / v_ratings_count)::NUMERIC, 1);
    RETURN GREATEST(0.5, LEAST(5.0, v_avg));
  END IF;
  
  -- Fallback to provided fallback rating
  RETURN GREATEST(0.5, LEAST(5.0, p_fallback_rating::NUMERIC));
END;
$$;

-- Update get_user_reviews_by_rating function if it exists
CREATE OR REPLACE FUNCTION get_user_reviews_by_rating(
  p_user_id UUID,
  p_rating NUMERIC
)
RETURNS TABLE (
  id UUID,
  event_id VARCHAR,
  rating INTEGER,
  rank_order INTEGER,
  artist_performance_rating NUMERIC,
  production_rating NUMERIC,
  venue_rating NUMERIC,
  location_rating NUMERIC,
  value_rating NUMERIC,
  average_rating NUMERIC(3,1),
  review_text TEXT,
  created_at TIMESTAMPTZ,
  event_title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.id,
    ur.event_id::VARCHAR,
    ur.rating,
    ur.rank_order,
    ur.artist_performance_rating,
    ur.production_rating,
    ur.venue_rating,
    ur.location_rating,
    ur.value_rating,
    calculate_average_rating(
      ur.artist_performance_rating,
      ur.production_rating,
      ur.venue_rating,
      ur.location_rating,
      ur.value_rating,
      COALESCE(ur.rating, 0)
    ) as average_rating,
    ur.review_text,
    ur.created_at,
    e.title as event_title,
    a.name as artist_name,
    v.name as venue_name,
    e.event_date
  FROM public.reviews ur
  LEFT JOIN public.events e ON ur.event_id = e.id
  LEFT JOIN public.artists a ON e.artist_id = a.id
  LEFT JOIN public.venues v ON e.venue_id = v.id
  WHERE ur.user_id = p_user_id
    AND ur.is_draft = false
    AND (
      -- Match by exact rating or by calculated average
      ur.rating = p_rating
      OR calculate_average_rating(
        ur.artist_performance_rating,
        ur.production_rating,
        ur.venue_rating,
        ur.location_rating,
        ur.value_rating,
        COALESCE(ur.rating, 0)
      ) = p_rating
    )
  ORDER BY ur.created_at DESC;
END;
$$;

COMMIT;

