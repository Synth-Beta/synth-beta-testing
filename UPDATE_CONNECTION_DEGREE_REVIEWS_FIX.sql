-- ============================================
-- UPDATE: FIX 3RD DEGREE RELEVANCE LOGIC
-- ============================================
-- This updates the view to check if the CURRENT USER follows the
-- artist or venue of THIS SPECIFIC EVENT (not just any shared follows)
-- 
-- Run this AFTER the original CREATE_CONNECTION_DEGREE_REVIEWS_SYSTEM.sql

-- Drop old function
DROP FUNCTION IF EXISTS public.has_relevant_music_connection(UUID, UUID);

-- Create new event-specific relevance function
CREATE OR REPLACE FUNCTION public.is_event_relevant_to_user(
  p_user_id UUID,
  p_event_artist_id TEXT,
  p_event_venue_name TEXT,
  p_event_venue_city TEXT,
  p_event_venue_state TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_follows_artist BOOLEAN := false;
  v_follows_venue BOOLEAN := false;
BEGIN
  -- Check if user follows the artist of this event
  -- Note: artist_id in jambase_events is TEXT (jambase_artist_id), need to match with artists table
  IF p_event_artist_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.artist_follows af
      JOIN public.artists a ON af.artist_id = a.id
      WHERE af.user_id = p_user_id
        AND (
          a.jambase_artist_id = p_event_artist_id
          OR a.id::TEXT = p_event_artist_id
        )
      LIMIT 1
    ) INTO v_follows_artist;
  END IF;
  
  -- Check if user follows the venue of this event (by name + location)
  IF p_event_venue_name IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.venue_follows vf
      WHERE vf.user_id = p_user_id
        AND LOWER(TRIM(vf.venue_name)) = LOWER(TRIM(p_event_venue_name))
        AND (
          (vf.venue_city IS NULL AND (p_event_venue_city IS NULL OR p_event_venue_city = ''))
          OR (p_event_venue_city IS NULL OR p_event_venue_city = '')
          OR (vf.venue_city IS NOT NULL AND p_event_venue_city IS NOT NULL 
              AND LOWER(TRIM(vf.venue_city)) = LOWER(TRIM(p_event_venue_city)))
        )
        AND (
          (vf.venue_state IS NULL AND (p_event_venue_state IS NULL OR p_event_venue_state = ''))
          OR (p_event_venue_state IS NULL OR p_event_venue_state = '')
          OR (vf.venue_state IS NOT NULL AND p_event_venue_state IS NOT NULL 
              AND LOWER(TRIM(vf.venue_state)) = LOWER(TRIM(p_event_venue_state)))
        )
      LIMIT 1
    ) INTO v_follows_venue;
  END IF;
  
  RETURN v_follows_artist OR v_follows_venue;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_event_relevant_to_user(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Recreate the view with fixed logic
CREATE OR REPLACE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating,
  ur.review_text as content,
  ur.review_text,
  ur.is_public,
  ur.is_draft,
  ur.photos,
  ur.setlist,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.created_at,
  ur.updated_at,
  -- Profile information
  p.name as reviewer_name,
  p.avatar_url as reviewer_avatar,
  p.verified as reviewer_verified,
  p.account_type as reviewer_account_type,
  -- Event information
  je.title as event_title,
  je.artist_name,
  je.venue_name,
  je.event_date,
  je.venue_city,
  je.venue_state,
  je.artist_id,
  je.venue_id,
  -- Connection degree (using existing function)
  COALESCE(
    public.get_connection_degree(auth.uid(), ur.user_id),
    999
  ) as connection_degree,
  -- Connection type label - use get_connection_info function for proper labels
  (SELECT label FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1) as connection_type_label,
  -- Connection color for UI styling
  (SELECT color FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1) as connection_color
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != ''
  AND ur.user_id != auth.uid() -- Exclude own reviews
  -- Filter by connection degree: include 1st, 2nd, and relevant 3rd
  AND (
    public.get_connection_degree(auth.uid(), ur.user_id) IN (1, 2) -- Always include 1st and 2nd
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) = 3 
      -- Only include 3rd if relevant: current user follows the artist OR venue of THIS event
      AND public.is_event_relevant_to_user(
        auth.uid(), 
        je.artist_id,
        je.venue_name,
        je.venue_city,
        je.venue_state
      )
    )
  );

-- Update comment
COMMENT ON VIEW public.reviews_with_connection_degree IS 'Reviews from 1st, 2nd, and relevant 3rd degree connections. 3rd degree only shows if the current user follows the artist OR venue of the review event. Uses existing get_connection_degree function.';

