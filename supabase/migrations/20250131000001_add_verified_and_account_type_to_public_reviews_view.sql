-- Update the public reviews view to include verified status and account_type from profiles
DROP VIEW IF EXISTS public.public_reviews_with_profiles;

CREATE OR REPLACE VIEW public.public_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id,
    ur.rating,
    ur.performance_rating,
    ur.venue_rating_new as venue_rating,
    ur.overall_experience_rating,
    ur.performance_review_text,
    ur.venue_review_text,
    ur.overall_experience_review_text,
    ur.review_type,
    ur.reaction_emoji,
    ur.review_text,
    ur.photos,
    ur.videos,
    ur.mood_tags,
    ur.genre_tags,
    ur.context_tags,
    ur.venue_tags,
    ur.artist_tags,
    ur.likes_count,
    ur.comments_count,
    ur.shares_count,
    ur.created_at,
    ur.updated_at,
    ur.is_draft,
    p.name as reviewer_name,
    p.avatar_url as reviewer_avatar,
    p.verified as reviewer_verified,
    p.account_type as reviewer_account_type,
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
WHERE ur.is_public = true;

-- Grant access to the updated view
GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;

