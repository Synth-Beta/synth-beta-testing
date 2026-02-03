-- ============================================================
-- Spotify genre preference signals
-- Extracts genres from streaming_profiles.topArtistsByTimeRange,
-- normalizes via resolve_genre_to_canonical, weights by frequency
-- and time range, inserts into user_preference_signals.
-- ============================================================
-- Requires: streaming_profiles (20250210000005_create_streaming_profiles_staging),
-- preference_signal_type enum, user_preference_signals,
-- resolve_genre_to_canonical, genres
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Add spotify_genre to preference_signal_type enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'preference_signal_type' AND e.enumlabel = 'spotify_genre'
  ) THEN
    ALTER TYPE public.preference_signal_type ADD VALUE 'spotify_genre';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. process_spotify_genres_to_signals: extract genres and insert signals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_spotify_genres_to_signals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist JSONB;
  v_genre TEXT;
  v_canonical TEXT;
  v_time_range TEXT;
  v_time_mult NUMERIC;
  v_genre_agg RECORD;
  v_occurred_at TIMESTAMPTZ;
  v_idx INT := 0;
  -- temp table: (canonical_genre, total_count, best_time_mult)
  genre_counts JSONB := '{}'::JSONB;
  genre_time_mult JSONB := '{}'::JSONB;
  v_count INT;
  v_best_mult NUMERIC;
  v_weight NUMERIC;
  v_base_weight NUMERIC := 1.0;
  v_mult_med NUMERIC := 1.0;  -- fallback when topArtistsByTimeRange not present
BEGIN
  IF NEW.service_type != 'spotify' THEN
    RETURN NEW;
  END IF;

  -- Delete existing spotify_genre signals for this user (idempotent refresh)
  DELETE FROM public.user_preference_signals
  WHERE user_id = NEW.user_id AND signal_type = 'spotify_genre';

  -- Build genre aggregates from topArtistsByTimeRange or fallback to topArtists
  -- Structure: for each (time_range, artist), for each genre: add to count, track best time_mult
  IF NEW.profile_data ? 'topArtistsByTimeRange' AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange') = 'object' THEN
    -- Use topArtistsByTimeRange: short_term=1.5x, medium_term=1.0x, long_term=0.7x
    FOR v_time_range, v_time_mult IN
      SELECT 'short_term'::TEXT, 1.5::NUMERIC
      UNION ALL SELECT 'medium_term', 1.0::NUMERIC
      UNION ALL SELECT 'long_term', 0.7::NUMERIC
    LOOP
      IF NEW.profile_data->'topArtistsByTimeRange' ? v_time_range AND jsonb_typeof(NEW.profile_data->'topArtistsByTimeRange'->v_time_range) = 'array' THEN
        FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtistsByTimeRange'->v_time_range) LOOP
          IF v_artist ? 'genres' AND jsonb_typeof(v_artist->'genres') = 'array' THEN
            FOR v_genre IN SELECT jsonb_array_elements_text(v_artist->'genres') LOOP
              v_canonical := public.resolve_genre_to_canonical(v_genre);
              IF v_canonical IS NOT NULL AND v_canonical != '' THEN
                v_count := COALESCE((genre_counts->>v_canonical)::INT, 0) + 1;
                genre_counts := genre_counts || jsonb_build_object(v_canonical, v_count);
                v_best_mult := COALESCE((genre_time_mult->>v_canonical)::NUMERIC, 0);
                IF v_time_mult > v_best_mult THEN
                  genre_time_mult := genre_time_mult || jsonb_build_object(v_canonical, v_time_mult);
                END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Fallback: use flat topArtists with medium_term multiplier
  IF genre_counts = '{}'::JSONB AND NEW.profile_data ? 'topArtists' AND jsonb_typeof(NEW.profile_data->'topArtists') = 'array' THEN
    FOR v_artist IN SELECT jsonb_array_elements(NEW.profile_data->'topArtists') LOOP
      IF v_artist ? 'genres' AND jsonb_typeof(v_artist->'genres') = 'array' THEN
        FOR v_genre IN SELECT jsonb_array_elements_text(v_artist->'genres') LOOP
          v_canonical := public.resolve_genre_to_canonical(v_genre);
          IF v_canonical IS NOT NULL AND v_canonical != '' THEN
            v_count := COALESCE((genre_counts->>v_canonical)::INT, 0) + 1;
            genre_counts := genre_counts || jsonb_build_object(v_canonical, v_count);
            genre_time_mult := genre_time_mult || jsonb_build_object(v_canonical, v_mult_med);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Insert signals for each aggregated genre
  v_occurred_at := COALESCE(NEW.last_updated::TIMESTAMPTZ, NOW());
  FOR v_genre_agg IN
    SELECT key AS canonical_genre,
           (genre_counts->>key)::INT AS cnt,
           COALESCE((genre_time_mult->>key)::NUMERIC, v_mult_med) AS mult
    FROM jsonb_object_keys(genre_counts) AS key
  LOOP
    -- weight = base * ln(frequency + 1) * time_range_multiplier
    v_weight := ROUND((v_base_weight * LN(v_genre_agg.cnt + 1) * v_genre_agg.mult)::NUMERIC, 2);
    v_weight := LEAST(v_weight, 99.99);
    v_occurred_at := v_occurred_at + (v_idx * interval '1 millisecond');
    v_idx := v_idx + 1;

    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name,
      signal_weight, genre, context, occurred_at, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      'spotify_genre'::public.preference_signal_type,
      'genre'::public.preference_entity_type,
      NULL,
      v_genre_agg.canonical_genre,
      v_weight,
      v_genre_agg.canonical_genre,
      jsonb_build_object('source', 'spotify', 'raw_genre', v_genre_agg.canonical_genre),
      v_occurred_at,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO UPDATE
    SET signal_weight = EXCLUDED.signal_weight, genre = EXCLUDED.genre, context = EXCLUDED.context, updated_at = NOW();
  END LOOP;

  -- Refresh user preferences so feed V5 picks up new genre scores
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_user_preferences_v5') THEN
    PERFORM public.refresh_user_preferences_v5(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_spotify_genres_to_signals IS 'Extracts genres from streaming_profiles, normalizes to canonical, weights by frequency and time range, inserts into user_preference_signals.';

-- ---------------------------------------------------------------------------
-- 3. Attach trigger to streaming_profiles (only if table exists)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streaming_profiles'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_process_spotify_genres_to_signals ON public.streaming_profiles;
    CREATE TRIGGER trigger_process_spotify_genres_to_signals
      AFTER INSERT OR UPDATE ON public.streaming_profiles
      FOR EACH ROW
      WHEN (NEW.service_type = 'spotify')
      EXECUTE FUNCTION public.process_spotify_genres_to_signals();
  END IF;
END $$;
