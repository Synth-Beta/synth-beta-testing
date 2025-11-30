-- ============================================
-- FIX: View auth.uid() Context Issue
-- ============================================
-- The view uses auth.uid() which might not work in RPC function context
-- This creates a version that works better with the function

-- Drop and recreate view to handle auth context better
DROP VIEW IF EXISTS public.reviews_with_connection_degree CASCADE;

CREATE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating::numeric AS rating,
  ur.review_text,
  ur.review_text AS content,
  ur.is_public,
  ur.is_draft,
  ur.photos::TEXT[] as photos,
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
  p.account_type::TEXT as reviewer_account_type,
  -- Event information
  je.title as event_title,
  je.artist_name,
  je.venue_name,
  je.event_date,
  je.venue_city,
  je.venue_state,
  je.artist_id,
  je.venue_id,
  -- Connection degree - use COALESCE to handle null auth.uid()
  COALESCE(
    public.get_connection_degree(
      COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
      ur.user_id
    ),
    999
  ) as connection_degree,
  -- Connection type label
  (SELECT label FROM public.get_connection_info(
    COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
    ur.user_id
  ) LIMIT 1) as connection_type_label,
  -- Connection color
  (SELECT color FROM public.get_connection_info(
    COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
    ur.user_id
  ) LIMIT 1) as connection_color
FROM public.reviews ur
JOIN public.users p ON ur.user_id = p.user_id
JOIN public.events je ON ur.event_id = je.id
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != ''
  -- Exclude own reviews - handle auth context
  AND ur.user_id != COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'sub')::uuid,
    auth.uid()
  )
  -- Filter by connection degree
  AND (
    public.get_connection_degree(
      COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
      ur.user_id
    ) IN (1, 2)
    OR (
      public.get_connection_degree(
        COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
        ur.user_id
      ) = 3 
      AND public.is_event_relevant_to_user(
        COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
        je.artist_id,
        je.venue_id,
        je.venue_name,
        je.venue_city,
        je.venue_state
      )
    )
    OR (
      public.get_connection_degree(
        COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
        ur.user_id
      ) NOT IN (1, 2, 3)
      AND ur.created_at = ur.updated_at
      AND ur.created_at >= (NOW() - INTERVAL '30 days')
    )
  );

-- Grant permissions
GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

COMMENT ON VIEW public.reviews_with_connection_degree IS 'Reviews from 1st, 2nd, and relevant 3rd degree connections. Handles auth context from RPC function via request.jwt.claims.';

