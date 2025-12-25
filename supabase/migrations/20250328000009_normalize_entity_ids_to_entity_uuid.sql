-- ============================================================
-- Normalize entity_id TEXT to entity_uuid UUID
-- ============================================================
-- This migration normalizes analytics_daily, interactions, and passport_entries
-- to use entity_uuid UUID instead of entity_id TEXT, following the same pattern
-- as the external_entity_ids normalization.
--
-- ⚠️ PREREQUISITE: This migration requires the external_entity_ids normalization
-- (20250328000000_normalize_external_ids_to_3nf.sql) to have completed successfully.
--
-- Changes:
-- 1. Add entity_uuid UUID column to all three tables
-- 2. Backfill UUIDs from existing entity_id values using external_entity_ids
-- 3. Update unique constraints to use entity_uuid
-- 4. Update indexes
-- 5. Keep entity_id TEXT as optional metadata (not for identity)
-- 6. Update dependent functions (log_user_interaction, aggregate_daily_analytics)
--
-- ⚠️ APPLICATION CODE UPDATES REQUIRED:
-- After running this migration, update application code to:
-- - Use entity_uuid instead of entity_id for queries and joins
-- - Pass entity_uuid to log_user_interaction() when available
-- - Query analytics_daily by entity_uuid for better performance
-- - Use entity_uuid for passport_entries lookups (venues/artists)

BEGIN;

