-- ============================================
-- VERIFY AND FIX: get_connection_degree_reviews RPC Function
-- ============================================
-- This script checks if everything exists and recreates if needed

-- Step 1: Check if view exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'reviews_with_connection_degree'
  ) THEN
    RAISE EXCEPTION 'View reviews_with_connection_degree does not exist. Run FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql first.';
  END IF;
END $$;

-- Step 2: Check if function exists and drop if it has wrong signature
DROP FUNCTION IF EXISTS public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) CASCADE;

-- Step 3: Recreate the function with correct signature
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
    rwcd.review_text,
    rwcd.content,
    rwcd.is_public,
    rwcd.is_draft,
    CASE 
      WHEN rwcd.photos IS NULL THEN NULL::JSONB
      WHEN array_length(rwcd.photos, 1) IS NULL THEN '[]'::JSONB
      ELSE to_jsonb(rwcd.photos)::JSONB  -- Convert TEXT[] to JSONB for function return
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
    rwcd.connection_degree ASC, -- Prioritize closer connections (1st before 2nd before 3rd)
    rwcd.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and re-raise
    RAISE EXCEPTION 'Error in get_connection_degree_reviews: %', SQLERRM;
END;
$$;

-- Step 4: Grant permissions
GRANT EXECUTE ON FUNCTION public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_connection_degree_reviews(UUID, INTEGER, INTEGER) TO anon;

-- Step 5: Add comment
COMMENT ON FUNCTION public.get_connection_degree_reviews IS 'Returns reviews from 1st, 2nd, and relevant 3rd degree connections. FIXED: Handles account_type as TEXT and photos conversion from TEXT[] to JSONB.';

-- Step 6: Verify function exists
SELECT 
  '✅ Function created successfully' as status,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'get_connection_degree_reviews';

