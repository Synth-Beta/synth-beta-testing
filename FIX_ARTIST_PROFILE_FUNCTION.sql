-- Fix get_user_top_artists to handle optional artist_profile table
-- This prevents errors when artist_profile table doesn't exist
-- Run this via Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_user_top_artists(
  p_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  artist_name TEXT,
  artist_id UUID,
  score NUMERIC,
  interaction_count BIGINT,
  genres TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_table_exists BOOLEAN;
BEGIN
  -- Check if artist_profile table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'artist_profile'
  ) INTO v_table_exists;
  
  -- If artist_profile exists, use it for genres
  IF v_table_exists THEN
    RETURN QUERY
    SELECT 
      mps.preference_value,
      a.id,
      mps.preference_score,
      mps.interaction_count::BIGINT,
      COALESCE(ap.genres, ARRAY[]::TEXT[])
    FROM music_preference_signals mps
    LEFT JOIN artists a ON a.name = mps.preference_value
    LEFT JOIN artist_profile ap ON ap.jambase_artist_id = a.jambase_artist_id
    WHERE mps.user_id = p_user_id
      AND mps.preference_type = 'artist'
    ORDER BY mps.preference_score DESC
    LIMIT p_limit;
  ELSE
    -- If artist_profile doesn't exist, return without genres
    RETURN QUERY
    SELECT 
      mps.preference_value,
      a.id,
      mps.preference_score,
      mps.interaction_count::BIGINT,
      ARRAY[]::TEXT[] as genres
    FROM music_preference_signals mps
    LEFT JOIN artists a ON a.name = mps.preference_value
    WHERE mps.user_id = p_user_id
      AND mps.preference_type = 'artist'
    ORDER BY mps.preference_score DESC
    LIMIT p_limit;
  END IF;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_top_artists(UUID, INT) TO authenticated;

COMMENT ON FUNCTION get_user_top_artists IS 'Get user top artists with optional genre data from artist_profile (if table exists)';

