-- ============================================
-- EXTRACT GENRES FROM USER INTERACTIONS
-- ============================================
-- Since artist_genre_mapping is empty, extract genres from user_artist_interactions
-- and aggregate them back to artists. This creates a fallback source of genre data.

-- ============================================
-- DIAGNOSTIC: Check for available genre data
-- ============================================
SELECT 
  'user_artist_interactions with genres' as source_table,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as records_with_genres,
  COUNT(*) as total_records
FROM public.user_artist_interactions

UNION ALL

SELECT 
  'user_song_interactions with genres' as source_table,
  COUNT(*) FILTER (WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as records_with_genres,
  COUNT(*) as total_records
FROM public.user_song_interactions

UNION ALL

SELECT 
  'user_genre_preferences (artist source)' as source_table,
  COUNT(*) FILTER (WHERE source_entity_type = 'artist') as records_with_genres,
  COUNT(*) as total_records
FROM public.user_genre_preferences

UNION ALL

SELECT 
  'user_genre_interactions with artist_ids' as source_table,
  COUNT(*) FILTER (WHERE array_length(artist_ids, 1) > 0) as records_with_genres,
  COUNT(*) as total_records
FROM public.user_genre_interactions;

-- ============================================
-- 1. EXTRACT GENRES FROM user_artist_interactions TO artists
-- ============================================
-- Aggregate genres from all user interactions with each artist
-- This creates genre data by looking at what genres users associated with artists
UPDATE public.artists a
SET genres = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(genres)
      FROM public.user_artist_interactions
      WHERE artist_id = a.id
        AND genres IS NOT NULL
        AND array_length(genres, 1) > 0
    )
  ),
    updated_at = now()
WHERE (a.genres IS NULL OR array_length(a.genres, 1) = 0)
  AND EXISTS (
    SELECT 1 FROM public.user_artist_interactions
    WHERE artist_id = a.id
      AND genres IS NOT NULL
      AND array_length(genres, 1) > 0
  );

-- ============================================
-- 2. EXTRACT GENRES FROM user_song_interactions TO artists
-- ============================================
-- Aggregate genres from songs by artists that users interacted with
-- Match artists by name or ID if available (artist_ids is TEXT[] in user_song_interactions)
UPDATE public.artists a
SET genres = COALESCE(
    a.genres,
    ARRAY[]::TEXT[]
  ) || (
    SELECT ARRAY(
      SELECT DISTINCT unnest(genres)
      FROM public.user_song_interactions
      WHERE (a.id::TEXT = ANY(artist_ids) OR 
             a.name = ANY(artist_names))
        AND genres IS NOT NULL
        AND array_length(genres, 1) > 0
    )
  ),
    updated_at = now()
WHERE (a.genres IS NULL OR array_length(a.genres, 1) = 0)
  AND EXISTS (
    SELECT 1 FROM public.user_song_interactions
    WHERE (a.id::TEXT = ANY(artist_ids) OR 
           a.name = ANY(artist_names))
      AND genres IS NOT NULL
      AND array_length(genres, 1) > 0
  );

-- Remove duplicates from aggregated arrays
UPDATE public.artists
SET genres = ARRAY(SELECT DISTINCT unnest(genres))
WHERE genres IS NOT NULL
  AND array_length(genres, 1) > 0;

-- ============================================
-- 3. EXTRACT GENRES FROM user_genre_preferences TO artists
-- ============================================
-- Aggregate genres from user preferences where source_entity_type is 'artist'
-- This creates artist genres from user preference signals
UPDATE public.artists a
SET genres = COALESCE(
    a.genres,
    ARRAY[]::TEXT[]
  ) || ARRAY(
    SELECT DISTINCT genre
    FROM public.user_genre_preferences
    WHERE source_entity_type = 'artist'
      AND source_entity_id::UUID = a.id
  ),
    updated_at = now()
WHERE EXISTS (
    SELECT 1 FROM public.user_genre_preferences
    WHERE source_entity_type = 'artist'
      AND source_entity_id::UUID = a.id
  );

-- ============================================
-- 3b. EXTRACT GENRES FROM user_genre_interactions TO artists
-- ============================================
-- Aggregate genres from user genre interactions where artist_ids contains this artist
-- This creates artist genres from user genre exposure signals
UPDATE public.artists a
SET genres = COALESCE(
    a.genres,
    ARRAY[]::TEXT[]
  ) || ARRAY(
    SELECT DISTINCT genre
    FROM public.user_genre_interactions
    WHERE a.id = ANY(artist_ids)
  ),
    updated_at = now()
WHERE (a.genres IS NULL OR array_length(a.genres, 1) = 0)
  AND EXISTS (
    SELECT 1 FROM public.user_genre_interactions
    WHERE a.id = ANY(artist_ids)
  );

-- Remove duplicates again
UPDATE public.artists
SET genres = ARRAY(SELECT DISTINCT unnest(genres))
WHERE genres IS NOT NULL
  AND array_length(genres, 1) > 0;

-- ============================================
-- 4. POPULATE artist_genre_mapping FROM artists
-- ============================================
-- Now that artists have genres, populate artist_genre_mapping as the master reference
-- This ensures artist_genre_mapping has the aggregated genre data
INSERT INTO public.artist_genre_mapping (
  id,
  artist_id,
  artist_name,
  jambase_artist_id,
  genres,
  source,
  last_updated
)
SELECT 
  gen_random_uuid(),
  a.id,
  a.name,
  a.jambase_artist_id,
  a.genres,
  'extracted' as source,  -- Mark as extracted from user interactions
  now()
FROM public.artists a
WHERE a.genres IS NOT NULL
  AND array_length(a.genres, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.artist_genre_mapping agm
    WHERE agm.artist_id = a.id
  )
ON CONFLICT (artist_id) DO UPDATE
SET genres = EXCLUDED.genres,
    last_updated = now(),
    source = 'extracted';

-- ============================================
-- 5. SYNC GENRES FROM artists TO events
-- ============================================
-- Now that artists have genres, populate events from artists
UPDATE public.events e
SET genres = a.genres,
    updated_at = now()
FROM public.artists a
WHERE (e.artist_uuid = a.id OR e.artist_id = a.jambase_artist_id)
  AND (e.genres IS NULL OR array_length(e.genres, 1) = 0)
  AND a.genres IS NOT NULL 
  AND array_length(a.genres, 1) > 0;

-- ============================================
-- 6. POPULATE VENUE GENRES FROM EVENTS (updated)
-- ============================================
-- Calculate typical_genres for venues based on genres of events at those venues
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

