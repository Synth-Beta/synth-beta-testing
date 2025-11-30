-- Recreate reviews_with_connection_degree view
-- This view was dropped in 20250322000002_fix_draft_rating_nullable.sql but never recreated
-- This migration recreates it with the same definition as the original

BEGIN;

-- Recreate the view
DROP VIEW IF EXISTS public.reviews_with_connection_degree CASCADE;

CREATE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating::numeric AS rating,
  ur.review_text::TEXT as review_text,
  ur.review_text::TEXT AS content,
  ur.is_public,
  ur.is_draft,
  ur.photos::TEXT[] as photos,  -- Ensure photos is TEXT[] to match table schema
  je.setlist AS setlist,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.created_at,
  ur.updated_at,
  -- Profile information
  p.name::TEXT as reviewer_name,
  p.avatar_url::TEXT as reviewer_avatar,
  p.verified as reviewer_verified,
  p.account_type::TEXT as reviewer_account_type,  -- Cast enum to TEXT to fix type mismatch
  -- Event information
  je.title::TEXT as event_title,
  je.artist_name::TEXT as artist_name,
  je.venue_name::TEXT as venue_name,
  je.event_date,
  je.venue_city::TEXT as venue_city,
  je.venue_state::TEXT as venue_state,
  je.artist_id::TEXT as artist_id,
  je.venue_id::TEXT as venue_id,
  -- Connection degree (using existing function)
  COALESCE(
    public.get_connection_degree(auth.uid(), ur.user_id),
    999
  ) as connection_degree,
  -- Connection type label - use get_connection_info function for proper labels
  (SELECT label::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1) as connection_type_label,
  -- Connection color for UI styling
  (SELECT color::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1) as connection_color
FROM public.reviews ur
JOIN public.users p ON ur.user_id = p.user_id
JOIN public.events je ON ur.event_id = je.id
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != ''
  AND ur.user_id != auth.uid() -- Exclude own reviews
  -- Filter by connection degree: include 1st, 2nd, relevant 3rd, and brand-new public reviews
  AND (
    public.get_connection_degree(auth.uid(), ur.user_id) IN (1, 2) -- Always include 1st and 2nd
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) = 3 
      -- Only include 3rd if relevant: current user follows the artist OR venue of THIS event
      AND public.is_event_relevant_to_user(
        auth.uid(), 
        je.artist_id,
        je.venue_id,
        je.venue_name,
        je.venue_city,
        je.venue_state
      )
    )
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) NOT IN (1, 2, 3)
      AND ur.created_at = ur.updated_at -- Only surface brand-new reviews
      AND ur.created_at >= (NOW() - INTERVAL '30 days')
    )
  );

-- Grant permissions
GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

-- Add comment
COMMENT ON VIEW public.reviews_with_connection_degree IS 'Reviews from 1st, 2nd, and relevant 3rd degree connections. 3rd degree only shows if the current user follows the artist OR venue of the review event. Uses existing get_connection_degree function. Fixes account_type type mismatch by casting enum to TEXT.';

-- Ensure the RPC function exists and is properly configured
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
    rwcd.review_id,
    rwcd.reviewer_id,
    rwcd.event_id,
    rwcd.rating,
    rwcd.review_text::TEXT,
    rwcd.content::TEXT,
    rwcd.is_public,
    rwcd.is_draft,
    CASE 
      WHEN rwcd.photos IS NULL THEN NULL::JSONB
      ELSE to_jsonb(rwcd.photos)  -- Convert TEXT[] to JSONB for function return
    END as photos,
    rwcd.setlist,
    rwcd.likes_count,
    rwcd.comments_count,
    rwcd.shares_count,
    rwcd.created_at,
    rwcd.updated_at,
    rwcd.reviewer_name::TEXT,
    rwcd.reviewer_avatar::TEXT,
    rwcd.reviewer_verified,
    rwcd.reviewer_account_type::TEXT,
    rwcd.event_title::TEXT,
    rwcd.artist_name::TEXT,
    rwcd.venue_name::TEXT,
    rwcd.event_date,
    rwcd.venue_city::TEXT,
    rwcd.venue_state::TEXT,
    rwcd.artist_id::TEXT,
    rwcd.venue_id::TEXT,
    rwcd.connection_degree,
    rwcd.connection_type_label::TEXT,
    rwcd.connection_color::TEXT
  FROM public.reviews_with_connection_degree AS rwcd
  ORDER BY 
    rwcd.connection_degree ASC, -- Prioritize closer connections (1st before 2nd before 3rd)
    rwcd.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_connection_degree_reviews IS 'Returns reviews from 1st, 2nd, and relevant 3rd degree connections, ordered by connection degree then recency. Uses existing get_connection_degree function. Fixes account_type type mismatch error.';

COMMIT;

