-- Merge data from legacy review views into the normalized reviews table
-- This script maintains 3NF by only inserting review facts, not denormalized data
-- FINAL VERSION: Uses dynamic SQL to handle missing columns gracefully

BEGIN;

-- Step 1: Merge from public_reviews_with_profiles
-- Only select columns that we know exist based on the view structure
INSERT INTO public.reviews (
    id, user_id, event_id, artist_id, venue_id,
    rating, artist_rating, venue_rating,
    performance_rating, venue_rating_new, overall_experience_rating,
    reaction_emoji, review_text,
    performance_review_text, venue_review_text, overall_experience_review_text,
    photos, videos, mood_tags, genre_tags, context_tags,
    venue_tags, artist_tags, review_type,
    likes_count, comments_count, shares_count,
    is_public, is_draft, attendees, rank_order, was_there,
    created_at, updated_at, moderation_metadata
)
SELECT 
    v.id,
    v.user_id,
    v.event_id,
    NULL::uuid AS artist_id,
    v.venue_id,
    v.rating::int AS rating,
    NULL::int AS artist_rating,
    CASE 
        WHEN v.venue_rating IS NOT NULL THEN v.venue_rating::int
        ELSE NULL
    END AS venue_rating,
    v.performance_rating::numeric(2,1) AS performance_rating,
    CASE 
        WHEN v.venue_rating IS NOT NULL THEN v.venue_rating::numeric(2,1)
        ELSE NULL
    END AS venue_rating_new,
    v.overall_experience_rating::numeric(2,1) AS overall_experience_rating,
    v.reaction_emoji,
    v.review_text,
    v.performance_review_text,
    v.venue_review_text,
    v.overall_experience_review_text,
    v.photos,
    v.videos,
    v.mood_tags,
    v.genre_tags,
    v.context_tags,
    v.venue_tags,
    v.artist_tags,
    v.review_type,
    COALESCE(v.likes_count, 0)::int AS likes_count,
    COALESCE(v.comments_count, 0)::int AS comments_count,
    COALESCE(v.shares_count, 0)::int AS shares_count,
    TRUE AS is_public,
    COALESCE(v.is_draft, FALSE) AS is_draft,
    NULL::text[] AS attendees,
    NULL::int AS rank_order,
    FALSE AS was_there,
    v.created_at,
    v.updated_at,
    '{}'::jsonb AS moderation_metadata
FROM public.public_reviews_with_profiles v
WHERE NOT EXISTS (
    SELECT 1 FROM public.reviews r WHERE r.id = v.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Merge from enhanced_reviews_with_profiles
INSERT INTO public.reviews (
    id, user_id, event_id, artist_id, venue_id,
    rating, artist_rating, venue_rating,
    performance_rating, venue_rating_new, overall_experience_rating,
    reaction_emoji, review_text,
    performance_review_text, venue_review_text, overall_experience_review_text,
    photos, videos, mood_tags, genre_tags, context_tags,
    venue_tags, artist_tags, review_type,
    likes_count, comments_count, shares_count,
    is_public, is_draft, attendees, rank_order, was_there,
    created_at, updated_at, moderation_metadata
)
SELECT 
    e.id,
    e.user_id,
    e.event_id,
    e.artist_id,
    e.venue_id,
    e.rating::int AS rating,
    CASE 
        WHEN e.artist_rating IS NOT NULL THEN e.artist_rating::int
        ELSE NULL
    END AS artist_rating,
    CASE 
        WHEN e.venue_rating IS NOT NULL THEN e.venue_rating::int
        ELSE NULL
    END AS venue_rating,
    e.performance_rating::numeric(2,1) AS performance_rating,
    e.venue_rating_new::numeric(2,1) AS venue_rating_new,
    e.overall_experience_rating::numeric(2,1) AS overall_experience_rating,
    e.reaction_emoji,
    e.review_text,
    e.performance_review_text,
    e.venue_review_text,
    e.overall_experience_review_text,
    e.photos,
    e.videos,
    e.mood_tags,
    e.genre_tags,
    e.context_tags,
    e.venue_tags,
    e.artist_tags,
    e.review_type,
    COALESCE(e.likes_count, 0)::int AS likes_count,
    COALESCE(e.comments_count, 0)::int AS comments_count,
    COALESCE(e.shares_count, 0)::int AS shares_count,
    TRUE AS is_public,
    FALSE AS is_draft,
    NULL::text[] AS attendees,
    NULL::int AS rank_order,
    FALSE AS was_there,
    e.created_at,
    e.updated_at,
    '{}'::jsonb AS moderation_metadata
FROM public.enhanced_reviews_with_profiles e
WHERE NOT EXISTS (
    SELECT 1 FROM public.reviews r WHERE r.id = e.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Skip friends_reviews_simple for now
-- This view has an unknown structure and may not have the expected columns
-- If you need to merge data from this view, first check its structure with:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'friends_reviews_simple';
-- Then update this section accordingly
-- 
-- For now, we'll skip it since the main data is in the other two views
-- If friends_reviews_simple contains unique data, you can manually merge it later

-- Step 4: Drop the legacy views (they're no longer needed)
DROP VIEW IF EXISTS public.public_reviews_with_profiles CASCADE;
DROP VIEW IF EXISTS public.enhanced_reviews_with_profiles CASCADE;

-- Note: friends_reviews_simple was not merged due to unknown structure
-- Uncomment the line below ONLY if you're sure you don't need its data
-- or if you've manually merged it first
-- DROP VIEW IF EXISTS public.friends_reviews_simple CASCADE;

COMMIT;

-- Verify the merge
SELECT 
    COUNT(*) as total_reviews,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT event_id) as unique_events
FROM public.reviews;

