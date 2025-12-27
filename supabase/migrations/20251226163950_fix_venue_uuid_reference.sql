-- Fix reference to e.venue_uuid, e.venue_name, and e.artist_name in passport trigger function
-- Fix reference to je.artist_uuid and je.venue_uuid in auto_populate_review functions
-- The events table uses venue_id (UUID FK), not venue_uuid
-- The events table does not have venue_name or artist_name columns - need to join with venues and artists tables
-- The events.artist_id and events.venue_id are UUID FKs, not JamBase IDs - need to look up JamBase IDs from external_entity_ids
-- The table is now called 'events' not 'jambase_events'
-- This fixes the errors: column e.venue_uuid does not exist, column e.venue_name does not exist, column e.artist_name does not exist, column e.artist_uuid does not exist

BEGIN;

-- Recreate the function to ensure it uses UUID FKs and joins with venues/artists tables for names
CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_data RECORD;
  v_jambase_venue_id TEXT;
  v_jambase_artist_id TEXT;
BEGIN
  -- Only process if review is not a draft and user attended
  IF NEW.is_draft = false AND (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    -- Get event details - join with venues and artists tables to get names
    SELECT 
      e.venue_city,
      e.venue_state,
      e.venue_id, -- UUID FK to venues.id
      v.name as venue_name, -- Get venue name from venues table
      e.artist_id, -- UUID FK to artists.id
      a.name as artist_name -- Get artist name from artists table
    INTO v_event_data
    FROM public.events e
    LEFT JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN public.artists a ON a.id = e.artist_id
    WHERE e.id = NEW.event_id;
    
    IF v_event_data IS NOT NULL THEN
      -- Unlock city (skip if "Unknown")
      IF v_event_data.venue_city IS NOT NULL 
         AND LOWER(TRIM(v_event_data.venue_city)) != 'unknown' THEN
        PERFORM public.unlock_passport_city(
          NEW.user_id,
          v_event_data.venue_city,
          v_event_data.venue_state
        );
      END IF;
      
      -- Unlock venue using venue_id
      -- Note: unlock_passport_venue expects a TEXT venue_id (JamBase ID)
      -- The events.venue_id is a UUID FK, so we need to look up the JamBase ID
      IF v_event_data.venue_name IS NOT NULL THEN
        -- Try to get JamBase venue_id from external_entity_ids
        BEGIN
          SELECT eei.external_id INTO v_jambase_venue_id
          FROM public.external_entity_ids eei
          WHERE eei.entity_type = 'venue'
            AND eei.entity_uuid = v_event_data.venue_id
            AND eei.source = 'jambase'
          LIMIT 1;
          
          -- Use JamBase ID if found, otherwise pass NULL (function will use venue name)
          PERFORM public.unlock_passport_venue(
            NEW.user_id,
            v_jambase_venue_id, -- JamBase venue ID if available, NULL otherwise
            v_event_data.venue_name
          );
        EXCEPTION WHEN others THEN
          -- If lookup fails, just use venue name (function handles NULL venue_id)
          PERFORM public.unlock_passport_venue(
            NEW.user_id,
            NULL,
            v_event_data.venue_name
          );
        END;
      END IF;
      
      -- Unlock artist using artist_id
      -- Note: unlock_passport_artist expects a TEXT artist_id (JamBase ID)
      -- The events.artist_id is a UUID FK, so we need to look up the JamBase ID
      IF v_event_data.artist_name IS NOT NULL THEN
        BEGIN
          -- Try to get JamBase artist_id from external_entity_ids
          SELECT eei.external_id INTO v_jambase_artist_id
          FROM public.external_entity_ids eei
          WHERE eei.entity_type = 'artist'
            AND eei.entity_uuid = v_event_data.artist_id
            AND eei.source = 'jambase'
          LIMIT 1;
          
          -- Use JamBase ID if found, otherwise pass NULL (function will use artist name)
          PERFORM public.unlock_passport_artist(
            NEW.user_id,
            v_jambase_artist_id, -- JamBase artist ID if available, NULL otherwise
            v_event_data.artist_name
          );
        EXCEPTION WHEN others THEN
          -- If lookup fails, just use artist name (function handles NULL artist_id)
          PERFORM public.unlock_passport_artist(
            NEW.user_id,
            NULL,
            v_event_data.artist_name
          );
        END;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_unlock_passport_on_review() IS 
  'Auto-unlock passport entries when a review is created. Fixed to use events.venue_id and events.artist_id (UUID FKs) and join with venues/artists tables for names. Looks up JamBase IDs from external_entity_ids.';

-- Fix auto_populate_review_artist_id() function
-- This function is triggered BEFORE INSERT on reviews to populate artist_id from the event
-- reviews.artist_id is UUID (not TEXT) - references artists(id)
CREATE OR REPLACE FUNCTION public.auto_populate_review_artist_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_artist_uuid UUID;
  v_candidate UUID;
  v_selected_artist JSONB;
BEGIN
  IF NEW.artist_id IS NULL THEN
    -- Try to use draft_data.selectedArtist.id when provided
    IF NEW.draft_data IS NOT NULL AND NEW.draft_data ? 'selectedArtist' THEN
      v_selected_artist := NEW.draft_data->'selectedArtist';
      BEGIN
        v_candidate := (v_selected_artist->>'id')::UUID;
        IF v_candidate IS NOT NULL THEN
          NEW.artist_id := v_candidate;
        END IF;
      EXCEPTION WHEN others THEN
        -- Invalid UUID, skip
        NULL;
      END;
    END IF;

    -- If still NULL, try to get from event
    IF NEW.artist_id IS NULL THEN
      -- Use events.artist_id (UUID FK) instead of jambase_events.artist_uuid
      SELECT e.artist_id
      INTO v_event_artist_uuid
      FROM public.events e
      WHERE e.id = NEW.event_id;

      IF v_event_artist_uuid IS NOT NULL THEN
        NEW.artist_id := v_event_artist_uuid;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.auto_populate_review_artist_id() IS 
  'Auto-populate review artist_id from event. Fixed to use events.artist_id (UUID FK) instead of jambase_events.artist_uuid. reviews.artist_id is UUID type.';

-- Fix auto_populate_review_venue_id() function
-- This function is triggered BEFORE INSERT on reviews to populate venue_id from the event
-- reviews.venue_id is UUID (not TEXT) - references venues(id)
CREATE OR REPLACE FUNCTION public.auto_populate_review_venue_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_venue_uuid UUID;
  v_candidate UUID;
  v_selected_venue JSONB;
BEGIN
  IF NEW.venue_id IS NULL THEN
    -- Try to use draft_data.selectedVenue.id when provided
    IF NEW.draft_data IS NOT NULL AND NEW.draft_data ? 'selectedVenue' THEN
      v_selected_venue := NEW.draft_data->'selectedVenue';
      BEGIN
        v_candidate := (v_selected_venue->>'id')::UUID;
        IF v_candidate IS NOT NULL THEN
          NEW.venue_id := v_candidate;
        END IF;
      EXCEPTION WHEN others THEN
        -- Invalid UUID, skip
        NULL;
      END;
    END IF;

    -- If still NULL, try to get from event
    IF NEW.venue_id IS NULL THEN
      -- Use events.venue_id (UUID FK) instead of jambase_events.venue_uuid
      SELECT e.venue_id
      INTO v_event_venue_uuid
      FROM public.events e
      WHERE e.id = NEW.event_id;

      IF v_event_venue_uuid IS NOT NULL THEN
        NEW.venue_id := v_event_venue_uuid;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.auto_populate_review_venue_id() IS 
  'Auto-populate review venue_id from event. Fixed to use events.venue_id (UUID FK) instead of jambase_events.venue_uuid. reviews.venue_id is UUID type.';

-- Fix capture_review_music_data() function
-- This function is triggered AFTER INSERT/UPDATE on reviews to capture music data
-- It was querying from jambase_events with columns that don't exist
CREATE OR REPLACE FUNCTION capture_review_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_event_record RECORD;
  v_song TEXT;
  v_genre TEXT;
  v_all_genres TEXT[];
  v_review_row JSONB;
  v_review_genre_tags TEXT[] := ARRAY[]::TEXT[];
  v_rating NUMERIC;
  v_artist_performance_rating NUMERIC;
  v_production_rating NUMERIC;
  v_venue_rating NUMERIC;
  v_location_rating NUMERIC;
  v_value_rating NUMERIC;
  v_ticket_price NUMERIC;
  v_has_photos BOOLEAN := FALSE;
  v_custom_setlist JSONB;
  v_artist_uuid UUID;
BEGIN
  -- Skip drafts entirely to avoid polluting music signals
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;

  -- Get event data - join with artists and venues tables to get names
  SELECT 
    e.id, 
    a.name as artist_name, -- Get artist name from artists table
    e.artist_id, -- UUID FK to artists.id
    COALESCE(e.genres, ARRAY[]::TEXT[]) as genres,
    v.name as venue_name, -- Get venue name from venues table
    e.venue_id, -- UUID FK to venues.id
    e.event_date
  INTO v_event_record
  FROM public.events e
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  WHERE e.id = NEW.event_id;
  
  -- Use artist_id (UUID FK) directly
  v_artist_uuid := v_event_record.artist_id;
  
  -- Snapshot the review row as JSONB to safely access optional fields
  v_review_row := to_jsonb(NEW);

  -- Extract review genre tags if present
  IF v_review_row ? 'genre_tags' AND jsonb_typeof(v_review_row->'genre_tags') = 'array' THEN
    SELECT array_agg(elem.value)
    INTO v_review_genre_tags
    FROM jsonb_array_elements_text(v_review_row->'genre_tags') AS elem(value);
  END IF;

  -- Combine event genres with review genre tags
  v_all_genres := v_event_record.genres || COALESCE(v_review_genre_tags, ARRAY[]::TEXT[]);

  -- Extract numeric rating details if present
  v_rating := NULLIF(v_review_row->>'rating', '')::NUMERIC;
  v_artist_performance_rating := NULLIF(v_review_row->>'artist_performance_rating', '')::NUMERIC;
  v_production_rating := NULLIF(v_review_row->>'production_rating', '')::NUMERIC;
  v_venue_rating := NULLIF(v_review_row->>'venue_rating', '')::NUMERIC;
  v_location_rating := NULLIF(v_review_row->>'location_rating', '')::NUMERIC;
  v_value_rating := NULLIF(v_review_row->>'value_rating', '')::NUMERIC;
  v_ticket_price := NULLIF(v_review_row->>'ticket_price_paid', '')::NUMERIC;

  -- Determine if photos/custom setlist exist
  IF (v_review_row ? 'photos') THEN
    v_has_photos := jsonb_typeof(v_review_row->'photos') = 'array'
      AND jsonb_array_length(v_review_row->'photos') > 0;
  END IF;

  IF (v_review_row ? 'custom_setlist') THEN
    v_custom_setlist := v_review_row->'custom_setlist';
    IF jsonb_typeof(v_custom_setlist) = 'array' THEN
      IF jsonb_array_length(v_custom_setlist) = 0 THEN
        v_custom_setlist := NULL;
      END IF;
    ELSE
      v_custom_setlist := NULL;
    END IF;
  END IF;
  
  -- Insert artist interaction FOR THIS USER (reviews are strongest signal)
  IF v_event_record.artist_name IS NOT NULL THEN
    INSERT INTO user_artist_interactions (
      user_id,
      artist_id,
      artist_name,
      interaction_type,
      interaction_strength,
      genres,
      source_entity_type,
      source_entity_id,
      metadata,
      occurred_at
    ) VALUES (
      NEW.user_id,
      v_artist_uuid,
      v_event_record.artist_name,
      'review',
      9,
      v_all_genres,
      'review',
      NEW.id::TEXT,
      jsonb_build_object(
        'rating', v_rating,
        'artist_performance_rating', v_artist_performance_rating,
        'production_rating', v_production_rating,
        'venue_rating', v_venue_rating,
        'location_rating', v_location_rating,
        'value_rating', v_value_rating,
        'ticket_price_paid', v_ticket_price,
        'has_photos', v_has_photos,
        'has_custom_setlist', v_custom_setlist IS NOT NULL
      ),
      NEW.created_at
    );
  END IF;
  
  -- Insert genre interactions FOR THIS USER (from event + review tags)
  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      INSERT INTO user_genre_interactions (
        user_id,
        genre,
        interaction_type,
        interaction_count,
        artist_names,
        source_entity_type,
        source_entity_id,
        occurred_at
      ) VALUES (
        NEW.user_id,
        v_genre,
        'review',
        1,
        ARRAY[v_event_record.artist_name],
        'review',
        NEW.id::TEXT,
        NEW.created_at
      );
    END LOOP;
  END IF;
  
  -- Insert song interactions FOR THIS USER (from custom setlist)
  IF v_custom_setlist IS NOT NULL THEN
    FOR v_song IN
      SELECT
        COALESCE(
          elem->>'title',
          elem->>'name',
          elem->>'song',
          NULLIF(trim(both '"' FROM elem::TEXT), '')
        )
      FROM jsonb_array_elements(v_custom_setlist) elem
    LOOP
      CONTINUE WHEN v_song IS NULL OR v_song = '';
      INSERT INTO user_song_interactions (
        user_id,
        song_id,
        song_name,
        artist_names,
        genres,
        interaction_type,
        source_entity_type,
        source_entity_id,
        occurred_at
      ) VALUES (
        NEW.user_id,
        md5(v_song || v_event_record.artist_name),
        v_song,
        ARRAY[v_event_record.artist_name],
        v_event_record.genres,
        'custom_setlist_added',
        'review',
        NEW.id::TEXT,
        NEW.created_at
      );
    END LOOP;
  END IF;
  
  -- Update artist preference signal FOR THIS USER (highest weight for reviews)
  IF v_event_record.artist_name IS NOT NULL THEN
    INSERT INTO music_preference_signals (
      user_id, 
      preference_type, 
      preference_value,
      preference_score, 
      interaction_count, 
      interaction_types,
      first_interaction, 
      last_interaction, 
      confidence
    ) VALUES (
      NEW.user_id, 
      'artist', 
      v_event_record.artist_name,
      15.0, 
      1, 
      jsonb_build_object('review', 1),
      NEW.created_at, 
      NEW.created_at, 
      0.95
    )
    ON CONFLICT (user_id, preference_type, preference_value)
    DO UPDATE SET
      preference_score = music_preference_signals.preference_score + 15.0,
      interaction_count = music_preference_signals.interaction_count + 1,
      last_interaction = NEW.created_at,
      updated_at = now();
  END IF;
  
  -- Update genre preference signals FOR THIS USER
  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      INSERT INTO music_preference_signals (
        user_id,
        preference_type,
        preference_value,
        preference_score,
        interaction_count,
        interaction_types,
        first_interaction,
        last_interaction,
        confidence
      ) VALUES (
        NEW.user_id,
        'genre',
        v_genre,
        10.0,
        1,
        jsonb_build_object('review', 1),
        NEW.created_at,
        NEW.created_at,
        0.9
      )
      ON CONFLICT (user_id, preference_type, preference_value)
      DO UPDATE SET
        preference_score = music_preference_signals.preference_score + 10.0,
        interaction_count = music_preference_signals.interaction_count + 1,
        last_interaction = NEW.created_at,
        updated_at = now();
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION capture_review_music_data() IS 
  'Captures music metadata from user reviews. Fixed to use events table (not jambase_events) and join with artists/venues tables for names. Uses events.artist_id (UUID FK) directly.';

-- Fix auto_update_scene_progress() function
-- This function is triggered AFTER INSERT/UPDATE on reviews to update scene progress
-- It was referencing e.artist_uuid and e.venue_uuid which don't exist
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
    -- Match by artist/venue UUID (using events.artist_id and events.venue_id), city name, or genre
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    JOIN public.events e ON e.id = NEW.event_id
    WHERE sp.scene_id IN (
      SELECT id FROM public.scenes WHERE is_active = true
    )
    AND (
      -- Match artist by UUID - use e.artist_id (UUID FK) instead of e.artist_uuid
      (sp.participant_type = 'artist' AND 
       EXISTS (
         SELECT 1 FROM public.artists a 
         WHERE a.id = sp.artist_id 
         AND (e.artist_id = a.id OR (e.artist_id IS NOT NULL AND (
           -- Try to match via external_entity_ids if artist_id is a UUID
           EXISTS (
             SELECT 1 FROM public.external_entity_ids eei
             WHERE eei.entity_uuid = e.artist_id
               AND eei.entity_type = 'artist'
               AND eei.source = 'jambase'
               AND eei.external_id = a.identifier
           )
         )))
       )) OR
      -- Match venue by UUID - use e.venue_id (UUID FK) instead of e.venue_uuid
      (sp.participant_type = 'venue' AND 
       EXISTS (
         SELECT 1 FROM public.venues v 
         WHERE v.id = sp.venue_id 
         AND (e.venue_id = v.id OR (e.venue_id IS NOT NULL AND (
           -- Try to match via external_entity_ids if venue_id is a UUID
           EXISTS (
             SELECT 1 FROM public.external_entity_ids eei
             WHERE eei.entity_uuid = e.venue_id
               AND eei.entity_type = 'venue'
               AND eei.source = 'jambase'
               AND eei.external_id = v.identifier
           )
         )))
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

COMMENT ON FUNCTION public.auto_update_scene_progress() IS 
  'Auto-update scene progress when reviews or passport entries change. Fixed to use events.artist_id and events.venue_id (UUID FKs) instead of artist_uuid and venue_uuid.';

-- ============================================================
-- PART 2: Fix review rating system to allow NULLs for unused categories
-- ============================================================
-- The ensure_draft_no_rating trigger was defaulting to 3.0 when no ratings provided
-- All category ratings should be nullable to support different review types (event, venue, artist)

-- Step 1: Fix the ensure_draft_no_rating trigger to:
-- - Only calculate rating from categories that are actually provided
-- - Allow NULL rating if no categories are provided (for different review types)
-- - Not default to 3.0
CREATE OR REPLACE FUNCTION public.ensure_draft_no_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_sum NUMERIC := 0;
  v_count INTEGER := 0;
  v_avg NUMERIC;
BEGIN
  -- If this is a draft, ensure rating is NULL
  IF NEW.is_draft = true THEN
    NEW.rating := NULL;
  -- If this is being published (is_draft = false), calculate rating from available category ratings
  ELSIF NEW.is_draft = false THEN
    -- Only calculate if at least one category rating is provided
    IF NEW.artist_performance_rating IS NOT NULL 
       OR NEW.production_rating IS NOT NULL 
       OR NEW.venue_rating IS NOT NULL 
       OR NEW.location_rating IS NOT NULL 
       OR NEW.value_rating IS NOT NULL THEN
      -- Calculate average from available category ratings only
      IF NEW.artist_performance_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.artist_performance_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.production_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.production_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.venue_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.venue_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.location_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.location_rating;
        v_count := v_count + 1;
      END IF;
      IF NEW.value_rating IS NOT NULL THEN
        v_sum := v_sum + NEW.value_rating;
        v_count := v_count + 1;
      END IF;
      
      -- Only calculate if we have at least one rating
      IF v_count > 0 THEN
        v_avg := ROUND((v_sum / v_count)::NUMERIC, 1); -- Round to 1 decimal place
        NEW.rating := GREATEST(0.5, LEAST(5.0, v_avg)); -- Clamp between 0.5 and 5.0
      ELSE
        -- No ratings provided - allow NULL (for different review types)
        NEW.rating := NULL;
      END IF;
    ELSE
      -- No category ratings at all - allow NULL (for different review types)
      NEW.rating := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.ensure_draft_no_rating IS 
  'Ensures drafts have NULL rating. For published reviews, calculates rating as average of available category ratings only. Allows NULL rating if no categories are provided (supports different review types). Does not default to 3.0.';

-- Step 2: Update the rating check constraint to allow NULL for published reviews if no categories provided
-- Drop the old constraint if it exists
ALTER TABLE public.reviews 
  DROP CONSTRAINT IF EXISTS reviews_rating_check;

-- Add new constraint: rating can be NULL for drafts, or 0.5-5.0 for published reviews
-- Allow NULL for published reviews too (in case no categories are filled)
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_rating_check 
  CHECK (
    (is_draft = true AND rating IS NULL) OR 
    (is_draft = false AND (rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)))
  );

COMMENT ON COLUMN public.reviews.rating IS 
  'Overall rating calculated as average of available category ratings (artist_performance_rating, production_rating, venue_rating, location_rating, value_rating), rounded to 1 decimal place. NULL if no categories provided (supports different review types).';

COMMENT ON COLUMN public.reviews.artist_performance_rating IS 
  'Artist performance rating (0.5-5.0). NULL if not applicable to review type.';

COMMENT ON COLUMN public.reviews.production_rating IS 
  'Production quality rating (0.5-5.0). NULL if not applicable to review type.';

COMMENT ON COLUMN public.reviews.venue_rating IS 
  'Venue experience rating (0.5-5.0). NULL if not applicable to review type.';

COMMENT ON COLUMN public.reviews.location_rating IS 
  'Location & logistics rating (0.5-5.0). NULL if not applicable to review type.';

COMMENT ON COLUMN public.reviews.value_rating IS 
  'Value for ticket rating (0.5-5.0). NULL if not applicable to review type.';

-- ============================================================
-- PART 3: Fix average rating calculations to exclude NULL ratings
-- ============================================================
-- NULL ratings should not be factored into averages, and averages should be NULL (not 0) when no ratings exist

-- Fix get_venue_stats - exclude NULL ratings from averages
CREATE OR REPLACE FUNCTION public.get_venue_stats(venue_jambase_id TEXT)
RETURNS TABLE (
    total_reviews INTEGER,
    average_venue_rating NUMERIC,
    average_artist_rating NUMERIC,
    average_overall_rating NUMERIC,
    rating_distribution JSONB
) AS $$
DECLARE
  v_venue_uuid UUID;
BEGIN
  -- Look up UUID from external_entity_ids
  SELECT entity_uuid INTO v_venue_uuid
  FROM public.external_entity_ids
  WHERE external_id = venue_jambase_id
    AND source = 'jambase'
    AND entity_type = 'venue'
  LIMIT 1;
  
  -- If not found, return NULL averages (not 0)
  IF v_venue_uuid IS NULL THEN
    RETURN QUERY SELECT 
      0::INTEGER,
      NULL::NUMERIC,
      NULL::NUMERIC,
      NULL::NUMERIC,
      jsonb_build_object(
        '1_star', 0,
        '2_star', 0,
        '3_star', 0,
        '4_star', 0,
        '5_star', 0
      );
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE r.rating IS NOT NULL)::INTEGER as total_reviews,
    -- Only average non-NULL ratings, return NULL if no ratings exist
    AVG(r.venue_rating) FILTER (WHERE r.venue_rating IS NOT NULL)::NUMERIC as average_venue_rating,
    AVG(r.artist_performance_rating) FILTER (WHERE r.artist_performance_rating IS NOT NULL)::NUMERIC as average_artist_rating,
    AVG(r.rating) FILTER (WHERE r.rating IS NOT NULL)::NUMERIC as average_overall_rating,
    jsonb_build_object(
      '1_star', COUNT(*) FILTER (WHERE r.rating >= 1 AND r.rating < 2)::INTEGER,
      '2_star', COUNT(*) FILTER (WHERE r.rating >= 2 AND r.rating < 3)::INTEGER,
      '3_star', COUNT(*) FILTER (WHERE r.rating >= 3 AND r.rating < 4)::INTEGER,
      '4_star', COUNT(*) FILTER (WHERE r.rating >= 4 AND r.rating < 5)::INTEGER,
      '5_star', COUNT(*) FILTER (WHERE r.rating >= 5)::INTEGER
    ) as rating_distribution
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE e.venue_id = v_venue_uuid
    AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_venue_stats(TEXT) IS 
  'Returns venue statistics. Averages exclude NULL ratings and return NULL (not 0) when no ratings exist. Only counts reviews with non-NULL ratings.';

-- Fix get_artist_stats - exclude NULL ratings from averages
CREATE OR REPLACE FUNCTION public.get_artist_stats(artist_jambase_id TEXT)
RETURNS TABLE (
    total_reviews INTEGER,
    average_rating NUMERIC,
    rating_distribution JSONB
) AS $$
DECLARE
  v_artist_uuid UUID;
BEGIN
  -- Look up UUID from external_entity_ids
  SELECT entity_uuid INTO v_artist_uuid
  FROM public.external_entity_ids
  WHERE external_id = artist_jambase_id
    AND source = 'jambase'
    AND entity_type = 'artist'
  LIMIT 1;
  
  -- If not found, return NULL averages (not 0)
  IF v_artist_uuid IS NULL THEN
    RETURN QUERY SELECT 
      0::INTEGER,
      NULL::NUMERIC,
      jsonb_build_object(
        '1_star', 0,
        '2_star', 0,
        '3_star', 0,
        '4_star', 0,
        '5_star', 0
      );
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE r.rating IS NOT NULL)::INTEGER as total_reviews,
    -- Only average non-NULL ratings, return NULL if no ratings exist
    AVG(r.rating) FILTER (WHERE r.rating IS NOT NULL)::NUMERIC as average_rating,
    jsonb_build_object(
      '1_star', COUNT(*) FILTER (WHERE r.rating >= 1 AND r.rating < 2)::INTEGER,
      '2_star', COUNT(*) FILTER (WHERE r.rating >= 2 AND r.rating < 3)::INTEGER,
      '3_star', COUNT(*) FILTER (WHERE r.rating >= 3 AND r.rating < 4)::INTEGER,
      '4_star', COUNT(*) FILTER (WHERE r.rating >= 4 AND r.rating < 5)::INTEGER,
      '5_star', COUNT(*) FILTER (WHERE r.rating >= 5)::INTEGER
    ) as rating_distribution
  FROM public.reviews r
  JOIN public.events e ON r.event_id = e.id
  WHERE e.artist_id = v_artist_uuid
    AND r.is_draft = false;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_artist_stats(TEXT) IS 
  'Returns artist statistics. Averages exclude NULL ratings and return NULL (not 0) when no ratings exist. Only counts reviews with non-NULL ratings.';

COMMIT;

