-- =====================================================
-- COMPLETE FRIENDS REVIEWS SETUP
-- =====================================================
-- This SQL sets up everything needed for friends' reviews in the feed
-- Run this entire script in Supabase SQL Editor

-- 1. Create indexes for better performance (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_friends_user1_id ON public.friends(user1_id);
CREATE INDEX IF NOT EXISTS idx_friends_user2_id ON public.friends(user2_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id_public ON public.user_reviews(user_id, is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_user_reviews_created_at ON public.user_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reviews_public_draft ON public.user_reviews(is_public, is_draft) WHERE is_public = true AND is_draft = false;

-- 2. Create a simple view for friends' reviews (safe to recreate)
DROP VIEW IF EXISTS public.friends_reviews_simple;
CREATE VIEW public.friends_reviews_simple AS
SELECT DISTINCT
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating,
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
  -- Event information
  je.title as event_title,
  je.artist_name,
  je.venue_name,
  je.event_date,
  je.venue_city,
  je.venue_state,
  je.artist_id,
  je.venue_id
FROM user_reviews ur
JOIN profiles p ON ur.user_id = p.user_id
JOIN jambase_events je ON ur.event_id = je.id
JOIN friends f ON (
  ur.user_id = f.user1_id OR ur.user_id = f.user2_id
)
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != '';

-- 3. Enable RLS on the view
ALTER VIEW public.friends_reviews_simple SET (security_invoker = true);

-- 4. Add helpful comment
COMMENT ON VIEW public.friends_reviews_simple IS 'View showing public reviews from users who have friends - used for friends feed';

-- 5. Create a function to get friend IDs for a user (useful for the service)
CREATE OR REPLACE FUNCTION public.get_user_friend_ids(user_id_param UUID)
RETURNS TABLE(friend_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN f.user1_id = user_id_param THEN f.user2_id
      ELSE f.user1_id
    END as friend_id
  FROM friends f
  WHERE f.user1_id = user_id_param OR f.user2_id = user_id_param;
END;
$$;

-- 6. Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_user_friend_ids(UUID) TO authenticated;

-- 7. Create a function to check if two users are friends
CREATE OR REPLACE FUNCTION public.are_users_friends(user1_id_param UUID, user2_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM friends f
    WHERE (f.user1_id = user1_id_param AND f.user2_id = user2_id_param)
       OR (f.user1_id = user2_id_param AND f.user2_id = user1_id_param)
  );
END;
$$;

-- 8. Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.are_users_friends(UUID, UUID) TO authenticated;

-- 9. Create a function to get friend count for a user
CREATE OR REPLACE FUNCTION public.get_user_friend_count(user_id_param UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM friends f
    WHERE f.user1_id = user_id_param OR f.user2_id = user_id_param
  );
END;
$$;

-- 10. Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_user_friend_count(UUID) TO authenticated;

-- 11. Test the setup (optional - remove these after testing)
-- SELECT COUNT(*) as total_friends_reviews FROM friends_reviews_simple;
-- SELECT get_user_friend_count(auth.uid()) as my_friend_count;

-- 12. Add helpful comments
COMMENT ON FUNCTION public.get_user_friend_ids(UUID) IS 'Returns all friend IDs for a given user';
COMMENT ON FUNCTION public.are_users_friends(UUID, UUID) IS 'Checks if two users are friends';
COMMENT ON FUNCTION public.get_user_friend_count(UUID) IS 'Returns the number of friends for a given user';

-- DONE! The friends reviews system is now set up and ready to use.
-- The TypeScript service can now use these functions and views to fetch friends' reviews.
