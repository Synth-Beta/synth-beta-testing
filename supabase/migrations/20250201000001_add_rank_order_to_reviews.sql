-- Add rank_order column to user_reviews for within-rating ranking
-- This allows users to order reviews with the same star rating

ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS rank_order INTEGER;

-- Add index for efficient queries by rating and rank
CREATE INDEX IF NOT EXISTS idx_user_reviews_rating_rank ON public.user_reviews(user_id, rating, rank_order NULLS LAST);

-- Add comment explaining the column
COMMENT ON COLUMN public.user_reviews.rank_order IS 'Order/rank within reviews of the same rating (lower number = higher preference). Null means unranked within that rating group.';

-- Create helper function to get reviews grouped by rating for a user
CREATE OR REPLACE FUNCTION get_user_reviews_by_rating(
  p_user_id UUID,
  p_rating NUMERIC
)
RETURNS TABLE (
  id UUID,
  event_id VARCHAR,
  rating INTEGER,
  rank_order INTEGER,
  performance_rating NUMERIC,
  venue_rating_new NUMERIC,
  overall_experience_rating NUMERIC,
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
    ur.performance_rating,
    ur.venue_rating_new,
    ur.overall_experience_rating,
    ur.review_text,
    ur.created_at,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
  FROM public.user_reviews ur
  LEFT JOIN public.jambase_events je ON ur.event_id = je.id
  WHERE ur.user_id = p_user_id
    AND (
      ur.rating = ROUND(p_rating)
      OR (
        ur.performance_rating IS NOT NULL 
        AND ur.venue_rating_new IS NOT NULL 
        AND ur.overall_experience_rating IS NOT NULL
        AND ROUND(((ur.performance_rating + ur.venue_rating_new + ur.overall_experience_rating) / 3.0) * 2) / 2 = p_rating
      )
    )
  ORDER BY ur.rank_order NULLS LAST, ur.created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_reviews_by_rating(UUID, NUMERIC) TO authenticated;