-- ============================================================
-- 0. FIX CALCULATE_SCENE_PROGRESS FUNCTION FIRST
-- ============================================================
-- This function is called by triggers and must be fixed before
-- any data changes that might trigger it (e.g., passport_entries updates)

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
  v_experienced_count INTEGER;
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
  -- After normalization: events.artist_id is UUID FK (renamed from artist_jambase_id)
  IF v_artist_ids IS NOT NULL AND array_length(v_artist_ids, 1) > 0 THEN
    SELECT COUNT(DISTINCT a.id) INTO v_artists_count
    FROM (
      -- From reviews - match via artist_id (UUID FK after normalization)
      SELECT DISTINCT a.id
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      JOIN public.artists a ON (
        e.artist_id = a.id
      )
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND a.id = ANY(v_artist_ids)
      
      UNION
      
      -- From passport entries - use entity_uuid if available (after normalization)
      SELECT DISTINCT a.id
      FROM public.passport_entries pe
      JOIN public.artists a ON (
        pe.entity_uuid = a.id
        OR (pe.entity_uuid IS NULL AND (
          pe.entity_id = a.identifier
          OR pe.entity_id = REPLACE(a.identifier, 'jambase:', '')
          OR a.identifier = 'jambase:' || pe.entity_id
          OR pe.entity_id = 'jambase:' || REPLACE(a.identifier, 'jambase:', '')
        ))
      )
      WHERE pe.user_id = p_user_id 
        AND pe.type = 'artist'
        AND a.id = ANY(v_artist_ids)
    ) a;
  END IF;
  
  -- Count venues experienced
  -- After normalization: events.venue_id is UUID FK (renamed from venue_jambase_id)
  IF v_venue_ids IS NOT NULL AND array_length(v_venue_ids, 1) > 0 THEN
    SELECT COUNT(DISTINCT v.id) INTO v_venues_count
    FROM (
      -- From reviews - match via venue_id (UUID FK after normalization)
      SELECT DISTINCT v.id
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      JOIN public.venues v ON (
        e.venue_id = v.id
      )
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND v.id = ANY(v_venue_ids)
      
      UNION
      
      -- From passport entries - use entity_uuid if available (after normalization)
      SELECT DISTINCT v.id
      FROM public.passport_entries pe
      JOIN public.venues v ON (
        pe.entity_uuid = v.id
        OR (pe.entity_uuid IS NULL AND (
          pe.entity_id = v.identifier
          OR pe.entity_id = REPLACE(v.identifier, 'jambase:', '')
          OR v.identifier = 'jambase:' || pe.entity_id
          OR pe.entity_id = 'jambase:' || REPLACE(v.identifier, 'jambase:', '')
        ))
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
      SELECT DISTINCT unnest(genres) as genre_name
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      WHERE r.user_id = p_user_id 
        AND r.is_draft = false
        AND e.genres IS NOT NULL
    ) g
    WHERE genre_name = ANY(v_genre_names);
  END IF;
  
  -- Count events experienced (from reviews)
  SELECT COUNT(DISTINCT r.event_id) INTO v_events_count
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE r.user_id = p_user_id 
    AND r.is_draft = false
    AND (
      (v_artist_ids IS NULL OR e.artist_id = ANY(v_artist_ids))
      OR (v_venue_ids IS NULL OR e.venue_id = ANY(v_venue_ids))
      OR (v_city_names IS NULL OR e.venue_city = ANY(v_city_names))
      OR (v_genre_names IS NULL OR EXISTS (
        SELECT 1 FROM unnest(e.genres) g WHERE g = ANY(v_genre_names)
      ))
    );
  
  -- Calculate total unique entities in scene (from participant arrays)
  v_total_count := COALESCE(array_length(v_artist_ids, 1), 0) +
                   COALESCE(array_length(v_venue_ids, 1), 0) +
                   COALESCE(array_length(v_city_names, 1), 0) +
                   COALESCE(array_length(v_genre_names, 1), 0);
  
  -- Calculate progress percentage based on entities experienced vs total entities
  IF v_total_count > 0 THEN
    v_progress_pct := LEAST(100, ROUND(
      ((v_artists_count + v_venues_count + v_cities_count + v_genres_count)::NUMERIC / v_total_count::NUMERIC) * 100
    )::INTEGER);
  END IF;
  
  -- Determine discovery state based on thresholds (preserve timestamps)
  v_discovered_at := COALESCE(v_existing_progress.discovered_at, NULL);
  v_started_at := COALESCE(v_existing_progress.started_at, NULL);
  v_completed_at := COALESCE(v_existing_progress.completed_at, NULL);
  
  -- Calculate total experienced entities
  v_experienced_count := v_artists_count + v_venues_count + v_cities_count + v_genres_count;
  
  IF v_progress_pct >= 100 OR 
     (v_experienced_count >= COALESCE(v_scene.completion_threshold, 10)) THEN
    v_discovery_state := 'completed';
    IF v_completed_at IS NULL THEN
      v_completed_at := NOW();
    END IF;
    IF v_started_at IS NULL THEN
      v_started_at := COALESCE(v_existing_progress.started_at, NOW());
    END IF;
    IF v_discovered_at IS NULL THEN
      v_discovered_at := COALESCE(v_existing_progress.discovered_at, NOW());
    END IF;
  ELSIF v_experienced_count >= COALESCE(v_scene.discovery_threshold, 1) THEN
    v_discovery_state := 'in_progress';
    IF v_started_at IS NULL THEN
      v_started_at := NOW();
    END IF;
    IF v_discovered_at IS NULL THEN
      v_discovered_at := COALESCE(v_existing_progress.discovered_at, NOW());
    END IF;
  ELSIF v_experienced_count > 0 THEN
    v_discovery_state := 'discovered';
    IF v_discovered_at IS NULL THEN
      v_discovered_at := NOW();
    END IF;
  ELSE
    v_discovery_state := 'undiscovered';
  END IF;
  
  -- Upsert progress
  INSERT INTO public.user_scene_progress (
    user_id,
    scene_id,
    artists_experienced,
    venues_experienced,
    cities_experienced,
    genres_experienced,
    events_experienced,
    progress_percentage,
    discovery_state,
    discovered_at,
    started_at,
    completed_at,
    last_activity_at
  ) VALUES (
    p_user_id,
    p_scene_id,
    v_artists_count,
    v_venues_count,
    v_cities_count,
    v_genres_count,
    v_events_count,
    v_progress_pct,
    v_discovery_state,
    v_discovered_at,
    v_started_at,
    v_completed_at,
    NOW()
  )
  ON CONFLICT (user_id, scene_id) DO UPDATE
  SET
    artists_experienced = EXCLUDED.artists_experienced,
    venues_experienced = EXCLUDED.venues_experienced,
    cities_experienced = EXCLUDED.cities_experienced,
    genres_experienced = EXCLUDED.genres_experienced,
    events_experienced = EXCLUDED.events_experienced,
    progress_percentage = EXCLUDED.progress_percentage,
    discovery_state = EXCLUDED.discovery_state,
    discovered_at = COALESCE(EXCLUDED.discovered_at, user_scene_progress.discovered_at),
    started_at = COALESCE(EXCLUDED.started_at, user_scene_progress.started_at),
    completed_at = COALESCE(EXCLUDED.completed_at, user_scene_progress.completed_at),
    last_activity_at = EXCLUDED.last_activity_at;
END;
$$;

-- ============================================================
-- 1. ANALYTICS_DAILY TABLE
-- ============================================================

-- Add entity_uuid column
ALTER TABLE public.analytics_daily
  ADD COLUMN IF NOT EXISTS entity_uuid UUID;

-- Backfill entity_uuid from entity_id
-- For users/events/campaigns: entity_id is already a UUID, cast directly
-- For artists/venues: look up UUID from external_entity_ids
UPDATE public.analytics_daily ad
SET entity_uuid = CASE
  -- Users, events, campaigns: entity_id is already UUID
  WHEN ad.entity_type IN ('user', 'event', 'campaign') THEN
    CASE
      WHEN ad.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        ad.entity_id::UUID
      ELSE NULL
    END
  -- Artists: look up from external_entity_ids
  WHEN ad.entity_type = 'artist' THEN
    (SELECT eei.entity_uuid
     FROM public.external_entity_ids eei
     WHERE eei.entity_type = 'artist'
       AND eei.source = 'jambase'
       AND eei.external_id = ad.entity_id
     LIMIT 1)
  -- Venues: look up from external_entity_ids
  WHEN ad.entity_type = 'venue' THEN
    (SELECT eei.entity_uuid
     FROM public.external_entity_ids eei
     WHERE eei.entity_type = 'venue'
       AND eei.source = 'jambase'
       AND eei.external_id = ad.entity_id
     LIMIT 1)
  ELSE NULL
END
WHERE entity_uuid IS NULL;

-- Drop old unique constraint
ALTER TABLE public.analytics_daily
  DROP CONSTRAINT IF EXISTS analytics_daily_entity_type_entity_id_date_key;

-- Create new unique constraint using entity_uuid
ALTER TABLE public.analytics_daily
  ADD CONSTRAINT analytics_daily_entity_type_entity_uuid_date_key
    UNIQUE (entity_type, entity_uuid, date);

-- Drop old indexes on entity_id
DROP INDEX IF EXISTS public.idx_analytics_daily_entity_id;
DROP INDEX IF EXISTS public.idx_analytics_daily_entity_date;

-- Create new indexes on entity_uuid
CREATE INDEX IF NOT EXISTS idx_analytics_daily_entity_uuid 
  ON public.analytics_daily(entity_uuid) 
  WHERE entity_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_daily_entity_type_uuid_date 
  ON public.analytics_daily(entity_type, entity_uuid, date DESC) 
  WHERE entity_uuid IS NOT NULL;

-- Make entity_id nullable (now metadata only)
ALTER TABLE public.analytics_daily
  ALTER COLUMN entity_id DROP NOT NULL;

-- Add CHECK constraint to prevent identity ambiguity
-- All entity_types in analytics_daily should have UUIDs after normalization
ALTER TABLE public.analytics_daily
  ADD CONSTRAINT analytics_daily_entity_uuid_required
  CHECK (entity_uuid IS NOT NULL);

-- Add comment
COMMENT ON COLUMN public.analytics_daily.entity_uuid IS 'UUID foreign key to the entity (users.id, events.id, artists.id, venues.id, or campaigns.id). Primary identity column.';
COMMENT ON COLUMN public.analytics_daily.entity_id IS 'Legacy external ID (kept as metadata only, not for identity). Use entity_uuid for joins and referential integrity.';

-- ============================================================
-- 2. INTERACTIONS TABLE
-- ============================================================

-- Add entity_uuid column
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS entity_uuid UUID;

-- Backfill entity_uuid from entity_id
-- Try to cast as UUID first, then look up from external_entity_ids
UPDATE public.interactions i
SET entity_uuid = CASE
  -- Try casting as UUID first (for users, events, reviews, comments)
  WHEN i.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    i.entity_id::UUID
  -- Artists: look up from external_entity_ids
  WHEN i.entity_type = 'artist' THEN
    (SELECT eei.entity_uuid
     FROM public.external_entity_ids eei
     WHERE eei.entity_type = 'artist'
       AND eei.external_id = i.entity_id
     LIMIT 1)
  -- Venues: look up from external_entity_ids
  WHEN i.entity_type = 'venue' THEN
    (SELECT eei.entity_uuid
     FROM public.external_entity_ids eei
     WHERE eei.entity_type = 'venue'
       AND eei.external_id = i.entity_id
     LIMIT 1)
  -- Events: look up from external_entity_ids (if entity_id is external ID)
  WHEN i.entity_type = 'event' THEN
    COALESCE(
      -- Try direct UUID cast first
      CASE WHEN i.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN i.entity_id::UUID 
        ELSE NULL 
      END,
      -- Fallback to external_entity_ids lookup
      (SELECT eei.entity_uuid
       FROM public.external_entity_ids eei
       WHERE eei.entity_type = 'event'
         AND eei.external_id = i.entity_id
       LIMIT 1)
    )
  ELSE NULL
END
WHERE entity_uuid IS NULL;

-- Drop old index on entity_id
DROP INDEX IF EXISTS public.idx_user_interactions_entity_id;
DROP INDEX IF EXISTS public.idx_interactions_entity_id;
DROP INDEX IF EXISTS public.idx_interactions_new_entity_id;

-- Create new index on entity_uuid
CREATE INDEX IF NOT EXISTS idx_interactions_entity_uuid 
  ON public.interactions(entity_uuid) 
  WHERE entity_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_entity_type_uuid 
  ON public.interactions(entity_type, entity_uuid) 
  WHERE entity_uuid IS NOT NULL;

-- Make entity_id nullable (now metadata only)
ALTER TABLE public.interactions
  ALTER COLUMN entity_id DROP NOT NULL;

-- Add CHECK constraint to prevent identity ambiguity
-- Entity types that should have UUIDs: artist, event, venue, review, user, comment
-- Entity types that may not have UUIDs: search, view, form, ticket_link, song, album, playlist
-- Use NOT VALID to allow existing rows that can't be resolved, then validate later
DO $$
DECLARE
  violation_count INTEGER;
  violation_types TEXT;
BEGIN
  -- Check for constraint violations before adding it
  SELECT COUNT(*), string_agg(DISTINCT entity_type, ', ' ORDER BY entity_type)
  INTO violation_count, violation_types
  FROM public.interactions
  WHERE entity_type NOT IN ('search', 'view', 'form', 'ticket_link', 'song', 'album', 'playlist', 'genre', 'scene')
    AND entity_uuid IS NULL;
  
  IF violation_count > 0 THEN
    RAISE NOTICE 'Found % rows violating constraint with entity_types: %', violation_count, violation_types;
    RAISE NOTICE 'Adding constraint as NOT VALID - validate after cleaning up data.';
  END IF;
END $$;

-- Add constraint as NOT VALID (allows existing violations, but enforces for new rows)
ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_entity_uuid_required_for_entities
  CHECK (
    entity_type IN ('search', 'view', 'form', 'ticket_link', 'song', 'album', 'playlist', 'genre', 'scene')
    OR entity_uuid IS NOT NULL
  )
  NOT VALID;

-- Note: To validate the constraint later after cleaning up data, run:
-- ALTER TABLE public.interactions VALIDATE CONSTRAINT interactions_entity_uuid_required_for_entities;

-- Add comment
COMMENT ON COLUMN public.interactions.entity_uuid IS 'UUID foreign key to the entity (users.id, events.id, artists.id, venues.id, reviews.id, etc.). Primary identity column.';
COMMENT ON COLUMN public.interactions.entity_id IS 'Legacy external ID or raw identifier (kept as metadata only, not for identity). Use entity_uuid for joins and referential integrity.';

-- ============================================================
-- 3. PASSPORT_ENTRIES TABLE
-- ============================================================

-- Add entity_uuid column (nullable - cities don't have UUIDs)
ALTER TABLE public.passport_entries
  ADD COLUMN IF NOT EXISTS entity_uuid UUID;

-- Backfill entity_uuid from entity_id
-- Cities: keep NULL (no UUID)
-- Venues/Artists: look up from external_entity_ids or cast as UUID
-- Scenes: keep NULL (no UUID mapping yet)
UPDATE public.passport_entries pe
SET entity_uuid = CASE
  -- Cities: no UUID, keep NULL
  WHEN pe.type = 'city' THEN NULL
  -- Venues: try UUID cast first, then external_entity_ids lookup
  WHEN pe.type = 'venue' THEN
    COALESCE(
      CASE WHEN pe.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN pe.entity_id::UUID 
        ELSE NULL 
      END,
      (SELECT eei.entity_uuid
       FROM public.external_entity_ids eei
       WHERE eei.entity_type = 'venue'
         AND eei.external_id = pe.entity_id
       LIMIT 1)
    )
  -- Artists: try UUID cast first, then external_entity_ids lookup
  WHEN pe.type = 'artist' THEN
    COALESCE(
      CASE WHEN pe.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        THEN pe.entity_id::UUID 
        ELSE NULL 
      END,
      (SELECT eei.entity_uuid
       FROM public.external_entity_ids eei
       WHERE eei.entity_type = 'artist'
         AND eei.external_id = pe.entity_id
       LIMIT 1)
    )
  -- Scenes: no UUID mapping yet, keep NULL
  WHEN pe.type = 'scene' THEN NULL
  ELSE NULL
END
WHERE entity_uuid IS NULL;

-- Drop old unique constraint
ALTER TABLE public.passport_entries
  DROP CONSTRAINT IF EXISTS passport_entries_user_id_type_entity_id_key;

-- Create partial unique indexes (PostgreSQL doesn't support WHERE in UNIQUE constraints)
-- For venues/artists: use entity_uuid in unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS passport_entries_user_id_type_entity_uuid_key
  ON public.passport_entries(user_id, type, entity_uuid)
  WHERE entity_uuid IS NOT NULL;

-- For cities/scenes: use entity_id in unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS passport_entries_user_id_type_entity_id_key
  ON public.passport_entries(user_id, type, entity_id)
  WHERE entity_uuid IS NULL;

-- Drop old index on entity_id
DROP INDEX IF EXISTS public.idx_passport_entries_entity_id;

-- Create new index on entity_uuid
CREATE INDEX IF NOT EXISTS idx_passport_entries_entity_uuid 
  ON public.passport_entries(entity_uuid) 
  WHERE entity_uuid IS NOT NULL;

-- Add CHECK constraint to prevent identity ambiguity
-- Cities and scenes don't have UUIDs, but venues and artists should
-- Use NOT VALID to allow existing rows that can't be resolved, then validate later
DO $$
DECLARE
  violation_count INTEGER;
  violation_types TEXT;
BEGIN
  -- Check for violations before adding constraint
  SELECT COUNT(*), string_agg(DISTINCT type, ', ')
  INTO violation_count, violation_types
  FROM public.passport_entries
  WHERE type NOT IN ('city', 'scene')
    AND entity_uuid IS NULL;
  
  IF violation_count > 0 THEN
    RAISE NOTICE 'Found % passport_entries rows with type requiring entity_uuid but entity_uuid is NULL. Types: %', violation_count, violation_types;
    RAISE NOTICE 'Adding constraint as NOT VALID - validate after cleaning up data.';
  END IF;
END $$;

-- Add constraint as NOT VALID (allows existing violations, but enforces for new rows)
ALTER TABLE public.passport_entries
  ADD CONSTRAINT passport_entries_entity_uuid_required_for_entities
  CHECK (
    type IN ('city', 'scene')
    OR entity_uuid IS NOT NULL
  )
  NOT VALID;

-- Note: To validate the constraint later after cleaning up data, run:
-- ALTER TABLE public.passport_entries VALIDATE CONSTRAINT passport_entries_entity_uuid_required_for_entities;

-- Add comment
COMMENT ON COLUMN public.passport_entries.entity_uuid IS 'UUID foreign key to the entity (venues.id, artists.id). NULL for cities and scenes which don''t have UUID mappings. Primary identity column for UUID-based entries.';
COMMENT ON COLUMN public.passport_entries.entity_id IS 'Legacy external ID or raw identifier (city name, scene ID, etc.). Kept for non-UUID entries and as metadata. Use entity_uuid for joins when available.';

-- ============================================================
-- 4. VERIFY EXTERNAL_ENTITY_IDS CONSTRAINTS
-- ============================================================
-- Ensure the required uniqueness constraints exist on external_entity_ids
-- These are essential for the backfill logic to work correctly

DO $$
BEGIN
  -- Verify source + entity_type + external_id uniqueness
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'external_entity_ids_source_type_external_id_uniq'
  ) THEN
    ALTER TABLE public.external_entity_ids
      ADD CONSTRAINT external_entity_ids_source_type_external_id_uniq
      UNIQUE (source, entity_type, external_id);
    RAISE NOTICE 'Created constraint: external_entity_ids_source_type_external_id_uniq';
  ELSE
    RAISE NOTICE 'Constraint already exists: external_entity_ids_source_type_external_id_uniq';
  END IF;

  -- Verify entity_uuid + source + entity_type uniqueness
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'external_entity_ids_entity_source_type_uniq'
  ) THEN
    ALTER TABLE public.external_entity_ids
      ADD CONSTRAINT external_entity_ids_entity_source_type_uniq
      UNIQUE (entity_uuid, source, entity_type);
    RAISE NOTICE 'Created constraint: external_entity_ids_entity_source_type_uniq';
  ELSE
    RAISE NOTICE 'Constraint already exists: external_entity_ids_entity_source_type_uniq';
  END IF;
END $$;

-- ============================================================
-- 5. UPDATE DEPENDENT FUNCTIONS
-- ============================================================

-- Update log_user_interaction function to accept entity_uuid
-- Note: Required parameters must come before optional ones (PostgreSQL requirement)
CREATE OR REPLACE FUNCTION public.log_user_interaction(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_session_id UUID DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_entity_uuid UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  interaction_id UUID;
  claims JSONB;
  v_issuer TEXT;
  v_sub TEXT;
  v_global TEXT;
  v_resolved_uuid UUID;
BEGIN
  -- Extract identity anchors from JWT claims when present
  BEGIN
    claims := auth.jwt();
    v_issuer := COALESCE(claims->>'iss', NULL);
    v_sub := COALESCE(claims->>'sub', NULL);
    v_global := COALESCE(claims->'app_metadata'->>'global_user_id', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_issuer := NULL; v_sub := NULL; v_global := NULL;
  END;

  -- Resolve entity_uuid if not provided
  IF p_entity_uuid IS NULL AND p_entity_id IS NOT NULL THEN
    -- Try casting as UUID first
    BEGIN
      IF p_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_resolved_uuid := p_entity_id::UUID;
      ELSE
        -- Look up from external_entity_ids
        SELECT entity_uuid INTO v_resolved_uuid
        FROM public.external_entity_ids
        WHERE entity_type = p_entity_type
          AND external_id = p_entity_id
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_resolved_uuid := NULL;
    END;
  ELSE
    v_resolved_uuid := p_entity_uuid;
  END IF;

  INSERT INTO public.interactions (
    user_id,
    identity_issuer,
    identity_sub,
    global_user_id,
    session_id,
    event_type,
    entity_type,
    entity_id,
    entity_uuid,
    metadata
  ) VALUES (
    auth.uid(),
    v_issuer,
    v_sub,
    v_global,
    p_session_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    v_resolved_uuid,
    p_metadata
  ) RETURNING id INTO interaction_id;
  
  RETURN interaction_id;
END;
$$;

-- Update log_user_interactions_batch function
CREATE OR REPLACE FUNCTION public.log_user_interactions_batch(
  p_interactions JSONB
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  interaction_ids UUID[];
  interaction JSONB;
  claims JSONB;
  v_issuer TEXT;
  v_sub TEXT;
  v_global TEXT;
  v_entity_uuid UUID;
  v_entity_id TEXT;
BEGIN
  interaction_ids := ARRAY[]::UUID[];
  -- Extract identity anchors once per batch
  BEGIN
    claims := auth.jwt();
    v_issuer := COALESCE(claims->>'iss', NULL);
    v_sub := COALESCE(claims->>'sub', NULL);
    v_global := COALESCE(claims->'app_metadata'->>'global_user_id', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_issuer := NULL; v_sub := NULL; v_global := NULL;
  END;
  
  FOR interaction IN SELECT * FROM jsonb_array_elements(p_interactions)
  LOOP
    v_entity_id := interaction->>'entity_id';
    v_entity_uuid := (interaction->>'entity_uuid')::UUID;
    
    -- Resolve entity_uuid if not provided
    IF v_entity_uuid IS NULL AND v_entity_id IS NOT NULL THEN
      BEGIN
        IF v_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          v_entity_uuid := v_entity_id::UUID;
        ELSE
          SELECT entity_uuid INTO v_entity_uuid
          FROM public.external_entity_ids
          WHERE entity_type = interaction->>'entity_type'
            AND external_id = v_entity_id
          LIMIT 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_entity_uuid := NULL;
      END;
    END IF;

    INSERT INTO public.interactions (
      user_id,
      identity_issuer,
      identity_sub,
      global_user_id,
      session_id,
      event_type,
      entity_type,
      entity_id,
      entity_uuid,
      metadata
    ) VALUES (
      auth.uid(),
      v_issuer,
      v_sub,
      v_global,
      (interaction->>'session_id')::UUID,
      interaction->>'event_type',
      interaction->>'entity_type',
      v_entity_id,
      v_entity_uuid,
      COALESCE(interaction->'metadata', '{}'::jsonb)
    ) RETURNING id INTO interaction_ids[array_length(interaction_ids, 1) + 1];
  END LOOP;
  
  RETURN interaction_ids;
END;
$$;

-- Update aggregate_daily_analytics function to use entity_uuid
CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Aggregate user analytics
  INSERT INTO public.analytics_daily (
    entity_type,
    entity_id,
    entity_uuid,
    date,
    metrics,
    created_at,
    updated_at
  )
  SELECT 
    'user' as entity_type,
    i.user_id::TEXT as entity_id,
    i.user_id as entity_uuid,
    p_date as date,
    jsonb_build_object(
      'events_viewed', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'view'),
      'events_clicked', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'click'),
      'events_interested', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'interest'),
      'reviews_written', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'create'),
      'reviews_viewed', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'view')
    ) as metrics,
    now() as created_at,
    now() as updated_at
  FROM public.interactions i
  WHERE DATE(i.occurred_at) = p_date
  GROUP BY i.user_id
  ON CONFLICT (entity_type, entity_uuid, date) DO UPDATE
  SET metrics = EXCLUDED.metrics,
    updated_at = now();
  
  -- Aggregate event analytics
  INSERT INTO public.analytics_daily (
    entity_type,
    entity_id,
    entity_uuid,
    date,
    metrics,
    created_at,
    updated_at
  )
  SELECT 
    'event' as entity_type,
    i.entity_id,
    i.entity_uuid,
    p_date as date,
    jsonb_build_object(
      'impressions', COUNT(*) FILTER (WHERE i.event_type = 'view'),
      'clicks', COUNT(*) FILTER (WHERE i.event_type = 'click'),
      'interested_count', COUNT(*) FILTER (WHERE i.event_type = 'interest')
    ) as metrics,
    now() as created_at,
    now() as updated_at
  FROM public.interactions i
  WHERE i.entity_type = 'event'
    AND i.entity_uuid IS NOT NULL
    AND DATE(i.occurred_at) = p_date
  GROUP BY i.entity_uuid, i.entity_id
  ON CONFLICT (entity_type, entity_uuid, date) DO UPDATE
  SET metrics = EXCLUDED.metrics,
    updated_at = now();
END;
$$;

-- Add helpful comments
COMMENT ON TABLE public.analytics_daily IS 'Unified analytics table. Uses entity_uuid (UUID) for identity and referential integrity. entity_id (TEXT) kept as metadata only.';
COMMENT ON TABLE public.interactions IS 'Unified interactions table. Uses entity_uuid (UUID) for identity and referential integrity. entity_id (TEXT) kept as metadata only.';
COMMENT ON TABLE public.passport_entries IS 'User passport entries. Uses entity_uuid (UUID) for venues/artists. entity_id (TEXT) used for cities/scenes and as metadata.';

COMMIT;

