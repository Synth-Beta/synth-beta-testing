-- Create database views for friend-based review feeds
-- These views will make it easy to query reviews from friends and friends+1

-- 1. Create view for friends' reviews
CREATE OR REPLACE VIEW public.friends_reviews_view AS
SELECT 
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
  je.venue_id,
  -- Friendship information (for debugging/filtering)
  f.id as friendship_id,
  f.user1_id,
  f.user2_id,
  f.created_at as friendship_created_at
FROM user_reviews ur
JOIN profiles p ON ur.user_id = p.user_id
JOIN jambase_events je ON ur.event_id = je.id
JOIN friends f ON (
  (f.user1_id = ur.user_id) OR (f.user2_id = ur.user_id)
)
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL;

-- 2. Create view for friends + 1 reviews (friends of friends)
CREATE OR REPLACE VIEW public.friends_plus_one_reviews_view AS
-- Direct friends' reviews
SELECT 
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
  je.venue_id,
  -- Connection info
  1 as connection_degree,
  f.id as friendship_id,
  f.user1_id,
  f.user2_id,
  f.created_at as friendship_created_at
FROM user_reviews ur
JOIN profiles p ON ur.user_id = p.user_id
JOIN jambase_events je ON ur.event_id = je.id
JOIN friends f ON (
  (f.user1_id = ur.user_id) OR (f.user2_id = ur.user_id)
)
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL

UNION ALL

-- Friends of friends' reviews
SELECT 
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
  je.venue_id,
  -- Connection info
  2 as connection_degree,
  f2.id as friendship_id,
  f2.user1_id,
  f2.user2_id,
  f2.created_at as friendship_created_at
FROM user_reviews ur
JOIN profiles p ON ur.user_id = p.user_id
JOIN jambase_events je ON ur.event_id = je.id
JOIN friends f1 ON (
  (f1.user1_id = ur.user_id) OR (f1.user2_id = ur.user_id)
)
JOIN friends f2 ON (
  (f2.user1_id = f1.user2_id AND f2.user2_id != ur.user_id) OR
  (f2.user2_id = f1.user1_id AND f2.user1_id != ur.user_id) OR
  (f2.user1_id = f1.user1_id AND f2.user2_id != ur.user_id) OR
  (f2.user2_id = f1.user2_id AND f2.user1_id != ur.user_id)
)
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND NOT EXISTS (
    -- Exclude direct friends to avoid duplicates
    SELECT 1 FROM friends f_direct 
    WHERE (f_direct.user1_id = ur.user_id OR f_direct.user2_id = ur.user_id)
  );

-- 3. Enable RLS on the views
ALTER VIEW public.friends_reviews_view SET (security_invoker = true);
ALTER VIEW public.friends_plus_one_reviews_view SET (security_invoker = true);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_friends_user1_id ON public.friends(user1_id);
CREATE INDEX IF NOT EXISTS idx_friends_user2_id ON public.friends(user2_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id_public ON public.user_reviews(user_id, is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_user_reviews_created_at ON public.user_reviews(created_at DESC);

-- 5. Add helpful comments
COMMENT ON VIEW public.friends_reviews_view IS 'Shows public reviews from direct friends only';
COMMENT ON VIEW public.friends_plus_one_reviews_view IS 'Shows public reviews from friends and friends of friends, with connection degree tracking';

-- 6. Test the views (optional - remove these after testing)
-- SELECT COUNT(*) FROM friends_reviews_view;
-- SELECT COUNT(*) FROM friends_plus_one_reviews_view;
