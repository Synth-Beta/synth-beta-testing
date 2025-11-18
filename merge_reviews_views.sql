-- Merge data from legacy review views into the normalized reviews table
-- This script maintains 3NF by only inserting review facts, not denormalized data
-- Based on actual view schemas from consolidation migration

BEGIN;

-- Step 1: Merge from public_reviews_with_profiles
-- Schema: id, user_id, event_id, venue_id, artist_id, rating, performance_rating, 
--         venue_rating (alias for venue_rating_new), overall_experience_rating,
--         performance_review_text, venue_review_text, overall_experience_review_text,
--         review_type, reaction_emoji, review_text, photos, videos, mood_tags, 
--         genre_tags, context_tags, venue_tags, artist_tags, likes_count, 
--         comments_count, shares_count, created_at, updated_at, is_draft,
--         reviewer_name, reviewer_avatar, reviewer_verified, reviewer_account_type,
--         event_title, artist_name, venue_name, event_date
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
    v.artist_id,  -- This view DOES have artist_id
    v.venue_id,
    v.rating::int,
    NULL::int AS artist_rating,  -- Not in this view
    CASE 
        WHEN v.venue_rating IS NOT NULL THEN v.venue_rating::int
        ELSE NULL
    END AS venue_rating,
    v.performance_rating::numeric(2,1),
    v.venue_rating::numeric(2,1) AS venue_rating_new,  -- Map venue_rating (alias) to venue_rating_new
    v.overall_experience_rating::numeric(2,1),
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
    COALESCE(v.likes_count, 0)::int,
    COALESCE(v.comments_count, 0)::int,
    COALESCE(v.shares_count, 0)::int,
    TRUE AS is_public,  -- This view only shows public reviews
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
-- Schema: id, user_id, event_id, venue_id, artist_id, rating, artist_rating, venue_rating,
--         performance_rating, venue_rating_new, overall_experience_rating, review_type,
--         reaction_emoji, review_text, performance_review_text, venue_review_text,
--         overall_experience_review_text, photos, videos, mood_tags, genre_tags,
--         context_tags, venue_tags, artist_tags, likes_count, comments_count,
--         shares_count, created_at, updated_at, reviewer_name, reviewer_avatar,
--         reviewer_verified, reviewer_account_type, event_title, artist_name,
--         venue_name, event_date, artist_uuid, artist_normalized_name, artist_image_url,
--         artist_url, artist_jambase_id, venue_uuid, venue_normalized_name,
--         venue_image_url, venue_address, venue_geo, maximum_attendee_capacity
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
    e.rating::int,
    CASE 
        WHEN e.artist_rating IS NOT NULL THEN e.artist_rating::int
        ELSE NULL
    END AS artist_rating,
    CASE 
        WHEN e.venue_rating IS NOT NULL THEN e.venue_rating::int
        ELSE NULL
    END AS venue_rating,
    e.performance_rating::numeric(2,1),
    e.venue_rating_new::numeric(2,1),
    e.overall_experience_rating::numeric(2,1),
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
    COALESCE(e.likes_count, 0)::int,
    COALESCE(e.comments_count, 0)::int,
    COALESCE(e.shares_count, 0)::int,
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

-- Step 3: Merge from friends_reviews_simple
-- Schema: review_id (NOT id!), reviewer_id (NOT user_id!), event_id, rating, review_text,
--         is_public, is_draft, photos, likes_count, comments_count, shares_count,
--         created_at, updated_at, reviewer_name, reviewer_avatar, event_title,
--         artist_name, venue_name, event_date, venue_city, venue_state,
--         artist_id (from events), venue_id (from events)
-- Note: This view uses review_id and reviewer_id instead of id and user_id
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
    f.review_id AS id,  -- Use review_id column
    f.reviewer_id AS user_id,  -- Use reviewer_id column
    f.event_id,
    CASE 
        WHEN f.artist_id IS NOT NULL AND f.artist_id != '' THEN f.artist_id::uuid
        ELSE NULL
    END AS artist_id,  -- From events table, cast to uuid
    CASE 
        WHEN f.venue_id IS NOT NULL AND f.venue_id != '' THEN f.venue_id::uuid
        ELSE NULL
    END AS venue_id,  -- From events table, cast to uuid
    f.rating::int,
    NULL::int AS artist_rating,  -- Not in this view
    NULL::int AS venue_rating,  -- Not in this view
    NULL::numeric(2,1) AS performance_rating,  -- Not in this view
    NULL::numeric(2,1) AS venue_rating_new,  -- Not in this view
    NULL::numeric(2,1) AS overall_experience_rating,  -- Not in this view
    NULL AS reaction_emoji,  -- Not in this view
    f.review_text,
    NULL AS performance_review_text,  -- Not in this view
    NULL AS venue_review_text,  -- Not in this view
    NULL AS overall_experience_review_text,  -- Not in this view
    f.photos,
    NULL AS videos,  -- Not in this view
    NULL::text[] AS mood_tags,  -- Not in this view
    NULL::text[] AS genre_tags,  -- Not in this view
    NULL::text[] AS context_tags,  -- Not in this view
    NULL::text[] AS venue_tags,  -- Not in this view
    NULL::text[] AS artist_tags,  -- Not in this view
    NULL AS review_type,  -- Not in this view
    COALESCE(f.likes_count, 0)::int,
    COALESCE(f.comments_count, 0)::int,
    COALESCE(f.shares_count, 0)::int,
    COALESCE(f.is_public, TRUE) AS is_public,
    COALESCE(f.is_draft, FALSE) AS is_draft,
    NULL::text[] AS attendees,
    NULL::int AS rank_order,
    FALSE AS was_there,
    f.created_at,
    f.updated_at,
    '{}'::jsonb AS moderation_metadata
FROM public.friends_reviews_simple f
WHERE NOT EXISTS (
    SELECT 1 FROM public.reviews r WHERE r.id = f.review_id
)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Drop the legacy views (they're no longer needed)
DROP VIEW IF EXISTS public.public_reviews_with_profiles CASCADE;
DROP VIEW IF EXISTS public.enhanced_reviews_with_profiles CASCADE;
DROP VIEW IF EXISTS public.friends_reviews_simple CASCADE;

COMMIT;

-- Verify the merge
SELECT 
    COUNT(*) as total_reviews,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT event_id) as unique_events
FROM public.reviews;
