-- ============================================================
-- Fix Scenes and Signals progress tracker
-- 1. auto_update_scene_progress: handle reviews with event_id = NULL
-- 2. calculate_scene_progress: count reviews without events (artist_id/venue_id on review)
-- 3. Backfill: recalculate progress for all users with published reviews
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Fix auto_update_scene_progress for NULL event_id
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
  IF TG_TABLE_NAME = 'passport_entries' THEN
    v_user_id := NEW.user_id;

    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
    AND (
      (NEW.type = 'artist' AND sp.participant_type = 'artist' AND
       EXISTS (
         SELECT 1 FROM public.artists a
         WHERE a.id = sp.artist_id
         AND (NEW.entity_id = a.identifier OR NEW.entity_id = REPLACE(a.identifier, 'jambase:', '') OR a.identifier = 'jambase:' || NEW.entity_id OR NEW.entity_id = 'jambase:' || REPLACE(a.identifier, 'jambase:', ''))
       )) OR
      (NEW.type = 'venue' AND sp.participant_type = 'venue' AND
       EXISTS (
         SELECT 1 FROM public.venues v
         WHERE v.id = sp.venue_id
         AND (NEW.entity_id = v.identifier OR NEW.entity_id = REPLACE(v.identifier, 'jambase:', '') OR v.identifier = 'jambase:' || NEW.entity_id OR NEW.entity_id = 'jambase:' || REPLACE(v.identifier, 'jambase:', ''))
       )) OR
      (NEW.type = 'city' AND sp.participant_type = 'city' AND NEW.entity_name = sp.text_value)
    );

  ELSIF TG_TABLE_NAME = 'reviews' AND NEW.is_draft = false THEN
    v_user_id := NEW.user_id;

    -- Case A: Review has event_id - match via events table
    IF NEW.event_id IS NOT NULL THEN
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      JOIN public.events e ON e.id = NEW.event_id
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND
         EXISTS (
           SELECT 1 FROM public.artists a
           WHERE a.id = sp.artist_id
           AND (e.artist_id = a.id OR (e.artist_id IS NOT NULL AND (
             EXISTS (
               SELECT 1 FROM public.external_entity_ids eei
               WHERE eei.entity_uuid = e.artist_id
                 AND eei.entity_type = 'artist'
                 AND eei.source = 'jambase'
                 AND eei.external_id = a.identifier
             )
           )))
         )) OR
        (sp.participant_type = 'venue' AND
         EXISTS (
           SELECT 1 FROM public.venues v
           WHERE v.id = sp.venue_id
           AND (e.venue_id = v.id OR (e.venue_id IS NOT NULL AND (
             EXISTS (
               SELECT 1 FROM public.external_entity_ids eei
               WHERE eei.entity_uuid = e.venue_id
                 AND eei.entity_type = 'venue'
                 AND eei.source = 'jambase'
                 AND eei.external_id = v.identifier
             )
           )))
         )) OR
        (sp.participant_type = 'city' AND e.venue_city = sp.text_value) OR
        (sp.participant_type = 'genre' AND e.genres IS NOT NULL AND e.genres @> ARRAY[sp.text_value])
      );
    ELSE
      -- Case B: Review has event_id = NULL - match via reviews.artist_id, reviews.venue_id
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = NEW.artist_id) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = NEW.venue_id)
      );
    END IF;
  END IF;

  IF v_scene_ids IS NOT NULL AND array_length(v_scene_ids, 1) > 0 THEN
    PERFORM public.calculate_scene_progress(v_user_id, unnest_scene_id)
    FROM UNNEST(v_scene_ids) AS unnest_scene_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_update_scene_progress() IS
  'Auto-update scene progress when reviews or passport entries change. Handles reviews with event_id NULL via reviews.artist_id and reviews.venue_id.';

-- ============================================================
-- STEP 2: Fix calculate_scene_progress to count reviews without events
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
  v_experienced_count INTEGER;
