-- ============================================
-- ENSURE GENRE COLUMNS ON SOURCE TABLES
-- ============================================
-- Ensures artists, events, and venues have genre columns for denormalized fast filtering
-- Syncs genres from artist_genre_mapping to artists table

-- ============================================
-- 1. ENSURE ARTISTS TABLE HAS GENRES COLUMN
-- ============================================
-- Check if genres column exists, add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'artists' 
    AND column_name = 'genres'
  ) THEN
    ALTER TABLE public.artists ADD COLUMN genres TEXT[];
    CREATE INDEX IF NOT EXISTS idx_artists_genres ON public.artists USING GIN(genres);
    COMMENT ON COLUMN public.artists.genres IS 'Array of genre names - denormalized for fast filtering';
  END IF;
END $$;

-- ============================================
-- 2. ENSURE EVENTS TABLE HAS GENRES COLUMN
-- ============================================
-- Check if genres column exists, add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'events' 
    AND column_name = 'genres'
  ) THEN
    ALTER TABLE public.events ADD COLUMN genres TEXT[];
    CREATE INDEX IF NOT EXISTS idx_events_genres ON public.events USING GIN(genres);
    COMMENT ON COLUMN public.events.genres IS 'Array of genre names - denormalized for fast filtering';
  END IF;
END $$;

-- ============================================
-- 3. ENSURE VENUES TABLE HAS GENRES COLUMN
-- ============================================
-- Check if genres column exists, add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'venues' 
    AND column_name = 'typical_genres'
  ) THEN
    ALTER TABLE public.venues ADD COLUMN typical_genres TEXT[];
    CREATE INDEX IF NOT EXISTS idx_venues_typical_genres ON public.venues USING GIN(typical_genres);
    COMMENT ON COLUMN public.venues.typical_genres IS 'Array of typical genre names for this venue - denormalized for fast filtering';
  END IF;
END $$;

-- ============================================
-- 4. SYNC GENRES FROM artist_genre_mapping TO artists
-- ============================================
-- Populate artists.genres from artist_genre_mapping if mapping exists
-- Only updates artists that don't have genres set
UPDATE public.artists a
SET genres = agm.genres,
    updated_at = now()
FROM public.artist_genre_mapping agm
WHERE a.id = agm.artist_id
  AND (a.genres IS NULL OR array_length(a.genres, 1) = 0)
  AND agm.genres IS NOT NULL 
  AND array_length(agm.genres, 1) > 0;

-- ============================================
-- 4b. SYNC GENRES FROM artist_profile TO artists (if artist_genre_mapping is empty)
-- ============================================
-- Populate artists.genres from artist_profile if artist_profile exists and has genres
-- Only updates artists that don't have genres set
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'artist_profile'
  ) THEN
    UPDATE public.artists a
    SET genres = ap.genres,
        updated_at = now()
    FROM public.artist_profile ap
    WHERE a.jambase_artist_id = ap.jambase_artist_id
      AND (a.genres IS NULL OR array_length(a.genres, 1) = 0)
      AND ap.genres IS NOT NULL 
      AND array_length(ap.genres, 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.artist_genre_mapping agm
        WHERE agm.artist_id = a.id
          AND agm.genres IS NOT NULL
          AND array_length(agm.genres, 1) > 0
      );
  END IF;
END $$;

-- ============================================
-- 5. SYNC GENRES FROM artists TO events
-- ============================================
-- Populate events.genres from associated artist genres if event doesn't have genres
-- Only updates events that don't have genres set
-- First try from artists.genres (already synced)
UPDATE public.events e
SET genres = a.genres,
    updated_at = now()
FROM public.artists a
WHERE (e.artist_uuid = a.id OR e.artist_id = a.jambase_artist_id)
  AND (e.genres IS NULL OR array_length(e.genres, 1) = 0)
  AND a.genres IS NOT NULL 
  AND array_length(a.genres, 1) > 0;

-- If events still don't have genres, try from artist_profile directly (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'artist_profile'
  ) THEN
    UPDATE public.events e
    SET genres = ap.genres,
        updated_at = now()
    FROM public.artist_profile ap
    WHERE e.artist_id = ap.jambase_artist_id
      AND (e.genres IS NULL OR array_length(e.genres, 1) = 0)
      AND ap.genres IS NOT NULL 
      AND array_length(ap.genres, 1) > 0;
  END IF;
END $$;

-- If events still don't have genres, try from artist_genre_mapping
UPDATE public.events e
SET genres = agm.genres,
    updated_at = now()
FROM public.artist_genre_mapping agm
INNER JOIN public.artists a ON agm.artist_id = a.id
WHERE (e.artist_uuid = a.id OR e.artist_id = a.jambase_artist_id)
  AND (e.genres IS NULL OR array_length(e.genres, 1) = 0)
  AND agm.genres IS NOT NULL 
  AND array_length(agm.genres, 1) > 0;

-- ============================================
-- 6. POPULATE VENUE GENRES FROM EVENTS
-- ============================================
-- Calculate typical_genres for venues based on genres of events at those venues
-- This aggregates genres from all events at each venue
UPDATE public.venues v
SET typical_genres = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(genres)
      FROM public.events
      WHERE (venue_uuid = v.id OR venue_id = v.jambase_venue_id)
        AND genres IS NOT NULL
        AND array_length(genres, 1) > 0
    )
  )
WHERE (v.typical_genres IS NULL OR array_length(v.typical_genres, 1) = 0)
  AND EXISTS (
    SELECT 1 FROM public.events
    WHERE (venue_uuid = v.id OR venue_id = v.jambase_venue_id)
      AND genres IS NOT NULL
      AND array_length(genres, 1) > 0
  );

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
SELECT 
  'artists with genres' as check_type,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as has_genres,
  COUNT(*) as total_artists
FROM public.artists

UNION ALL

SELECT 
  'events with genres' as check_type,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as has_genres,
  COUNT(*) as total_events
FROM public.events

UNION ALL

SELECT 
  'venues with typical_genres' as check_type,
  COUNT(*) FILTER (WHERE typical_genres IS NOT NULL AND array_length(typical_genres, 1) > 0) as has_genres,
  COUNT(*) as total_venues
FROM public.venues

UNION ALL

SELECT 
  'artist_genre_mapping count' as check_type,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as has_genres,
  COUNT(*) as total_artists
FROM public.artist_genre_mapping;

