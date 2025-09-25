-- MINIMAL FIX: Add artist_id column to user_reviews and populate it
-- This is the smallest change that enables proper artist/venue linking

-- Step 1: Add artist_id column to user_reviews (if not exists)
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;

-- Step 2: Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_id ON public.user_reviews(artist_id);

-- Step 3: Create function to populate artist_id from jambase_events
CREATE OR REPLACE FUNCTION public.populate_review_artist_ids()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update user_reviews with artist UUIDs by matching JamBase IDs
    UPDATE public.user_reviews 
    SET artist_id = a.id
    FROM public.jambase_events je
    JOIN public.artists a ON je.artist_id = a.jambase_artist_id
    WHERE user_reviews.event_id = je.id
    AND user_reviews.artist_id IS NULL
    AND je.artist_id IS NOT NULL;
END;
$$;

-- Step 4: Create function to populate venue_id from jambase_events (if not already populated)
CREATE OR REPLACE FUNCTION public.populate_review_venue_ids()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update user_reviews with venue UUIDs by matching JamBase IDs
    UPDATE public.user_reviews 
    SET venue_id = v.id
    FROM public.jambase_events je
    JOIN public.venues v ON je.venue_id = v.jambase_venue_id
    WHERE user_reviews.event_id = je.id
    AND user_reviews.venue_id IS NULL
    AND je.venue_id IS NOT NULL;
END;
$$;

-- Step 5: Create enhanced view with proper artist/venue data
CREATE OR REPLACE VIEW public.enhanced_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id,
    ur.artist_id,
    ur.rating,
    ur.artist_rating,
    ur.venue_rating,
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
    -- User profile data
    p.name as reviewer_name,
    p.avatar_url as reviewer_avatar,
    -- Event data
    je.title as event_title,
    je.artist_name,
    je.venue_name,
    je.event_date,
    -- Artist data (from normalized artists table)
    a.id as artist_uuid,
    a.name as artist_normalized_name,
    a.image_url as artist_image_url,
    a.url as artist_url,
    -- Venue data (from normalized venues table)  
    v.id as venue_uuid,
    v.name as venue_normalized_name,
    v.image_url as venue_image_url,
    v.address as venue_address,
    v.city as venue_city,
    v.state as venue_state
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
LEFT JOIN public.artists a ON ur.artist_id = a.id
LEFT JOIN public.venues v ON ur.venue_id = v.id
WHERE ur.is_public = true;

-- Step 6: Grant permissions
GRANT SELECT ON public.enhanced_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.enhanced_reviews_with_profiles TO anon;
GRANT EXECUTE ON FUNCTION public.populate_review_artist_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.populate_review_venue_ids TO authenticated;

-- Step 7: Run population functions
SELECT public.populate_review_artist_ids();
SELECT public.populate_review_venue_ids();

-- Step 8: Add comments
COMMENT ON COLUMN public.user_reviews.artist_id IS 'Foreign key to artists table for clickable artist links';
COMMENT ON VIEW public.enhanced_reviews_with_profiles IS 'Enhanced view with proper artist/venue relationships for clickable links';
