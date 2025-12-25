-- ============================================================
-- SCENES 3NF NORMALIZATION MIGRATION
-- Normalizes scenes table by removing array columns and
-- creating a proper junction table for participants
-- ============================================================

-- ============================================================
-- 1. CREATE SCENE_PARTICIPANTS TABLE (3NF)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scene_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  
  -- Participant type discriminator
  participant_type TEXT NOT NULL CHECK (participant_type IN ('artist', 'venue', 'city', 'genre')),
  
  -- For artists and venues: use UUID foreign keys
  artist_id UUID REFERENCES public.artists(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  
  -- For cities and genres: use text values
  text_value TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  -- Ensure exactly one of artist_id, venue_id, or text_value is set based on type
  CONSTRAINT valid_artist_participant CHECK (
    (participant_type = 'artist' AND artist_id IS NOT NULL AND venue_id IS NULL AND text_value IS NULL) OR
    (participant_type != 'artist')
  ),
  CONSTRAINT valid_venue_participant CHECK (
    (participant_type = 'venue' AND venue_id IS NOT NULL AND artist_id IS NULL AND text_value IS NULL) OR
    (participant_type != 'venue')
  ),
  CONSTRAINT valid_city_participant CHECK (
    (participant_type = 'city' AND text_value IS NOT NULL AND artist_id IS NULL AND venue_id IS NULL) OR
    (participant_type != 'city')
  ),
  CONSTRAINT valid_genre_participant CHECK (
    (participant_type = 'genre' AND text_value IS NOT NULL AND artist_id IS NULL AND venue_id IS NULL) OR
    (participant_type != 'genre')
  )
  -- Note: Unique constraints are enforced via partial unique indexes below
);

