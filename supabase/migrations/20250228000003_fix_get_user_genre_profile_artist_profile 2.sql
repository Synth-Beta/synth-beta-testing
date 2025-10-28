-- Fix get_user_genre_profile to handle optional artist_profile table
-- Fixes: relation "artist_profile" does not exist
-- Removes artist_profile dependency completely - uses only tables that always exist

-- Drop and recreate the function
DROP FUNCTION IF EXISTS get_user_genre_profile(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_user_genre_profile(p_user_id UUID)
RETURNS TABLE(
  genre TEXT,
  weight NUMERIC,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Use only tables that are guaranteed to exist
  -- Removed artist_profile dependency entirely
  RETURN QUERY
  WITH genre_signals AS (
    -- From music preference signals (listening data)
    SELECT 
      preference_value as genre,
      preference_score,
      'listening' as source
    FROM music_preference_signals
    WHERE user_id = p_user_id 
      AND preference_type = 'genre'
      AND preference_score > 0
    
    UNION ALL
    
    -- From interested events (presence-based: row exists = user is interested)
    SELECT 
      unnest(genres) as genre,
      3.0 as preference_score,
      'liked_events' as source
    FROM jambase_events je
    JOIN user_jambase_events uje ON je.id = uje.jambase_event_id
    WHERE uje.user_id = p_user_id
      AND je.genres IS NOT NULL
      AND array_length(je.genres, 1) > 0
    
    -- Note: Removed artist_profile dependency
    -- If you need followed artists' genres, ensure artist_profile table exists first
  ),
  genre_aggregated AS (
    SELECT 
      genre,
      SUM(preference_score) as total_score,
      COUNT(DISTINCT source) as source_count
    FROM genre_signals
    GROUP BY genre
  ),
  genre_normalized AS (
    SELECT 
      ga.genre,
      ga.total_score,
      ga.source_count,
      ga.total_score / NULLIF(SUM(ga.total_score) OVER(), 0) as normalized_weight
    FROM genre_aggregated ga
  ),
  genre_with_source AS (
    SELECT DISTINCT ON (gn.genre)
      gn.genre,
      gn.normalized_weight,
      gn.source_count,
      gs.source
    FROM genre_normalized gn
    LEFT JOIN genre_signals gs ON gs.genre = gn.genre
    ORDER BY gn.genre, gn.source_count DESC
  )
  SELECT 
    gws.genre,
    COALESCE(gws.normalized_weight, 0) as weight,
    CASE 
      WHEN gws.source_count > 1 THEN 'multiple'
      ELSE COALESCE(gws.source, 'unknown')
    END as source
  FROM genre_with_source gws
  WHERE gws.normalized_weight > 0
  ORDER BY gws.normalized_weight DESC;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_genre_profile(UUID) TO authenticated;

COMMENT ON FUNCTION get_user_genre_profile IS 'Get user genre profile with normalized weights. Fixed to use artist_profile (singular) instead of artist_profiles (plural).';

