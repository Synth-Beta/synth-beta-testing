-- Fix Artist/Venue Relationships for Review System
-- This migration establishes proper foreign key relationships between reviews and artist/venue data
-- to enable clickable artist/venue links in review displays

-- Step 1: Add missing artist_id column to user_reviews table
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL;

-- Step 2: Create indexes for the new foreign key
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_id ON public.user_reviews(artist_id);

-- Step 3: Add foreign key columns to jambase_events for proper relationships
DO $$
BEGIN
    -- Add artist_uuid column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jambase_events' 
        AND column_name = 'artist_uuid'
    ) THEN
        ALTER TABLE public.jambase_events 
        ADD COLUMN artist_uuid UUID REFERENCES public.artists(id) ON DELETE SET NULL;
    END IF;

    -- Add venue_uuid column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jambase_events' 
        AND column_name = 'venue_uuid'
    ) THEN
        ALTER TABLE public.jambase_events 
        ADD COLUMN venue_uuid UUID REFERENCES public.venues(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Step 4: Create indexes for the new foreign keys in jambase_events
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_uuid ON public.jambase_events(artist_uuid);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_uuid ON public.jambase_events(venue_uuid);

-- Step 5: Create function to populate artist_uuid and venue_uuid in jambase_events
CREATE OR REPLACE FUNCTION public.populate_artist_venue_uuids()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update jambase_events with artist UUIDs by matching JamBase IDs
    UPDATE public.jambase_events 
    SET artist_uuid = a.id
    FROM public.artists a
    WHERE jambase_events.artist_id = a.jambase_artist_id
    AND jambase_events.artist_uuid IS NULL
    AND jambase_events.artist_id IS NOT NULL;

    -- Update jambase_events with venue UUIDs by matching JamBase IDs
    UPDATE public.jambase_events 
    SET venue_uuid = v.id
    FROM public.venues v
    WHERE jambase_events.venue_id = v.jambase_venue_id
    AND jambase_events.venue_uuid IS NULL
    AND jambase_events.venue_id IS NOT NULL;

    -- Log the results
    RAISE NOTICE 'Updated jambase_events with artist/venue UUIDs';
END;
$$;

-- Step 6: Create function to populate artist_id in user_reviews
CREATE OR REPLACE FUNCTION public.populate_review_artist_ids()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update user_reviews with artist UUIDs from jambase_events
    UPDATE public.user_reviews 
    SET artist_id = je.artist_uuid
    FROM public.jambase_events je
    WHERE user_reviews.event_id = je.id
    AND je.artist_uuid IS NOT NULL
    AND user_reviews.artist_id IS NULL;

    -- Log the results
    RAISE NOTICE 'Updated user_reviews with artist UUIDs';
END;
$$;

-- Step 7: Create function to populate venue_id in user_reviews
CREATE OR REPLACE FUNCTION public.populate_review_venue_ids()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update user_reviews with venue UUIDs from jambase_events
    UPDATE public.user_reviews 
    SET venue_id = je.venue_uuid
    FROM public.jambase_events je
    WHERE user_reviews.event_id = je.id
    AND je.venue_uuid IS NOT NULL
    AND user_reviews.venue_id IS NULL;

    -- Log the results
    RAISE NOTICE 'Updated user_reviews with venue UUIDs';
END;
$$;

-- Step 8: Create enhanced view with proper artist/venue relationships
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
    a.jambase_artist_id as artist_jambase_id,
    -- Venue data (from normalized venues table)
    v.id as venue_uuid,
    v.name as venue_normalized_name,
    v.image_url as venue_image_url,
    v.address as venue_address,
    v.city as venue_city,
    v.state as venue_state,
    v.jambase_venue_id as venue_jambase_id,
    -- Venue profile data (if available)
    vp.name as venue_profile_name,
    vp.address as venue_profile_address,
    vp.maximum_attendee_capacity
FROM public.user_reviews ur
JOIN public.profiles p ON ur.user_id = p.user_id
LEFT JOIN public.jambase_events je ON ur.event_id = je.id
LEFT JOIN public.artists a ON ur.artist_id = a.id
LEFT JOIN public.venues v ON ur.venue_id = v.id
LEFT JOIN public.venue_profile vp ON ur.venue_id = vp.id
WHERE ur.is_public = true;

-- Step 9: Grant permissions on the new view
GRANT SELECT ON public.enhanced_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.enhanced_reviews_with_profiles TO anon;

-- Step 10: Create function to get artist profile data for reviews
CREATE OR REPLACE FUNCTION public.get_artist_for_review(review_id UUID)
RETURNS TABLE (
    artist_id UUID,
    artist_name TEXT,
    artist_image_url TEXT,
    artist_url TEXT,
    jambase_artist_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as artist_id,
        a.name as artist_name,
        a.image_url as artist_image_url,
        a.url as artist_url,
        a.jambase_artist_id
    FROM public.user_reviews ur
    LEFT JOIN public.artists a ON ur.artist_id = a.id
    WHERE ur.id = review_id;
END;
$$ LANGUAGE plpgsql;

-- Step 11: Create function to get venue profile data for reviews
CREATE OR REPLACE FUNCTION public.get_venue_for_review(review_id UUID)
RETURNS TABLE (
    venue_id UUID,
    venue_name TEXT,
    venue_image_url TEXT,
    venue_address TEXT,
    venue_city TEXT,
    venue_state TEXT,
    jambase_venue_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id as venue_id,
        v.name as venue_name,
        v.image_url as venue_image_url,
        v.address as venue_address,
        v.city as venue_city,
        v.state as venue_state,
        v.jambase_venue_id
    FROM public.user_reviews ur
    LEFT JOIN public.venues v ON ur.venue_id = v.id
    WHERE ur.id = review_id;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Create function to get events for an artist (for the artist card)
CREATE OR REPLACE FUNCTION public.get_artist_events(artist_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    venue_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    venue_city TEXT,
    venue_state TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        je.id as event_id,
        je.title as event_title,
        je.venue_name,
        je.event_date,
        je.venue_city,
        je.venue_state
    FROM public.jambase_events je
    WHERE je.artist_uuid = artist_uuid
    ORDER BY je.event_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Step 13: Create function to get events for a venue (for the venue card)
CREATE OR REPLACE FUNCTION public.get_venue_events(venue_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    artist_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    venue_city TEXT,
    venue_state TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        je.id as event_id,
        je.title as event_title,
        je.artist_name,
        je.event_date,
        je.venue_city,
        je.venue_state
    FROM public.jambase_events je
    WHERE je.venue_uuid = venue_uuid
    ORDER BY je.event_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Step 14: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.populate_artist_venue_uuids TO authenticated;
GRANT EXECUTE ON FUNCTION public.populate_review_artist_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.populate_review_venue_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_for_review TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_for_review TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_events TO authenticated;

-- Step 15: Add comments for documentation
COMMENT ON COLUMN public.user_reviews.artist_id IS 'Foreign key reference to artists table for clickable artist links';
COMMENT ON COLUMN public.jambase_events.artist_uuid IS 'Foreign key reference to artists table for normalized artist data';
COMMENT ON COLUMN public.jambase_events.venue_uuid IS 'Foreign key reference to venues table for normalized venue data';
COMMENT ON VIEW public.enhanced_reviews_with_profiles IS 'Enhanced view with proper artist/venue relationships for clickable links';
COMMENT ON FUNCTION public.get_artist_events IS 'Get events for an artist to populate artist cards';
COMMENT ON FUNCTION public.get_venue_events IS 'Get events for a venue to populate venue cards';

-- Step 16: Create triggers to automatically populate artist_id and venue_id when reviews are created
CREATE OR REPLACE FUNCTION public.auto_populate_review_artist_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If artist_id is not provided, try to populate it from the event
    IF NEW.artist_id IS NULL THEN
        SELECT je.artist_uuid INTO NEW.artist_id
        FROM public.jambase_events je
        WHERE je.id = NEW.event_id;
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_populate_review_venue_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If venue_id is not provided, try to populate it from the event
    IF NEW.venue_id IS NULL THEN
        SELECT je.venue_uuid INTO NEW.venue_id
        FROM public.jambase_events je
        WHERE je.id = NEW.event_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create the triggers
DROP TRIGGER IF EXISTS auto_populate_review_artist_id_trigger ON public.user_reviews;
CREATE TRIGGER auto_populate_review_artist_id_trigger
    BEFORE INSERT ON public.user_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_populate_review_artist_id();

DROP TRIGGER IF EXISTS auto_populate_review_venue_id_trigger ON public.user_reviews;
CREATE TRIGGER auto_populate_review_venue_id_trigger
    BEFORE INSERT ON public.user_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_populate_review_venue_id();

-- Step 17: Run the population functions to backfill existing data
SELECT public.populate_artist_venue_uuids();
SELECT public.populate_review_artist_ids();
SELECT public.populate_review_venue_ids();

-- Step 18: Create a summary view for debugging
CREATE OR REPLACE VIEW public.relationship_summary AS
SELECT 
    'artists' as table_name,
    COUNT(*) as total_records,
    COUNT(je.artist_uuid) as linked_to_events,
    COUNT(ur.artist_id) as linked_to_reviews
FROM public.artists a
LEFT JOIN public.jambase_events je ON a.id = je.artist_uuid
LEFT JOIN public.user_reviews ur ON a.id = ur.artist_id

UNION ALL

SELECT 
    'venues' as table_name,
    COUNT(*) as total_records,
    COUNT(je.venue_uuid) as linked_to_events,
    COUNT(ur.venue_id) as linked_to_reviews
FROM public.venues v
LEFT JOIN public.jambase_events je ON v.id = je.venue_uuid
LEFT JOIN public.user_reviews ur ON v.id = ur.venue_id

UNION ALL

SELECT 
    'jambase_events' as table_name,
    COUNT(*) as total_records,
    COUNT(artist_uuid) as with_artist_uuid,
    COUNT(venue_uuid) as with_venue_uuid
FROM public.jambase_events

UNION ALL

SELECT 
    'user_reviews' as table_name,
    COUNT(*) as total_records,
    COUNT(artist_id) as with_artist_id,
    COUNT(venue_id) as with_venue_id
FROM public.user_reviews;

-- Grant access to the summary view
GRANT SELECT ON public.relationship_summary TO authenticated;
GRANT SELECT ON public.relationship_summary TO anon;