-- Indexes for scene_participants
CREATE INDEX IF NOT EXISTS idx_scene_participants_scene_id ON public.scene_participants(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_participants_type ON public.scene_participants(participant_type);
CREATE INDEX IF NOT EXISTS idx_scene_participants_artist_id ON public.scene_participants(artist_id) WHERE artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scene_participants_venue_id ON public.scene_participants(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scene_participants_text_value ON public.scene_participants(text_value) WHERE text_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scene_participants_composite ON public.scene_participants(scene_id, participant_type);

-- Partial unique indexes to ensure unique participants per scene
-- For artists: unique by scene_id + artist_id (only when artist_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_artist_participant 
  ON public.scene_participants(scene_id, artist_id) 
  WHERE artist_id IS NOT NULL;

-- For venues: unique by scene_id + venue_id (only when venue_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_venue_participant 
  ON public.scene_participants(scene_id, venue_id) 
  WHERE venue_id IS NOT NULL;

-- For cities/genres: unique by scene_id + participant_type + text_value (only when text_value is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_text_participant 
  ON public.scene_participants(scene_id, participant_type, text_value) 
  WHERE text_value IS NOT NULL;

-- ============================================================
-- 2. MIGRATE EXISTING DATA FROM ARRAYS TO SCENE_PARTICIPANTS
-- ============================================================

-- Migrate artists
-- Try to match by identifier first, then by name
INSERT INTO public.scene_participants (scene_id, participant_type, artist_id, text_value)
SELECT DISTINCT
  s.id as scene_id,
  'artist'::TEXT as participant_type,
  a.id as artist_id,
  NULL as text_value
FROM public.scenes s
CROSS JOIN LATERAL UNNEST(s.participating_artists) AS artist_value
LEFT JOIN public.artists a ON (
  -- Try matching by identifier (may contain jambase: prefix)
  a.identifier = artist_value
  OR a.identifier = 'jambase:' || artist_value
  OR artist_value = 'jambase:' || a.identifier
  -- Try matching by name (case-insensitive)
  OR LOWER(TRIM(a.name)) = LOWER(TRIM(artist_value))
)
WHERE s.participating_artists IS NOT NULL
  AND array_length(s.participating_artists, 1) > 0
  AND a.id IS NOT NULL
  -- Use NOT EXISTS to avoid conflicts since partial unique indexes don't work with ON CONFLICT
  AND NOT EXISTS (
    SELECT 1 FROM public.scene_participants sp
    WHERE sp.scene_id = s.id AND sp.artist_id = a.id
  );

-- Migrate venues
-- Try to match by identifier first, then by name
INSERT INTO public.scene_participants (scene_id, participant_type, venue_id, text_value)
SELECT DISTINCT
  s.id as scene_id,
  'venue'::TEXT as participant_type,
  v.id as venue_id,
  NULL as text_value
FROM public.scenes s
CROSS JOIN LATERAL UNNEST(s.participating_venues) AS venue_value
LEFT JOIN public.venues v ON (
  -- Try matching by identifier (may contain jambase: prefix)
  v.identifier = venue_value
  OR v.identifier = 'jambase:' || venue_value
  OR venue_value = 'jambase:' || v.identifier
  -- Try matching by name (case-insensitive)
  OR LOWER(TRIM(v.name)) = LOWER(TRIM(venue_value))
)
WHERE s.participating_venues IS NOT NULL
  AND array_length(s.participating_venues, 1) > 0
  AND v.id IS NOT NULL
  -- Use NOT EXISTS to avoid conflicts since partial unique indexes don't work with ON CONFLICT
  AND NOT EXISTS (
    SELECT 1 FROM public.scene_participants sp
    WHERE sp.scene_id = s.id AND sp.venue_id = v.id
  );

-- Migrate cities (text values)
INSERT INTO public.scene_participants (scene_id, participant_type, artist_id, venue_id, text_value)
SELECT DISTINCT
  s.id as scene_id,
  'city'::TEXT as participant_type,
  NULL::UUID as artist_id,
  NULL::UUID as venue_id,
  city_value as text_value
FROM public.scenes s
CROSS JOIN LATERAL UNNEST(s.participating_cities) AS city_value
WHERE s.participating_cities IS NOT NULL
  AND array_length(s.participating_cities, 1) > 0
  AND city_value IS NOT NULL
  AND TRIM(city_value) != ''
  -- Use NOT EXISTS to avoid conflicts since partial unique indexes don't work with ON CONFLICT
  AND NOT EXISTS (
    SELECT 1 FROM public.scene_participants sp
    WHERE sp.scene_id = s.id 
      AND sp.participant_type = 'city' 
      AND sp.text_value = city_value
  );

-- Migrate genres (text values)
INSERT INTO public.scene_participants (scene_id, participant_type, artist_id, venue_id, text_value)
SELECT DISTINCT
  s.id as scene_id,
  'genre'::TEXT as participant_type,
  NULL::UUID as artist_id,
  NULL::UUID as venue_id,
  genre_value as text_value
FROM public.scenes s
CROSS JOIN LATERAL UNNEST(s.participating_genres) AS genre_value
WHERE s.participating_genres IS NOT NULL
  AND array_length(s.participating_genres, 1) > 0
  AND genre_value IS NOT NULL
  AND TRIM(genre_value) != ''
  -- Use NOT EXISTS to avoid conflicts since partial unique indexes don't work with ON CONFLICT
  AND NOT EXISTS (
    SELECT 1 FROM public.scene_participants sp
    WHERE sp.scene_id = s.id 
      AND sp.participant_type = 'genre' 
      AND sp.text_value = genre_value
  );

-- ============================================================
-- 3. UPDATE CALCULATE_SCENE_PROGRESS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_scene_progress(
  p_user_id UUID,
  p_scene_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scene RECORD;
  v_artists_count INTEGER := 0;
  v_venues_count INTEGER := 0;
  v_cities_count INTEGER := 0;
  v_genres_count INTEGER := 0;
  v_events_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_progress_pct INTEGER := 0;
  v_discovery_state TEXT := 'undiscovered';
  v_discovered_at TIMESTAMPTZ;
  v_started_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
  v_existing_progress RECORD;
  v_artist_ids UUID[];
  v_venue_ids UUID[];
  v_city_names TEXT[];
  v_genre_names TEXT[];
BEGIN
  -- Get scene info
  SELECT * INTO v_scene FROM public.scenes WHERE id = p_scene_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get existing progress to preserve timestamps
  SELECT * INTO v_existing_progress
  FROM public.user_scene_progress
  WHERE user_id = p_user_id AND scene_id = p_scene_id;
  
  -- Get participant IDs/values from scene_participants table
  SELECT 
    ARRAY_AGG(DISTINCT artist_id) FILTER (WHERE artist_id IS NOT NULL),
    ARRAY_AGG(DISTINCT venue_id) FILTER (WHERE venue_id IS NOT NULL),
    ARRAY_AGG(DISTINCT text_value) FILTER (WHERE participant_type = 'city' AND text_value IS NOT NULL),
    ARRAY_AGG(DISTINCT text_value) FILTER (WHERE participant_type = 'genre' AND text_value IS NOT NULL)
  INTO v_artist_ids, v_venue_ids, v_city_names, v_genre_names
  FROM public.scene_participants
  WHERE scene_id = p_scene_id;
  
  -- Count artists experienced
  -- Match by artist UUID from artists table
  -- Events table has artist_id (TEXT JamBase ID) and artist_uuid (UUID FK)
  IF v_artist_ids IS NOT NULL AND array_length(v_artist_ids, 1) > 0 THEN
    SELECT COUNT(DISTINCT a.id) INTO v_artists_count
    FROM (
      -- From reviews - match via artist_uuid or artist_id
      SELECT DISTINCT a.id
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      JOIN public.artists a ON (
        e.artist_uuid = a.id OR
        (e.artist_id IS NOT NULL AND (
          e.artist_id = a.identifier OR
          e.artist_id = REPLACE(a.identifier, 'jambase:', '') OR
          a.identifier = 'jambase:' || e.artist_id
        ))
      )
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND a.id = ANY(v_artist_ids)
      
      UNION
      
      -- From passport entries
      SELECT DISTINCT a.id
      FROM public.passport_entries pe
      JOIN public.artists a ON (
        pe.entity_id = a.identifier
        OR pe.entity_id = REPLACE(a.identifier, 'jambase:', '')
        OR a.identifier = 'jambase:' || pe.entity_id
        OR pe.entity_id = 'jambase:' || REPLACE(a.identifier, 'jambase:', '')
      )
      WHERE pe.user_id = p_user_id 
        AND pe.type = 'artist'
        AND a.id = ANY(v_artist_ids)
    ) a;
  END IF;
  
  -- Count venues experienced
  -- Match by venue UUID from venues table
  -- Events table has venue_id (TEXT JamBase ID) and venue_uuid (UUID FK)
  IF v_venue_ids IS NOT NULL AND array_length(v_venue_ids, 1) > 0 THEN
    SELECT COUNT(DISTINCT v.id) INTO v_venues_count
    FROM (
      -- From reviews - match via venue_id (TEXT JamBase ID)
      SELECT DISTINCT v.id
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      JOIN public.venues v ON (
        (e.venue_id IS NOT NULL AND (
          e.venue_id = v.identifier OR
          e.venue_id = REPLACE(v.identifier, 'jambase:', '') OR
          v.identifier = 'jambase:' || e.venue_id
        ))
      )
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND v.id = ANY(v_venue_ids)
      
      UNION
      
      -- From passport entries
      SELECT DISTINCT v.id
      FROM public.passport_entries pe
      JOIN public.venues v ON (
        pe.entity_id = v.identifier
        OR pe.entity_id = REPLACE(v.identifier, 'jambase:', '')
        OR v.identifier = 'jambase:' || pe.entity_id
        OR pe.entity_id = 'jambase:' || REPLACE(v.identifier, 'jambase:', '')
      )
      WHERE pe.user_id = p_user_id 
        AND pe.type = 'venue'
        AND v.id = ANY(v_venue_ids)
    ) v;
  END IF;
  
  -- Count cities experienced
  IF v_city_names IS NOT NULL AND array_length(v_city_names, 1) > 0 THEN
    SELECT COUNT(DISTINCT entity_name) INTO v_cities_count
    FROM public.passport_entries
    WHERE user_id = p_user_id 
      AND type = 'city'
      AND entity_name = ANY(v_city_names);
  END IF;
  
  -- Count genres experienced (from reviews)
  IF v_genre_names IS NOT NULL AND array_length(v_genre_names, 1) > 0 THEN
    SELECT COUNT(DISTINCT genre_name) INTO v_genres_count
    FROM (
      SELECT UNNEST(e.genres) as genre_name
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND e.genres && v_genre_names -- Array overlap operator
    ) genre_matches
    WHERE genre_name = ANY(v_genre_names);
  END IF;
  
  -- Count events attended for this scene
  SELECT COUNT(DISTINCT e.id) INTO v_events_count
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE r.user_id = p_user_id 
    AND r.is_draft = false
    AND r.was_there = true
    AND (
      (v_artist_ids IS NOT NULL AND array_length(v_artist_ids, 1) > 0 AND 
       EXISTS (
         SELECT 1 FROM public.artists a 
         WHERE a.id = ANY(v_artist_ids) 
         AND (e.artist_uuid = a.id OR (e.artist_id IS NOT NULL AND (
           e.artist_id = a.identifier OR
           e.artist_id = REPLACE(a.identifier, 'jambase:', '') OR
           a.identifier = 'jambase:' || e.artist_id
         )))
       )) OR
      (v_venue_ids IS NOT NULL AND array_length(v_venue_ids, 1) > 0 AND 
       EXISTS (
         SELECT 1 FROM public.venues v 
         WHERE v.id = ANY(v_venue_ids) 
         AND (e.venue_id IS NOT NULL AND (
           e.venue_id = v.identifier OR
           e.venue_id = REPLACE(v.identifier, 'jambase:', '') OR
           v.identifier = 'jambase:' || e.venue_id
         ))
       )) OR
      (v_city_names IS NOT NULL AND array_length(v_city_names, 1) > 0 AND e.venue_city = ANY(v_city_names)) OR
      (v_genre_names IS NOT NULL AND array_length(v_genre_names, 1) > 0 AND e.genres && v_genre_names)
    );
  
  -- Calculate total unique entities
  v_total_count := COALESCE(array_length(v_artist_ids, 1), 0) +
                   COALESCE(array_length(v_venue_ids, 1), 0) +
                   COALESCE(array_length(v_city_names, 1), 0) +
                   COALESCE(array_length(v_genre_names, 1), 0);
  
  -- Calculate progress percentage
  IF v_total_count > 0 THEN
    v_progress_pct := LEAST(100, ROUND(
      ((v_artists_count + v_venues_count + v_cities_count + v_genres_count)::NUMERIC / v_total_count::NUMERIC) * 100
    )::INTEGER);
  END IF;
  
  -- Determine discovery state and preserve timestamps
  v_discovered_at := COALESCE(v_existing_progress.discovered_at, NULL);
  v_started_at := COALESCE(v_existing_progress.started_at, NULL);
  v_completed_at := COALESCE(v_existing_progress.completed_at, NULL);
  
  IF v_progress_pct >= 100 OR 
     (v_artists_count + v_venues_count + v_cities_count + v_genres_count) >= v_scene.completion_threshold THEN
    v_discovery_state := 'completed';
    IF v_completed_at IS NULL THEN
      v_completed_at := now();
    END IF;
    IF v_started_at IS NULL THEN
      v_started_at := COALESCE(v_existing_progress.started_at, now());
    END IF;
    IF v_discovered_at IS NULL THEN
      v_discovered_at := COALESCE(v_existing_progress.discovered_at, now());
    END IF;
  ELSIF (v_artists_count + v_venues_count + v_cities_count + v_genres_count) >= v_scene.discovery_threshold THEN
    v_discovery_state := 'in_progress';
    IF v_started_at IS NULL THEN
      v_started_at := now();
    END IF;
    IF v_discovered_at IS NULL THEN
      v_discovered_at := COALESCE(v_existing_progress.discovered_at, now());
    END IF;
  ELSIF (v_artists_count + v_venues_count + v_cities_count + v_genres_count) > 0 THEN
    v_discovery_state := 'discovered';
    IF v_discovered_at IS NULL THEN
      v_discovered_at := now();
    END IF;
  END IF;
  
  -- Insert or update progress
  INSERT INTO public.user_scene_progress (
    user_id, scene_id, discovery_state,
    artists_experienced, venues_experienced, cities_experienced, 
    genres_experienced, events_experienced, progress_percentage,
    discovered_at, started_at, completed_at, last_activity_at
  ) VALUES (
    p_user_id, p_scene_id, v_discovery_state,
    v_artists_count, v_venues_count, v_cities_count,
    v_genres_count, v_events_count, v_progress_pct,
    v_discovered_at, v_started_at, v_completed_at, now()
  )
  ON CONFLICT (user_id, scene_id) 
  DO UPDATE SET
    discovery_state = EXCLUDED.discovery_state,
    artists_experienced = EXCLUDED.artists_experienced,
    venues_experienced = EXCLUDED.venues_experienced,
    cities_experienced = EXCLUDED.cities_experienced,
    genres_experienced = EXCLUDED.genres_experienced,
    events_experienced = EXCLUDED.events_experienced,
    progress_percentage = EXCLUDED.progress_percentage,
    discovered_at = COALESCE(EXCLUDED.discovered_at, user_scene_progress.discovered_at),
    started_at = COALESCE(EXCLUDED.started_at, user_scene_progress.started_at),
    completed_at = COALESCE(EXCLUDED.completed_at, user_scene_progress.completed_at),
    last_activity_at = EXCLUDED.last_activity_at;
END;
$$;

-- ============================================================
-- 4. UPDATE AUTO_UPDATE_SCENE_PROGRESS TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_update_scene_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scene_ids UUID[];
  v_user_id UUID;
BEGIN
  -- Determine user_id based on trigger
  IF TG_TABLE_NAME = 'passport_entries' THEN
    v_user_id := NEW.user_id;
    
    -- Get all scene IDs that might be affected by this passport entry
    -- Match by artist/venue UUID or city name
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    WHERE sp.scene_id IN (
      SELECT id FROM public.scenes WHERE is_active = true
    )
    AND (
      -- Match artist by UUID
      (NEW.type = 'artist' AND sp.participant_type = 'artist' AND 
       EXISTS (
         SELECT 1 FROM public.artists a 
         WHERE a.id = sp.artist_id 
         AND (NEW.entity_id = a.identifier OR NEW.entity_id = REPLACE(a.identifier, 'jambase:', '') OR a.identifier = 'jambase:' || NEW.entity_id OR NEW.entity_id = 'jambase:' || REPLACE(a.identifier, 'jambase:', ''))
       )) OR
      -- Match venue by UUID
      (NEW.type = 'venue' AND sp.participant_type = 'venue' AND 
       EXISTS (
         SELECT 1 FROM public.venues v 
         WHERE v.id = sp.venue_id 
         AND (NEW.entity_id = v.identifier OR NEW.entity_id = REPLACE(v.identifier, 'jambase:', '') OR v.identifier = 'jambase:' || NEW.entity_id OR NEW.entity_id = 'jambase:' || REPLACE(v.identifier, 'jambase:', ''))
       )) OR
      -- Match city by name
      (NEW.type = 'city' AND sp.participant_type = 'city' AND NEW.entity_name = sp.text_value)
    );
  ELSIF TG_TABLE_NAME = 'reviews' AND NEW.is_draft = false THEN
    v_user_id := NEW.user_id;
    
    -- Get all scene IDs that might be affected by this review
    -- Match by artist/venue UUID, city name, or genre
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    JOIN public.events e ON e.id = NEW.event_id
    WHERE sp.scene_id IN (
      SELECT id FROM public.scenes WHERE is_active = true
    )
    AND (
      -- Match artist by UUID
      (sp.participant_type = 'artist' AND 
       EXISTS (
         SELECT 1 FROM public.artists a 
         WHERE a.id = sp.artist_id 
         AND (e.artist_uuid = a.id OR (e.artist_id IS NOT NULL AND (
           e.artist_id = a.identifier OR
           e.artist_id = REPLACE(a.identifier, 'jambase:', '') OR
           a.identifier = 'jambase:' || e.artist_id
         )))
       )) OR
      -- Match venue by identifier
      (sp.participant_type = 'venue' AND 
       EXISTS (
         SELECT 1 FROM public.venues v 
         WHERE v.id = sp.venue_id 
         AND (e.venue_id IS NOT NULL AND (
           e.venue_id = v.identifier OR
           e.venue_id = REPLACE(v.identifier, 'jambase:', '') OR
           v.identifier = 'jambase:' || e.venue_id
         ))
       )) OR
      -- Match city by name
      (sp.participant_type = 'city' AND e.venue_city = sp.text_value) OR
      -- Match genre
      (sp.participant_type = 'genre' AND e.genres IS NOT NULL AND e.genres @> ARRAY[sp.text_value])
    );
  END IF;
  
  -- Update progress for affected scenes
  IF v_scene_ids IS NOT NULL AND array_length(v_scene_ids, 1) > 0 THEN
    PERFORM public.calculate_scene_progress(v_user_id, unnest_scene_id)
    FROM UNNEST(v_scene_ids) AS unnest_scene_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. REMOVE ARRAY COLUMNS FROM SCENES TABLE
-- ============================================================
-- Drop the old array columns and their indexes since we now use scene_participants

-- Drop GIN indexes on array columns (they will be automatically dropped with columns, but explicit for clarity)
DROP INDEX IF EXISTS public.idx_scenes_artists;
DROP INDEX IF EXISTS public.idx_scenes_venues;
DROP INDEX IF EXISTS public.idx_scenes_cities;
DROP INDEX IF EXISTS public.idx_scenes_genres;

-- Remove array columns from scenes table
ALTER TABLE public.scenes 
  DROP COLUMN IF EXISTS participating_artists,
  DROP COLUMN IF EXISTS participating_venues,
  DROP COLUMN IF EXISTS participating_cities,
  DROP COLUMN IF EXISTS participating_genres;

-- ============================================================
-- 6. ROW LEVEL SECURITY FOR SCENE_PARTICIPANTS
-- ============================================================
ALTER TABLE public.scene_participants ENABLE ROW LEVEL SECURITY;

-- Everyone can read scene participants (needed for scene queries)
DROP POLICY IF EXISTS "Anyone can view scene participants" ON public.scene_participants;
CREATE POLICY "Anyone can view scene participants"
  ON public.scene_participants
  FOR SELECT
  USING (true);

-- Only admins can modify (we'll add admin check later if needed)
-- For now, allow authenticated users to insert/update (can be restricted later)
DROP POLICY IF EXISTS "Authenticated users can modify scene participants" ON public.scene_participants;
CREATE POLICY "Authenticated users can modify scene participants"
  ON public.scene_participants
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 7. GRANTS
-- ============================================================
GRANT SELECT ON public.scene_participants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scene_participants TO authenticated;

