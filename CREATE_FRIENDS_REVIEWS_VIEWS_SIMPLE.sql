-- Simple version of friends reviews views without complex joins
-- This creates basic views that work with Supabase SQL Editor

-- 1. Create a simple view for friends' reviews
CREATE OR REPLACE VIEW public.friends_reviews_simple AS
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

-- 2. Enable RLS on the view
ALTER VIEW public.friends_reviews_simple SET (security_invoker = true);

-- 3. Create indexes for better performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_friends_user1_id ON public.friends(user1_id);
CREATE INDEX IF NOT EXISTS idx_friends_user2_id ON public.friends(user2_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_id_public ON public.user_reviews(user_id, is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_user_reviews_created_at ON public.user_reviews(created_at DESC);

-- 4. Add helpful comment
COMMENT ON VIEW public.friends_reviews_simple IS 'Simple view showing public reviews from users who have friends';

-- 5. Test the view
SELECT COUNT(*) as total_reviews FROM friends_reviews_simple;
