-- Fix account_type type mismatch in reviews_with_connection_degree view
-- The view was selecting account_type (enum) but the function expects TEXT
-- This casts the enum to TEXT to match the function return type

CREATE OR REPLACE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating::numeric AS rating,
  ur.review_text,
  ur.review_text AS content,
  ur.is_public,
  ur.is_draft,
  ur.photos,
  je.setlist AS setlist,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.created_at,
  ur.updated_at,
  -- Profile information
  p.name as reviewer_name,
  p.avatar_url as reviewer_avatar,
  p.verified as reviewer_verified,
  p.account_type::TEXT as reviewer_account_type,  -- CAST enum to TEXT
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

-- Grant permissions (in case view was dropped and recreated)
GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

COMMENT ON VIEW public.reviews_with_connection_degree IS 'Reviews from 1st, 2nd, and relevant 3rd degree connections. 3rd degree only shows if the current user follows the artist OR venue of the review event. Uses existing get_connection_degree function.';

