-- ============================================================
-- SCENES SYSTEM - SQL Migration
-- A Scene is a collectible cultural chapter of live music
-- defined by shared artists, venues, places, and energy
-- ============================================================

-- ============================================================
-- 1. SCENES TABLE - Core scene info with participating entities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Core identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE, -- URL-friendly identifier
  description TEXT, -- Cultural context and meaning
  short_description TEXT, -- Brief tagline for cards
  
  -- Cultural metadata
  energy_level TEXT CHECK (energy_level IN ('intimate', 'vibrant', 'intense', 'laid-back', 'eclectic')),
  era_start_year INTEGER, -- When this scene emerged/became significant
  era_end_year INTEGER, -- When scene ended (NULL if ongoing)
  cultural_significance TEXT, -- What makes this scene meaningful
  
  -- Visual identity
  image_url TEXT, -- Scene cover image URL
  scene_url TEXT, -- Alternative image URL (for additional images)
  color_theme TEXT, -- Hex color for UI theming
  
  -- Participating entities (stored as arrays/JSONB)
  participating_artists TEXT[], -- Array of artist names/IDs
  participating_venues TEXT[], -- Array of venue names/IDs
  participating_cities TEXT[], -- Array of city names
  participating_genres TEXT[], -- Array of genre names
  
  -- Progression thresholds
  discovery_threshold INTEGER DEFAULT 1, -- Min interactions to discover
  completion_threshold INTEGER DEFAULT 10, -- Min interactions to complete
  
  -- Status
  is_active BOOLEAN DEFAULT true, -- Whether scene is currently active
  is_featured BOOLEAN DEFAULT false, -- Featured scenes shown prominently
  sort_order INTEGER DEFAULT 0, -- Display order
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional flexible data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id), -- Admin/curator who created
  
  -- Constraints
  CONSTRAINT valid_era CHECK (era_end_year IS NULL OR era_end_year >= era_start_year)
);

-- Indexes for scenes
CREATE INDEX IF NOT EXISTS idx_scenes_slug ON public.scenes(slug);
CREATE INDEX IF NOT EXISTS idx_scenes_is_active ON public.scenes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scenes_is_featured ON public.scenes(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_scenes_sort_order ON public.scenes(sort_order);
CREATE INDEX IF NOT EXISTS idx_scenes_artists ON public.scenes USING GIN(participating_artists);
CREATE INDEX IF NOT EXISTS idx_scenes_venues ON public.scenes USING GIN(participating_venues);
CREATE INDEX IF NOT EXISTS idx_scenes_cities ON public.scenes USING GIN(participating_cities);
CREATE INDEX IF NOT EXISTS idx_scenes_genres ON public.scenes USING GIN(participating_genres);
CREATE INDEX IF NOT EXISTS idx_scenes_metadata ON public.scenes USING GIN(metadata);

-- ============================================================
-- 2. USER_SCENE_PROGRESS TABLE - Track user progression
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_scene_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  
  -- Discovery state
  discovery_state TEXT NOT NULL DEFAULT 'undiscovered' 
    CHECK (discovery_state IN ('undiscovered', 'discovered', 'in_progress', 'completed')),
  
  -- Progress metrics (counts of entities user has experienced)
  artists_experienced INTEGER DEFAULT 0,
  venues_experienced INTEGER DEFAULT 0,
  cities_experienced INTEGER DEFAULT 0,
  genres_experienced INTEGER DEFAULT 0,
  events_experienced INTEGER DEFAULT 0,
  
  -- Overall progress percentage (0-100)
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  
  -- Timestamps
  discovered_at TIMESTAMPTZ, -- When user first discovered this scene
  started_at TIMESTAMPTZ, -- When user started actively engaging
  completed_at TIMESTAMPTZ, -- When user completed the scene
  last_activity_at TIMESTAMPTZ, -- Last time user engaged with this scene
  
  -- Metadata for user-specific notes, milestones
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Ensure one progress record per user per scene
  UNIQUE(user_id, scene_id)
);

