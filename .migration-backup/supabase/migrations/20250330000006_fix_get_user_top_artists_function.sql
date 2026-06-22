-- ============================================
-- Fix get_user_top_artists function
-- ============================================
-- The music_preference_signals table was dropped during consolidation.
-- This function needs to be updated to use the new schema, but for now
-- we'll create a stub that returns empty results to prevent errors.
-- TODO: Re-implement using user_preferences table or user_preference_signals if available

-- Drop the old function that references non-existent music_preference_signals table
DROP FUNCTION IF EXISTS public.get_user_top_artists(UUID, INT) CASCADE;

-- Create a stub function that returns empty results
-- This prevents 404 errors when the function is called
CREATE OR REPLACE FUNCTION public.get_user_top_artists(
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
BEGIN
  -- Return empty results for now
  -- TODO: Re-implement using new schema (user_preferences or user_preference_signals table)
  RETURN QUERY
  SELECT 
    NULL::TEXT as artist_name,
    NULL::UUID as artist_id,
    NULL::NUMERIC as score,
    NULL::BIGINT as interaction_count,
    ARRAY[]::TEXT[] as genres
  WHERE false;  -- Always false, so no rows returned
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_top_artists(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.get_user_top_artists IS 
'Stub function - returns empty results. The underlying music_preference_signals table was dropped during consolidation. TODO: Re-implement using new schema.';

