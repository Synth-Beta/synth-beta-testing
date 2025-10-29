-- ============================================
-- CONNECTION DEGREE REVIEWS SYSTEM
-- ============================================
-- Uses EXISTING connection degree functions (get_connection_degree, get_first_degree_connections, etc.)
-- Creates a view that shows reviews from 1st, 2nd, and RELEVANT 3rd degree connections
-- Relevant = they follow the same artist OR venue as the current user

-- ============================================
-- STEP 1: ENSURE CONNECTION FUNCTIONS EXIST
-- ============================================
-- Note: These should already exist from SIMPLIFIED_LINKEDIN_CONNECTIONS.sql
-- If not, you'll need to run that SQL file first

-- ============================================
-- STEP 2: CREATE FUNCTION TO CHECK RELEVANT 3RD DEGREE
-- ============================================
-- Check if the current user follows the artist or venue of this specific event
-- For 3rd degree reviews to be relevant, the review must be for an event where:
-- - The current user follows the artist of that event, OR
-- - The current user follows the venue of that event

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

-- ============================================
-- STEP 3: CREATE MAIN VIEW FOR REVIEWS WITH CONNECTION DEGREES
-- ============================================

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

-- Grant permissions
GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

-- Add comment
COMMENT ON VIEW public.reviews_with_connection_degree IS 'Reviews from 1st, 2nd, and relevant 3rd degree connections. 3rd degree only shows if the current user follows the artist OR venue of the review event. Uses existing get_connection_degree function.';

-- ============================================
-- STEP 4: CREATE INDEXES FOR PERFORMANCE (if not exist)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_artist_follows_user_artist ON public.artist_follows(user_id, artist_id);
CREATE INDEX IF NOT EXISTS idx_venue_follows_user_location ON public.venue_follows(user_id, venue_name, venue_city, venue_state);
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_public ON public.user_reviews(user_id, is_public, is_draft) 
  WHERE is_public = true AND is_draft = false;
CREATE INDEX IF NOT EXISTS idx_user_reviews_created_at ON public.user_reviews(created_at DESC);

-- ============================================
-- STEP 5: CREATE RPC FUNCTION (OPTIONAL - VIEW CAN BE USED DIRECTLY)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_connection_degree_reviews(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  review_id UUID,
  reviewer_id UUID,
  event_id UUID,
  rating DECIMAL,
  review_text TEXT,
  content TEXT,
  is_public BOOLEAN,
  is_draft BOOLEAN,
  photos JSONB,
  setlist JSONB,
  likes_count INTEGER,
  comments_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  reviewer_name TEXT,
  reviewer_avatar TEXT,
  reviewer_verified BOOLEAN,
  reviewer_account_type TEXT,
  event_title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  venue_city TEXT,
  venue_state TEXT,
  artist_id TEXT,
  venue_id TEXT,
  connection_degree INTEGER,
  connection_type_label TEXT,
  connection_color TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily set auth context (view uses auth.uid())
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text)::text, false);
  
  RETURN QUERY
  SELECT 
    review_id,
    reviewer_id,
    event_id,
    rating,
    review_text,
    content,
    is_public,
    is_draft,
    photos,
    setlist,
    likes_count,
    comments_count,
    shares_count,
    created_at,
    updated_at,
    reviewer_name,
    reviewer_avatar,
    reviewer_verified,
    reviewer_account_type,
    event_title,
    artist_name,
    venue_name,
    event_date,
    venue_city,
    venue_state,
    artist_id,
    venue_id,
    connection_degree,
    connection_type_label,
    connection_color
  FROM public.reviews_with_connection_degree
  ORDER BY 
    connection_degree ASC, -- Prioritize closer connections (1st before 2nd before 3rd)
    created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_connection_degree_reviews IS 'Returns reviews from 1st, 2nd, and relevant 3rd degree connections, ordered by connection degree then recency. Uses existing get_connection_degree function.';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after executing the script to verify:

-- 1. Check view exists and works
-- SELECT * FROM public.reviews_with_connection_degree LIMIT 5;

-- 2. Check connection degrees distribution
-- SELECT connection_degree, COUNT(*) 
-- FROM public.reviews_with_connection_degree 
-- GROUP BY connection_degree;

-- 3. Test RPC function (replace with actual user_id)
-- SELECT * FROM public.get_connection_degree_reviews('YOUR_USER_ID_HERE'::uuid, 20, 0);

-- 4. Check 3rd degree relevance (should only show if same artist/venue)
-- SELECT connection_degree, artist_name, venue_name, COUNT(*)
-- FROM public.reviews_with_connection_degree
-- WHERE connection_degree = 3
-- GROUP BY connection_degree, artist_name, venue_name;