-- Indexes for user_scene_progress
CREATE INDEX IF NOT EXISTS idx_user_scene_progress_user_id ON public.user_scene_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scene_progress_scene_id ON public.user_scene_progress(scene_id);
CREATE INDEX IF NOT EXISTS idx_user_scene_progress_state ON public.user_scene_progress(discovery_state);
CREATE INDEX IF NOT EXISTS idx_user_scene_progress_completed ON public.user_scene_progress(user_id, completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_scene_progress_last_activity ON public.user_scene_progress(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_scene_progress_metadata ON public.user_scene_progress USING GIN(metadata);

-- ============================================================
-- 3. FUNCTION - Calculate and update user scene progress
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
  
  -- Count artists experienced (check passport_entries and reviews)
  -- Use JamBase IDs (artist_id) instead of names
  IF v_scene.participating_artists IS NOT NULL AND array_length(v_scene.participating_artists, 1) > 0 THEN
    SELECT COUNT(DISTINCT artist_id) INTO v_artists_count
    FROM (
      -- From passport entries (entity_id should contain JamBase ID)
      SELECT entity_id as artist_id
      FROM public.passport_entries
      WHERE user_id = p_user_id 
        AND type = 'artist'
        AND entity_id = ANY(v_scene.participating_artists)
      UNION
      -- From reviews - match by JamBase artist_id
      SELECT DISTINCT e.artist_id
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND e.artist_id IS NOT NULL
        AND e.artist_id = ANY(v_scene.participating_artists)
    ) artist_matches;
  END IF;
  
  -- Count venues experienced
  -- Use JamBase IDs (venue_id) instead of names
  IF v_scene.participating_venues IS NOT NULL AND array_length(v_scene.participating_venues, 1) > 0 THEN
    SELECT COUNT(DISTINCT venue_id) INTO v_venues_count
    FROM (
      -- From passport entries (entity_id should contain JamBase ID)
      SELECT entity_id as venue_id
      FROM public.passport_entries
      WHERE user_id = p_user_id 
        AND type = 'venue'
        AND entity_id = ANY(v_scene.participating_venues)
      UNION
      -- From reviews - match by JamBase venue_id
      SELECT DISTINCT e.venue_id
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND e.venue_id IS NOT NULL
        AND e.venue_id = ANY(v_scene.participating_venues)
    ) venue_matches;
  END IF;
  
  -- Count cities experienced
  IF v_scene.participating_cities IS NOT NULL AND array_length(v_scene.participating_cities, 1) > 0 THEN
    SELECT COUNT(DISTINCT entity_name) INTO v_cities_count
    FROM public.passport_entries
    WHERE user_id = p_user_id 
      AND type = 'city'
      AND entity_name = ANY(v_scene.participating_cities);
  END IF;
  
  -- Count genres experienced (from reviews)
  IF v_scene.participating_genres IS NOT NULL AND array_length(v_scene.participating_genres, 1) > 0 THEN
    SELECT COUNT(DISTINCT genre_name) INTO v_genres_count
    FROM (
      SELECT UNNEST(e.genres) as genre_name
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND e.genres && v_scene.participating_genres -- Array overlap operator
    ) genre_matches
    WHERE genre_name = ANY(v_scene.participating_genres);
  END IF;
  
  -- Count events attended for this scene
  -- Use JamBase IDs for artist and venue matching
  SELECT COUNT(DISTINCT e.id) INTO v_events_count
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE r.user_id = p_user_id 
    AND r.is_draft = false
    AND r.was_there = true
    AND (
      (v_scene.participating_artists IS NOT NULL AND e.artist_id IS NOT NULL AND e.artist_id = ANY(v_scene.participating_artists)) OR
      (v_scene.participating_venues IS NOT NULL AND e.venue_id IS NOT NULL AND e.venue_id = ANY(v_scene.participating_venues)) OR
      (v_scene.participating_cities IS NOT NULL AND e.venue_city = ANY(v_scene.participating_cities)) OR
      (v_scene.participating_genres IS NOT NULL AND e.genres && v_scene.participating_genres)
    );
  
  -- Calculate total unique entities
  v_total_count := COALESCE(array_length(v_scene.participating_artists, 1), 0) +
                   COALESCE(array_length(v_scene.participating_venues, 1), 0) +
                   COALESCE(array_length(v_scene.participating_cities, 1), 0) +
                   COALESCE(array_length(v_scene.participating_genres, 1), 0);
  
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
-- 4. TRIGGER - Auto-update scene progress on passport/review changes
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
    -- Use entity_id (JamBase ID) for artist and venue matching
    SELECT ARRAY_AGG(DISTINCT id) INTO v_scene_ids
    FROM public.scenes
    WHERE is_active = true
      AND (
        (NEW.type = 'artist' AND participating_artists IS NOT NULL AND NEW.entity_id = ANY(participating_artists)) OR
        (NEW.type = 'venue' AND participating_venues IS NOT NULL AND NEW.entity_id = ANY(participating_venues)) OR
        (NEW.type = 'city' AND participating_cities IS NOT NULL AND NEW.entity_name = ANY(participating_cities))
      );
  ELSIF TG_TABLE_NAME = 'reviews' AND NEW.is_draft = false THEN
    v_user_id := NEW.user_id;
    
    -- Get all scene IDs that might be affected by this review
    -- Use JamBase IDs (artist_id, venue_id) for matching
    SELECT ARRAY_AGG(DISTINCT s.id) INTO v_scene_ids
    FROM public.scenes s
    JOIN public.events e ON e.id = NEW.event_id
    WHERE s.is_active = true
      AND (
        (s.participating_artists IS NOT NULL AND e.artist_id IS NOT NULL AND e.artist_id = ANY(s.participating_artists)) OR
        (s.participating_venues IS NOT NULL AND e.venue_id IS NOT NULL AND e.venue_id = ANY(s.participating_venues)) OR
        (s.participating_cities IS NOT NULL AND e.venue_city = ANY(s.participating_cities)) OR
        (s.participating_genres IS NOT NULL AND e.genres && s.participating_genres)
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

-- Create triggers
DROP TRIGGER IF EXISTS trigger_auto_update_scene_progress_passport ON public.passport_entries;
CREATE TRIGGER trigger_auto_update_scene_progress_passport
  AFTER INSERT OR UPDATE ON public.passport_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_scene_progress();

DROP TRIGGER IF EXISTS trigger_auto_update_scene_progress_review ON public.reviews;
CREATE TRIGGER trigger_auto_update_scene_progress_review
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.auto_update_scene_progress();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scene_progress ENABLE ROW LEVEL SECURITY;

-- Scenes: Everyone can read active scenes
DROP POLICY IF EXISTS "Anyone can view active scenes" ON public.scenes;
CREATE POLICY "Anyone can view active scenes"
  ON public.scenes
  FOR SELECT
  USING (is_active = true);

-- User progress: Users can only see their own progress
DROP POLICY IF EXISTS "Users can view their own scene progress" ON public.user_scene_progress;
CREATE POLICY "Users can view their own scene progress"
  ON public.user_scene_progress
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own scene progress" ON public.user_scene_progress;
CREATE POLICY "Users can insert their own scene progress"
  ON public.user_scene_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own scene progress" ON public.user_scene_progress;
CREATE POLICY "Users can update their own scene progress"
  ON public.user_scene_progress
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. GRANTS
-- ============================================================
GRANT SELECT ON public.scenes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_scene_progress TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_scene_progress TO authenticated;