BEGIN
  SELECT * INTO v_scene FROM public.scenes WHERE id = p_scene_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_existing_progress
  FROM public.user_scene_progress
  WHERE user_id = p_user_id AND scene_id = p_scene_id;

  SELECT
    ARRAY_AGG(DISTINCT artist_id) FILTER (WHERE artist_id IS NOT NULL),
    ARRAY_AGG(DISTINCT venue_id) FILTER (WHERE venue_id IS NOT NULL),
    ARRAY_AGG(DISTINCT text_value) FILTER (WHERE participant_type = 'city' AND text_value IS NOT NULL),
    ARRAY_AGG(DISTINCT text_value) FILTER (WHERE participant_type = 'genre' AND text_value IS NOT NULL)
  INTO v_artist_ids, v_venue_ids, v_city_names, v_genre_names
  FROM public.scene_participants
  WHERE scene_id = p_scene_id;

  -- Count artists experienced (reviews with events + reviews without events)
  IF v_artist_ids IS NOT NULL AND array_length(v_artist_ids, 1) > 0 THEN
    SELECT COUNT(DISTINCT artist_uuid) INTO v_artists_count
    FROM (
      SELECT a.id AS artist_uuid
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      JOIN public.artists a ON e.artist_id = a.id
      WHERE r.user_id = p_user_id
        AND r.is_draft = false
        AND r.event_id IS NOT NULL
        AND a.id = ANY(v_artist_ids)
      UNION
      SELECT r.artist_id AS artist_uuid
      FROM public.reviews r
      WHERE r.user_id = p_user_id
        AND r.is_draft = false
        AND r.event_id IS NULL
        AND r.artist_id IS NOT NULL
        AND r.artist_id = ANY(v_artist_ids)
      UNION
      SELECT a.id AS artist_uuid
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

  -- Count venues experienced (reviews with events + reviews without events)
  IF v_venue_ids IS NOT NULL AND array_length(v_venue_ids, 1) > 0 THEN
    SELECT COUNT(DISTINCT venue_uuid) INTO v_venues_count
    FROM (
      SELECT v.id AS venue_uuid
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      JOIN public.venues v ON e.venue_id = v.id
      WHERE r.user_id = p_user_id
        AND r.is_draft = false
        AND r.event_id IS NOT NULL
        AND v.id = ANY(v_venue_ids)
      UNION
      SELECT r.venue_id AS venue_uuid
      FROM public.reviews r
      WHERE r.user_id = p_user_id
        AND r.is_draft = false
        AND r.event_id IS NULL
        AND r.venue_id IS NOT NULL
        AND r.venue_id = ANY(v_venue_ids)
      UNION
      SELECT v.id AS venue_uuid
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
    ) ven;
  END IF;

  -- Count cities experienced (passport only - reviews without events don't have city)
  IF v_city_names IS NOT NULL AND array_length(v_city_names, 1) > 0 THEN
    SELECT COUNT(DISTINCT entity_name) INTO v_cities_count
    FROM public.passport_entries
    WHERE user_id = p_user_id
      AND type = 'city'
      AND entity_name = ANY(v_city_names);
  END IF;

  -- Count genres experienced (from reviews with events only - event-free reviews don't have event genres)
  IF v_genre_names IS NOT NULL AND array_length(v_genre_names, 1) > 0 THEN
    SELECT COUNT(DISTINCT genre_name) INTO v_genres_count
    FROM (
      SELECT DISTINCT unnest(e.genres) as genre_name
      FROM public.reviews r
      JOIN public.events e ON r.event_id = e.id
      WHERE r.user_id = p_user_id
        AND r.is_draft = false
        AND r.event_id IS NOT NULL
        AND e.genres IS NOT NULL
    ) g
    WHERE genre_name = ANY(v_genre_names);
  END IF;

  -- Count events experienced (reviews with events only)
  SELECT COUNT(DISTINCT r.event_id) INTO v_events_count
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE r.user_id = p_user_id
    AND r.is_draft = false
    AND r.event_id IS NOT NULL
    AND (
      (v_artist_ids IS NULL OR e.artist_id = ANY(v_artist_ids))
      OR (v_venue_ids IS NULL OR e.venue_id = ANY(v_venue_ids))
      OR (v_city_names IS NULL OR e.venue_city = ANY(v_city_names))
      OR (v_genre_names IS NULL OR (e.genres IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(e.genres) g WHERE g = ANY(v_genre_names)
      )))
    );

  v_total_count := COALESCE(array_length(v_artist_ids, 1), 0) +
                   COALESCE(array_length(v_venue_ids, 1), 0) +
                   COALESCE(array_length(v_city_names, 1), 0) +
                   COALESCE(array_length(v_genre_names, 1), 0);

  IF v_total_count > 0 THEN
    v_progress_pct := LEAST(100, ROUND(
      ((v_artists_count + v_venues_count + v_cities_count + v_genres_count)::NUMERIC / v_total_count::NUMERIC) * 100
    )::INTEGER);
  END IF;

  v_discovered_at := COALESCE(v_existing_progress.discovered_at, NULL);
  v_started_at := COALESCE(v_existing_progress.started_at, NULL);
  v_completed_at := COALESCE(v_existing_progress.completed_at, NULL);
  v_experienced_count := v_artists_count + v_venues_count + v_cities_count + v_genres_count;

  IF v_progress_pct >= 100 OR (v_experienced_count >= COALESCE(v_scene.completion_threshold, 10)) THEN
    v_discovery_state := 'completed';
    IF v_completed_at IS NULL THEN v_completed_at := NOW(); END IF;
    IF v_started_at IS NULL THEN v_started_at := COALESCE(v_existing_progress.started_at, NOW()); END IF;
    IF v_discovered_at IS NULL THEN v_discovered_at := COALESCE(v_existing_progress.discovered_at, NOW()); END IF;
  ELSIF v_experienced_count >= COALESCE(v_scene.discovery_threshold, 1) THEN
    v_discovery_state := 'in_progress';
    IF v_started_at IS NULL THEN v_started_at := NOW(); END IF;
    IF v_discovered_at IS NULL THEN v_discovered_at := COALESCE(v_existing_progress.discovered_at, NOW()); END IF;
  ELSIF v_experienced_count > 0 THEN
    v_discovery_state := 'discovered';
    IF v_discovered_at IS NULL THEN v_discovered_at := COALESCE(v_existing_progress.discovered_at, NOW()); END IF;
  ELSE
    v_discovery_state := 'undiscovered';
  END IF;

  INSERT INTO public.user_scene_progress (
    user_id, scene_id,
    artists_experienced, venues_experienced, cities_experienced, genres_experienced, events_experienced,
    progress_percentage, discovery_state, discovered_at, started_at, completed_at, last_activity_at
  ) VALUES (
    p_user_id, p_scene_id,
    v_artists_count, v_venues_count, v_cities_count, v_genres_count, v_events_count,
    v_progress_pct, v_discovery_state, v_discovered_at, v_started_at, v_completed_at, NOW()
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

COMMENT ON FUNCTION public.calculate_scene_progress(UUID, UUID) IS
  'Calculates user scene progress from reviews (with and without event_id) and passport entries.';

-- ============================================================
-- STEP 3: Backfill existing user progress
-- ============================================================
DO $$
DECLARE
  v_user RECORD;
  v_scene RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.reviews
    WHERE is_draft = false
  LOOP
    FOR v_scene IN
      SELECT id FROM public.scenes WHERE is_active = true
    LOOP
      PERFORM public.calculate_scene_progress(v_user.user_id, v_scene.id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Scene progress backfill: recalculated for % user-scene pairs', v_count;
END;
$$;

COMMIT;
