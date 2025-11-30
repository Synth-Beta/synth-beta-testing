-- Migration to add average rating ordering to reviews
-- This ensures reviews are ordered by the average of the 3 category ratings (to 1 decimal place)

-- Create a helper function to calculate average rating from 5 categories
CREATE OR REPLACE FUNCTION calculate_average_rating(
  p_artist_performance_rating NUMERIC,
  p_production_rating NUMERIC,
  p_venue_rating_decimal NUMERIC,
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
  
  IF p_venue_rating_decimal IS NOT NULL AND p_venue_rating_decimal > 0 THEN
    v_sum := v_sum + p_venue_rating_decimal;
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
  
  -- Calculate average if we have ratings, otherwise use fallback
  IF v_ratings_count > 0 THEN
    v_avg := ROUND((v_sum / v_ratings_count)::NUMERIC, 1);
  ELSE
    v_avg := COALESCE(p_fallback_rating, 0)::NUMERIC;
  END IF;
  
  RETURN v_avg;
END;
$$;

-- Update the get_user_reviews_by_rating function to order by average rating
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
  venue_rating_decimal NUMERIC,
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
    ur.event_id,
    ur.rating,
    ur.rank_order,
    ur.artist_performance_rating,
    ur.production_rating,
    ur.venue_rating_decimal,
    ur.location_rating,
    ur.value_rating,
    calculate_average_rating(
      ur.artist_performance_rating,
      ur.production_rating,
      ur.venue_rating_decimal,
      ur.location_rating,
      ur.value_rating,
      ur.rating
    ) as average_rating,
    ur.review_text,
    ur.created_at,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
  FROM public.reviews ur
  LEFT JOIN public.events je ON ur.event_id = je.id
  WHERE ur.user_id = p_user_id
    AND ur.is_draft = false
    AND (
      ur.rating = ROUND(p_rating)
      OR (
        (ur.artist_performance_rating IS NOT NULL 
         OR ur.production_rating IS NOT NULL
         OR ur.venue_rating_decimal IS NOT NULL
         OR ur.location_rating IS NOT NULL
         OR ur.value_rating IS NOT NULL)
        AND ROUND(calculate_average_rating(
          ur.artist_performance_rating,
          ur.production_rating,
          ur.venue_rating_decimal,
          ur.location_rating,
          ur.value_rating,
          ur.rating
        ) * 2) / 2 = p_rating
      )
    )
  ORDER BY 
    calculate_average_rating(
      ur.artist_performance_rating,
      ur.production_rating,
      ur.venue_rating_decimal,
      ur.location_rating,
      ur.value_rating,
      ur.rating
    ) DESC,
    ur.rank_order NULLS LAST,
    ur.created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_average_rating(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_reviews_by_rating(UUID, NUMERIC) TO authenticated;

-- Add comment
COMMENT ON FUNCTION calculate_average_rating IS 'Calculates average rating from 5 category ratings (artist_performance, production, venue, location, value), rounded to 1 decimal place';

