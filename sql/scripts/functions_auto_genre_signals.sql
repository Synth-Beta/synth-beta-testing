-- ============================================
-- AUTO-GENRE SIGNAL GENERATION
-- ============================================
-- This function ensures that whenever a signal is created for an artist or event,
-- corresponding genre signals are automatically created.
-- This is a trigger function that runs AFTER INSERT on user_preference_signals.

-- ============================================
-- FUNCTION: Auto-generate genre signals
-- ============================================
CREATE OR REPLACE FUNCTION auto_generate_genre_signals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genres TEXT[];
  v_genre TEXT;
  v_artist_genres TEXT[];
  v_event_genres TEXT[];
  v_artist_id UUID;
  v_event_id UUID;
BEGIN
  -- Only process if this is an artist or event signal
  IF NEW.entity_type NOT IN ('artist', 'event') THEN
    RETURN NEW;
  END IF;

  -- Skip if genre is already set (means genre signal was already created)
  IF NEW.genre IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if this is already a genre-related signal type
  IF NEW.signal_type::TEXT LIKE '%genre%' OR 
     NEW.signal_type::TEXT LIKE '%manual_preference%' THEN
    RETURN NEW;
  END IF;

  -- Get genres based on entity type
  IF NEW.entity_type = 'artist' THEN
    -- Get artist genres
    IF NEW.entity_id IS NOT NULL THEN
      SELECT genres INTO v_artist_genres
      FROM public.artists
      WHERE id = NEW.entity_id;
    END IF;
    
    v_genres := COALESCE(v_artist_genres, ARRAY[]::TEXT[]);
    
  ELSIF NEW.entity_type = 'event' THEN
    -- Get event genres
    IF NEW.entity_id IS NOT NULL THEN
      SELECT genres INTO v_event_genres
      FROM public.events
      WHERE id = NEW.entity_id;
    END IF;
    
    v_genres := COALESCE(v_event_genres, ARRAY[]::TEXT[]);
  END IF;

  -- If no genres found, try to extract from context or entity_name
  IF v_genres IS NULL OR array_length(v_genres, 1) = 0 THEN
    -- Try to get genres from context if available
    IF NEW.context IS NOT NULL AND NEW.context ? 'genres' THEN
      v_genres := ARRAY(SELECT jsonb_array_elements_text(NEW.context->'genres'));
    ELSIF NEW.context IS NOT NULL AND NEW.context ? 'genre' THEN
      v_genres := ARRAY[NEW.context->>'genre'];
    END IF;
  END IF;

  -- Create genre signals for each genre
  IF v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
    FOREACH v_genre IN ARRAY v_genres
    LOOP
      -- Skip empty genres
      IF v_genre IS NULL OR trim(v_genre) = '' THEN
        CONTINUE;
      END IF;

      -- Insert genre signal with same signal_type but genre populated
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at,
        created_at,
        updated_at
      ) VALUES (
        NEW.user_id,
        NEW.signal_type,
        NEW.entity_type,
        NEW.entity_id,
        NEW.entity_name,
        NEW.signal_weight,
        v_genre,  -- Genre is set here
        COALESCE(NEW.context, '{}'::jsonb) || jsonb_build_object('auto_generated', true, 'source_signal_id', NEW.id),
        NEW.occurred_at,
        NEW.created_at,
        NEW.updated_at
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================
-- TRIGGER: Auto-generate genre signals on insert
-- ============================================
DROP TRIGGER IF EXISTS trigger_auto_generate_genre_signals ON public.user_preference_signals;

CREATE TRIGGER trigger_auto_generate_genre_signals
  AFTER INSERT ON public.user_preference_signals
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_genre_signals();

-- ============================================
-- FUNCTION: Ensure genres for existing signals
-- ============================================
-- This function can be run to backfill genre signals for existing data
CREATE OR REPLACE FUNCTION backfill_genre_signals()
RETURNS TABLE(
  signals_processed INTEGER,
  genre_signals_created INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal RECORD;
  v_genres TEXT[];
  v_genre TEXT;
  v_processed INTEGER := 0;
  v_created INTEGER := 0;
BEGIN
  -- Process all artist and event signals that don't have genre set
  FOR v_signal IN
    SELECT 
      id,
      user_id,
      signal_type,
      entity_type,
      entity_id,
      entity_name,
      signal_weight,
      genre,
      context,
      occurred_at,
      created_at,
      updated_at
    FROM public.user_preference_signals
    WHERE entity_type IN ('artist', 'event')
      AND genre IS NULL
      AND signal_type::TEXT NOT LIKE '%genre%'
      AND signal_type::TEXT NOT LIKE '%manual_preference%'
  LOOP
    v_processed := v_processed + 1;
    v_genres := NULL;

    -- Get genres based on entity type
    IF v_signal.entity_type = 'artist' AND v_signal.entity_id IS NOT NULL THEN
      SELECT genres INTO v_genres
      FROM public.artists
      WHERE id = v_signal.entity_id;
      
    ELSIF v_signal.entity_type = 'event' AND v_signal.entity_id IS NOT NULL THEN
      SELECT genres INTO v_genres
      FROM public.events
      WHERE id = v_signal.entity_id;
    END IF;

    -- Try context if no genres found
    IF (v_genres IS NULL OR array_length(v_genres, 1) = 0) AND v_signal.context IS NOT NULL THEN
      IF v_signal.context ? 'genres' THEN
        v_genres := ARRAY(SELECT jsonb_array_elements_text(v_signal.context->'genres'));
      ELSIF v_signal.context ? 'genre' THEN
        v_genres := ARRAY[v_signal.context->>'genre'];
      END IF;
    END IF;

    -- Create genre signals
    IF v_genres IS NOT NULL AND array_length(v_genres, 1) > 0 THEN
      FOREACH v_genre IN ARRAY v_genres
      LOOP
        IF v_genre IS NULL OR trim(v_genre) = '' THEN
          CONTINUE;
        END IF;

        INSERT INTO public.user_preference_signals (
          user_id,
          signal_type,
          entity_type,
          entity_id,
          entity_name,
          signal_weight,
          genre,
          context,
          occurred_at,
          created_at,
          updated_at
        ) VALUES (
          v_signal.user_id,
          v_signal.signal_type,
          v_signal.entity_type,
          v_signal.entity_id,
          v_signal.entity_name,
          v_signal.signal_weight,
          v_genre,
          COALESCE(v_signal.context, '{}'::jsonb) || jsonb_build_object('auto_generated', true, 'source_signal_id', v_signal.id),
          v_signal.occurred_at,
          v_signal.created_at,
          v_signal.updated_at
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;

        v_created := v_created + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_created;
END;
$$;

-- ============================================
-- FUNCTION: Verify genre coverage
-- ============================================
-- Check how many artist/event signals are missing genre signals
CREATE OR REPLACE FUNCTION verify_genre_coverage()
RETURNS TABLE(
  total_artist_event_signals INTEGER,
  signals_with_genres INTEGER,
  signals_without_genres INTEGER,
  coverage_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_with_genres INTEGER;
  v_without_genres INTEGER;
BEGIN
  -- Count total artist/event signals (excluding genre signals)
  SELECT COUNT(*) INTO v_total
  FROM public.user_preference_signals
  WHERE entity_type IN ('artist', 'event')
    AND signal_type::TEXT NOT LIKE '%genre%'
    AND signal_type::TEXT NOT LIKE '%manual_preference%';

  -- Count signals that have genre signals
  SELECT COUNT(DISTINCT s1.id) INTO v_with_genres
  FROM public.user_preference_signals s1
  WHERE s1.entity_type IN ('artist', 'event')
    AND s1.signal_type::TEXT NOT LIKE '%genre%'
    AND s1.signal_type::TEXT NOT LIKE '%manual_preference%'
    AND EXISTS (
      SELECT 1
      FROM public.user_preference_signals s2
      WHERE s2.user_id = s1.user_id
        AND s2.signal_type = s1.signal_type
        AND s2.entity_type = s1.entity_type
        AND s2.entity_id = s1.entity_id
        AND s2.occurred_at = s1.occurred_at
        AND s2.genre IS NOT NULL
    );

  v_without_genres := v_total - v_with_genres;

  RETURN QUERY SELECT 
    v_total,
    v_with_genres,
    v_without_genres,
    CASE 
      WHEN v_total > 0 THEN ROUND((v_with_genres::NUMERIC / v_total::NUMERIC) * 100, 2)
      ELSE 0
    END;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION auto_generate_genre_signals() TO authenticated;
GRANT EXECUTE ON FUNCTION backfill_genre_signals() TO authenticated;
GRANT EXECUTE ON FUNCTION verify_genre_coverage() TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION auto_generate_genre_signals() IS 'Trigger function that automatically creates genre signals when artist/event signals are inserted';
COMMENT ON FUNCTION backfill_genre_signals() IS 'Backfills genre signals for existing artist/event signals that are missing genres';
COMMENT ON FUNCTION verify_genre_coverage() IS 'Verifies how many artist/event signals have corresponding genre signals';

















