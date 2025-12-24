-- ============================================
-- FINAL MIGRATION: Remove UUID Foreign Keys, Use Jambase IDs
-- This completes the migration to use Jambase IDs instead of UUIDs
-- for artist and venue references
-- ============================================
--
-- IMPORTANT: Backup your database before running this migration!
--
-- What this migration does:
-- 1. Converts user_reviews.artist_id from UUID to TEXT (Jambase ID)
-- 2. Converts user_reviews.venue_id from UUID to TEXT (Jambase ID)
-- 3. Removes artist_uuid and venue_uuid columns from jambase_events
-- 4. Ensures jambase_events.venue_id is TEXT (not UUID)
-- 5. Updates all views, functions, and triggers to use Jambase IDs
-- 6. Removes foreign key constraints that depend on UUIDs
--
-- After this migration:
-- - All artist/venue references will use Jambase IDs (TEXT)
-- - Joins will be done via: artist_id = artists.jambase_artist_id
-- - Functions already updated in 20250122000002_update_functions_to_use_jambase_ids.sql
--   will now work correctly
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Drop foreign key constraints on user_reviews
-- ============================================
ALTER TABLE public.user_reviews 
  DROP CONSTRAINT IF EXISTS user_reviews_artist_id_fkey;

ALTER TABLE public.user_reviews 
  DROP CONSTRAINT IF EXISTS user_reviews_venue_id_fkey;

-- ============================================
-- STEP 2: Change user_reviews columns from UUID to TEXT
-- ============================================
-- Create temporary TEXT columns
ALTER TABLE public.user_reviews 
  ADD COLUMN IF NOT EXISTS artist_id_jambase TEXT,
  ADD COLUMN IF NOT EXISTS venue_id_jambase TEXT;

-- Populate artist_id_jambase:
-- Option 1: From jambase_events (direct source of truth - preferred)
UPDATE public.user_reviews ur
SET artist_id_jambase = je.artist_id
FROM public.jambase_events je
WHERE ur.event_id = je.id
  AND je.artist_id IS NOT NULL
  AND ur.artist_id_jambase IS NULL;

-- Option 2: If artist_id column exists and is UUID type, look it up in artists table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'user_reviews'
    AND column_name = 'artist_id'
    AND data_type = 'uuid'
  ) THEN
    UPDATE public.user_reviews ur
    SET artist_id_jambase = a.jambase_artist_id
    FROM public.artists a
    WHERE ur.artist_id = a.id
      AND ur.artist_id_jambase IS NULL
      AND a.jambase_artist_id IS NOT NULL;
  END IF;
END $$;

-- Populate venue_id_jambase:
-- Option 1: From jambase_events (direct source of truth - preferred)
UPDATE public.user_reviews ur
SET venue_id_jambase = je.venue_id
FROM public.jambase_events je
WHERE ur.event_id = je.id
  AND je.venue_id IS NOT NULL
  AND ur.venue_id_jambase IS NULL;

-- Option 2: If venue_id column exists and is UUID type, look it up in venues table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'user_reviews'
    AND column_name = 'venue_id'
    AND data_type = 'uuid'
  ) THEN
    UPDATE public.user_reviews ur
    SET venue_id_jambase = v.jambase_venue_id
    FROM public.venues v
    WHERE ur.venue_id = v.id
      AND ur.venue_id_jambase IS NULL
      AND v.jambase_venue_id IS NOT NULL;
  END IF;
END $$;

-- Drop old UUID columns
ALTER TABLE public.user_reviews 
  DROP COLUMN IF EXISTS artist_id,
  DROP COLUMN IF EXISTS venue_id;

-- Rename new columns to original names
ALTER TABLE public.user_reviews 
  RENAME COLUMN artist_id_jambase TO artist_id;

ALTER TABLE public.user_reviews 
  RENAME COLUMN venue_id_jambase TO venue_id;

-- ============================================
-- STEP 4: Drop UUID columns from jambase_events
-- ============================================
ALTER TABLE public.jambase_events 
  DROP COLUMN IF EXISTS artist_uuid,
  DROP COLUMN IF EXISTS venue_uuid;

-- Drop indexes on UUID columns (if they exist)
DROP INDEX IF EXISTS public.idx_jambase_events_artist_uuid;
DROP INDEX IF EXISTS public.idx_jambase_events_venue_uuid;

