-- ============================================
-- FIX: View Column Mismatch with Function Return Type
-- ============================================
-- The view columns must exactly match the function RETURNS TABLE definition

-- Drop and recreate view with columns that match function return type
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
  )::INTEGER as connection_degree,
  -- Connection type label
  COALESCE(
    (SELECT label FROM public.get_connection_info(
      COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
      ur.user_id
    ) LIMIT 1),
    'Stranger'
  )::TEXT as connection_type_label,
  -- Connection color
  COALESCE(
    (SELECT color FROM public.get_connection_info(
      COALESCE((current_setting('request.jwt.claims', true)::json->>'sub')::uuid, auth.uid()),
      ur.user_id
    ) LIMIT 1),
    'gray'
  )::TEXT as connection_color
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

COMMENT ON VIEW public.reviews_with_connection_degree IS 'Reviews from 1st, 2nd, and relevant 3rd degree connections. Columns match function return type exactly.';

-- Now recreate the function to ensure it matches
DROP FUNCTION IF EXISTS public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) CASCADE;

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
  -- Temporarily set auth context (view uses request.jwt.claims)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text)::text, false);
  
  RETURN QUERY
  SELECT 
    rwcd.review_id,
    rwcd.reviewer_id,
    rwcd.event_id,
    rwcd.rating,
    rwcd.review_text,
    rwcd.content,
    rwcd.is_public,
    rwcd.is_draft,
    CASE 
      WHEN rwcd.photos IS NULL THEN NULL::JSONB
      WHEN array_length(rwcd.photos, 1) IS NULL THEN '[]'::JSONB
      ELSE to_jsonb(rwcd.photos)::JSONB
    END as photos,
    rwcd.setlist,
    rwcd.likes_count,
    rwcd.comments_count,
    rwcd.shares_count,
    rwcd.created_at,
    rwcd.updated_at,
    rwcd.reviewer_name,
    rwcd.reviewer_avatar,
    rwcd.reviewer_verified,
    rwcd.reviewer_account_type,
    rwcd.event_title,
    rwcd.artist_name,
    rwcd.venue_name,
    rwcd.event_date,
    rwcd.venue_city,
    rwcd.venue_state,
    rwcd.artist_id,
    rwcd.venue_id,
    rwcd.connection_degree,
    rwcd.connection_type_label,
    rwcd.connection_color
  FROM public.reviews_with_connection_degree AS rwcd
  ORDER BY 
    rwcd.connection_degree ASC,
    rwcd.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in get_connection_degree_reviews: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_connection_degree_reviews IS 'Returns reviews from 1st, 2nd, and relevant 3rd degree connections. View and function columns are now aligned.';

