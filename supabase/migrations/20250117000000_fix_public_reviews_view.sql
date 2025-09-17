-- Fix the public_reviews_with_profiles view to match the actual user_reviews table schema
-- Drop the existing view first
DROP VIEW IF EXISTS public.public_reviews_with_profiles;

-- Create the corrected view with the actual columns from user_reviews table
CREATE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.rating,
    ur.reaction_emoji,
    ur.review_text,
    ur.photos,
    ur.videos,
    ur.mood_tags,
    ur.genre_tags,
    ur.context_tags,
    ur.likes_count,
    ur.comments_count,
    ur.shares_count,
    ur.created_at,
    ur.updated_at,
    p.name as reviewer_name,
    p.avatar_url as reviewer_avatar,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.is_public = true;

-- Grant access to the view
GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;