-- ============================================
-- STEP 5: Ensure jambase_events.venue_id is TEXT (not UUID)
-- ============================================
-- Check if venue_id needs to be converted from UUID to TEXT
-- Note: Based on the schema, venue_id should already be TEXT, but this handles edge cases
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'jambase_events' 
    AND column_name = 'venue_id'
    AND data_type = 'uuid'
  ) THEN
    -- Create temporary column
    ALTER TABLE public.jambase_events 
      ADD COLUMN venue_id_jambase TEXT;
    
    -- Populate from venues table by matching UUID
    UPDATE public.jambase_events je
    SET venue_id_jambase = v.jambase_venue_id
    FROM public.venues v
    WHERE je.venue_id::TEXT = v.id::TEXT
      AND v.jambase_venue_id IS NOT NULL;
    
    -- Drop old column
    ALTER TABLE public.jambase_events 
      DROP COLUMN venue_id;
    
    -- Rename new column
    ALTER TABLE public.jambase_events 
      RENAME COLUMN venue_id_jambase TO venue_id;
      
    RAISE NOTICE 'Converted jambase_events.venue_id from UUID to TEXT';
  ELSE
    RAISE NOTICE 'jambase_events.venue_id is already TEXT, no conversion needed';
  END IF;
END $$;

-- ============================================
-- STEP 6: Recreate indexes on TEXT columns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_reviews_artist_id ON public.user_reviews(artist_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_venue_id ON public.user_reviews(venue_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_artist_id ON public.jambase_events(artist_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_id ON public.jambase_events(venue_id);

-- ============================================
-- STEP 7: Update views that reference UUID columns
-- ============================================
-- Drop and recreate enhanced_reviews_with_profiles view
DROP VIEW IF EXISTS public.enhanced_reviews_with_profiles CASCADE;

CREATE OR REPLACE VIEW public.enhanced_reviews_with_profiles AS
SELECT 
    ur.id,
    ur.user_id,
    ur.event_id,
    ur.venue_id as venue_jambase_id,
    ur.artist_id as artist_jambase_id,
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
    -- Artist data (from normalized artists table, joined by Jambase ID)
    a.id as artist_uuid,
    a.name as artist_normalized_name,
    a.image_url as artist_image_url,
    a.url as artist_url,
    a.jambase_artist_id as artist_jambase_id,
    -- Venue data (from normalized venues table, joined by Jambase ID)
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
LEFT JOIN public.artists a ON ur.artist_id = a.jambase_artist_id
LEFT JOIN public.venues v ON ur.venue_id = v.jambase_venue_id
LEFT JOIN public.venue_profile vp ON ur.venue_id = vp.jambase_venue_id
WHERE ur.is_public = true;

GRANT SELECT ON public.enhanced_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.enhanced_reviews_with_profiles TO anon;

-- ============================================
-- STEP 8: Update functions that use UUID parameters
-- ============================================
-- Update get_artist_for_review to use Jambase ID
CREATE OR REPLACE FUNCTION public.get_artist_for_review(review_id UUID)
RETURNS TABLE (
    artist_jambase_id TEXT,
    artist_name TEXT,
    artist_image_url TEXT,
    artist_url TEXT,
    artist_uuid UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.artist_id as artist_jambase_id,
        a.name as artist_name,
        a.image_url as artist_image_url,
        a.url as artist_url,
        a.id as artist_uuid
    FROM public.user_reviews ur
    LEFT JOIN public.artists a ON ur.artist_id = a.jambase_artist_id
    WHERE ur.id = review_id;
END;
$$ LANGUAGE plpgsql;

-- Update get_venue_for_review to use Jambase ID
CREATE OR REPLACE FUNCTION public.get_venue_for_review(review_id UUID)
RETURNS TABLE (
    venue_jambase_id TEXT,
    venue_name TEXT,
    venue_image_url TEXT,
    venue_address TEXT,
    venue_city TEXT,
    venue_state TEXT,
    venue_uuid UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.venue_id as venue_jambase_id,
        v.name as venue_name,
        v.image_url as venue_image_url,
        v.address as venue_address,
        v.city as venue_city,
        v.state as venue_state,
        v.id as venue_uuid
    FROM public.user_reviews ur
    LEFT JOIN public.venues v ON ur.venue_id = v.jambase_venue_id
    WHERE ur.id = review_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 9: Update triggers to use Jambase IDs
-- ============================================
-- Update auto_populate_review_artist_id trigger
CREATE OR REPLACE FUNCTION public.auto_populate_review_artist_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If artist_id is not provided, try to populate it from the event (using Jambase ID)
    IF NEW.artist_id IS NULL THEN
        SELECT je.artist_id INTO NEW.artist_id
        FROM public.jambase_events je
        WHERE je.id = NEW.event_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Update auto_populate_review_venue_id trigger
CREATE OR REPLACE FUNCTION public.auto_populate_review_venue_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If venue_id is not provided, try to populate it from the event (using Jambase ID)
    IF NEW.venue_id IS NULL THEN
        SELECT je.venue_id INTO NEW.venue_id
        FROM public.jambase_events je
        WHERE je.id = NEW.event_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- ============================================
-- STEP 10: Update relationship_summary view
-- ============================================
DROP VIEW IF EXISTS public.relationship_summary CASCADE;

CREATE OR REPLACE VIEW public.relationship_summary AS
SELECT 
    'artists' as table_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT je.id) FILTER (WHERE je.artist_id = a.jambase_artist_id) as linked_to_events,
    COUNT(DISTINCT ur.id) FILTER (WHERE ur.artist_id = a.jambase_artist_id) as linked_to_reviews
FROM public.artists a
LEFT JOIN public.jambase_events je ON a.jambase_artist_id = je.artist_id
LEFT JOIN public.user_reviews ur ON a.jambase_artist_id = ur.artist_id

UNION ALL

SELECT 
    'venues' as table_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT je.id) FILTER (WHERE je.venue_id = v.jambase_venue_id) as linked_to_events,
    COUNT(DISTINCT ur.id) FILTER (WHERE ur.venue_id = v.jambase_venue_id) as linked_to_reviews
FROM public.venues v
LEFT JOIN public.jambase_events je ON v.jambase_venue_id = je.venue_id
LEFT JOIN public.user_reviews ur ON v.jambase_venue_id = ur.venue_id

UNION ALL

SELECT 
    'jambase_events' as table_name,
    COUNT(*) as total_records,
    COUNT(artist_id) FILTER (WHERE artist_id IS NOT NULL) as with_artist_id,
    COUNT(venue_id) FILTER (WHERE venue_id IS NOT NULL) as with_venue_id
FROM public.jambase_events

UNION ALL

SELECT 
    'user_reviews' as table_name,
    COUNT(*) as total_records,
    COUNT(artist_id) FILTER (WHERE artist_id IS NOT NULL) as with_artist_id,
    COUNT(venue_id) FILTER (WHERE venue_id IS NOT NULL) as with_venue_id
FROM public.user_reviews;

GRANT SELECT ON public.relationship_summary TO authenticated;
GRANT SELECT ON public.relationship_summary TO anon;

-- ============================================
-- STEP 11: Add comments for documentation
-- ============================================
COMMENT ON COLUMN public.user_reviews.artist_id IS 'JamBase artist ID (TEXT) - references artists.jambase_artist_id';
COMMENT ON COLUMN public.user_reviews.venue_id IS 'JamBase venue ID (TEXT) - references venues.jambase_venue_id';
COMMENT ON COLUMN public.jambase_events.artist_id IS 'JamBase artist ID (TEXT) - references artists.jambase_artist_id';
COMMENT ON COLUMN public.jambase_events.venue_id IS 'JamBase venue ID (TEXT) - references venues.jambase_venue_id';

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the migration was successful:

-- Check column types
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('user_reviews', 'jambase_events')
  AND column_name IN ('artist_id', 'venue_id', 'artist_uuid', 'venue_uuid')
ORDER BY table_name, column_name;

-- Check that user_reviews has Jambase IDs
SELECT 
    COUNT(*) as total_reviews,
    COUNT(artist_id) FILTER (WHERE artist_id IS NOT NULL) as with_artist_jambase_id,
    COUNT(venue_id) FILTER (WHERE venue_id IS NOT NULL) as with_venue_jambase_id
FROM public.user_reviews;

-- Check that joins work correctly
SELECT 
    ur.id,
    ur.artist_id as review_artist_jambase_id,
    a.name as artist_name,
    ur.venue_id as review_venue_jambase_id,
    v.name as venue_name
FROM public.user_reviews ur
LEFT JOIN public.artists a ON ur.artist_id = a.jambase_artist_id
LEFT JOIN public.venues v ON ur.venue_id = v.jambase_venue_id
LIMIT 10;

